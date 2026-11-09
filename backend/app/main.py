import csv
import io
import logging
import os
import re
import secrets

from fastapi import FastAPI, Depends, HTTPException, Body, UploadFile, File, Form, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, FileResponse, Response, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import config, domain as D, services as S, jobs as J
from .auth import (hash_pin, verify_pin, new_session, current_member, is_head, is_editor, require,
                   lock_check, register_fail)
from .db import get_db, clean, clean_all, ping
from .seed import seed_whiteboard

from contextlib import asynccontextmanager

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app):
    config.warn_defaults()
    S.get_settings()
    S.ensure_slots(force=True)
    sch = J.start_scheduler() if config.ENABLE_SCHEDULER else None
    yield
    if sch:
        sch.shutdown(wait=False)


app = FastAPI(title="CRK PID Dashboard", version="1.0.0", lifespan=lifespan)


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    errs = exc.errors()
    field = ".".join(str(x) for x in errs[0].get("loc", [])[1:]) if errs else ""
    return JSONResponse(status_code=422, content={"detail": f"Data tidak valid pada kolom '{field}'. Periksa kembali isian Anda."})


# ======================= helpers =======================
def _project(pid):
    p = get_db().projects.find_one({"id": pid})
    if not p:
        raise HTTPException(404, "Proyek tidak ditemukan")
    return clean(p)


def _kandidat(kid):
    k = get_db().kandidat.find_one({"id": kid})
    if not k:
        raise HTTPException(404, "Kandidat tidak ditemukan")
    return clean(k)


def _save_project(p, fields):
    fields["updatedAt"] = D.now_utc_iso()
    get_db().projects.update_one({"id": p["id"]}, {"$set": fields})


CONTINUING = ("lolos_screening", "konsep", "prototipe", "lolos_uji")
RANK = {s: i for i, s in enumerate(["ide", "lolos_screening", "konsep", "prototipe", "lolos_uji", "launch"])}


def _set_kandidat_status(k, status):
    upd = {"status": status}
    if status in RANK and RANK[status] > RANK.get(k.get("maxStatus", "ide"), 0):
        upd["maxStatus"] = status
    get_db().kandidat.update_one({"id": k["id"]}, {"$set": upd})


def _promote_kandidat(pid, arriving):
    for k in clean_all(get_db().kandidat.find({"projectId": pid})):
        st = k["status"]
        if st not in CONTINUING:
            continue
        if arriving in (3, 4) and st == "lolos_screening":
            _set_kandidat_status(k, "konsep")
        elif arriving in (5, 6) and st in ("lolos_screening", "konsep"):
            _set_kandidat_status(k, "prototipe")
        elif arriving == 7 and st in ("lolos_screening", "konsep", "prototipe"):
            _set_kandidat_status(k, "lolos_uji")
        elif arriving == 8:
            _set_kandidat_status(k, "launch")


def _gate(p, n):
    db = get_db()
    ks = clean_all(db.kandidat.find({"projectId": p["id"]}))
    st = p["stages"][n - 1]
    settings = S.get_settings()
    if n == 1 and not ks:
        raise HTTPException(400, "Tambahkan minimal 1 kandidat ide sebelum lanjut ke Penyaringan Ide")
    if n == 2:
        live = [k for k in ks if k["status"] not in ("drop",)]
        if not live:
            raise HTTPException(400, "Tambahkan kandidat ide sebelum menyelesaikan Penyaringan Ide")
        unscored = [k["nama"] for k in live if k["status"] in ("ide", "lolos_screening") and S_total(k, settings) is None]
        if unscored:
            raise HTTPException(400, f"Lengkapi scoring untuk: {', '.join(unscored)}")
        if not any(k["status"] in CONTINUING for k in live):
            raise HTTPException(400, "Tandai minimal 1 kandidat sebagai lolos screening sebelum lanjut")
    if n in (4, 6, 7):
        if st.get("decision") != "go":
            if st.get("decision") == "revisi":
                raise HTTPException(400, "Keputusan PID Head: Revisi. Perbaiki lalu klik Minta keputusan lagi")
            raise HTTPException(400, "Minta keputusan PID Head (Go / Revisi / Drop) sebelum lanjut")
    if n == 5:
        cont = [k for k in ks if k["status"] in CONTINUING]
        if not cont:
            raise HTTPException(400, "Belum ada kandidat yang lanjut ke prototipe")
        for k in cont:
            if db.bom.count_documents({"kandidatId": k["id"]}) == 0:
                raise HTTPException(400, f"Isi BOM/resep untuk {k['nama']} sebelum lanjut ke Pengujian Prototipe")
            if not k.get("photos"):
                raise HTTPException(400, f"Upload minimal 1 foto prototipe {k['nama']} sebelum lanjut")
    if n == 6:
        d = st.get("details") or {}
        tgt = int(D.num(d.get("respondenTarget"), 30) or 0)
        act = int(D.num(d.get("respondenActual"), 0) or 0)
        if act < tgt and not st.get("decisionNote"):
            raise HTTPException(400, f"Responden baru {act} dari target {tgt}. Lengkapi responden atau minta PID Head memberi catatan")
    if n == 7:
        d = st.get("details") or {}
        missing = [lab for key, lab in (("launchDate", "launch date"), ("hargaFinal", "harga jual final"), ("hppFinal", "HPP final"))
                   if not d.get(key)]
        if missing:
            raise HTTPException(400, f"Isi {', '.join(missing)} sebelum menyelesaikan Komersialisasi")
        open_items = [h["label"] for h in p.get("handoff", []) if not h.get("done") and not h.get("na")]
        if open_items:
            raise HTTPException(400, f"Selesaikan checklist hand-off: {', '.join(open_items)}")


def S_total(k, settings):
    return D.screening_total(k.get("screeningScores") or {}, settings["screeningCriteria"])


def _next_active(p, n, direction):
    i = n + direction
    while 1 <= i <= 7 and p["stages"][i - 1]["state"] == "skipped":
        i += direction
    return i


def _project_detail(pid):
    db = get_db()
    settings = S.get_settings()
    p = _project(pid)
    ks = clean_all(db.kandidat.find({"projectId": pid}))
    for k in ks:
        k["bom"] = clean_all(db.bom.find({"kandidatId": k["id"]}))
        k["screeningTotal"] = S_total(k, settings)
        versions = sorted({l.get("versi") or "v1" for l in k["bom"]}, key=D.versi_key) or ["v1"]
        k["hppByVersi"] = {v: D.compute_hpp(k["bom"], v) for v in versions}
        latest = versions[-1]
        k["hpp"] = k["hppByVersi"].get(latest, 0)
        try:
            harga = D.num((k.get("recipe") or {}).get("hargaJual")) or D.num((k.get("concept") or {}).get("hargaTarget"))
        except ValueError:
            harga = None
        k["foodCostPct"] = round(k["hpp"] / float(harga) * 100, 1) if harga and k["hpp"] else None
        k["halalWarnings"] = []
        for l in k["bom"]:
            if l.get("vendorId"):
                v = db.vendors.find_one({"id": l["vendorId"]})
                if v:
                    l["vendorNama"] = v["nama"]
                    if _halal_warning(clean(v)):
                        k["halalWarnings"].append(v["nama"])
    kb = {pid: ks}
    ep = S.enrich_project(p, settings, kb)
    files = clean_all(db.files.find({"projectId": pid}))
    return {"project": ep, "kandidat": ks, "timeline": _timeline(pid), "files": files,
            "targetFoodCostPct": settings["targetFoodCostPct"].get(p["category"], 35)}


def _timeline(pid):
    db = get_db()
    rows = [dict(a, type="activity") for a in clean_all(db.activity.find({"projectId": pid}))]
    rows += [dict(c, type="comment") for c in clean_all(db.comments.find({"projectId": pid}))]
    rows.sort(key=lambda r: r["at"], reverse=True)
    return rows


def _halal_warning(v):
    exp = D.pdate(v.get("halalExpiry"))
    return bool(exp and (exp - D.today()).days < 30)


# ======================= health & auth =======================
@app.get("/api/health")
def health():
    return {"ok": True, "db": ping(), "time": D.now_utc_iso()}


@app.get("/api/auth/members")
def login_members():
    ms = clean_all(get_db().members.find({"active": True}))
    return [{"id": m["id"], "name": m["name"], "role": m["role"]} for m in sorted(ms, key=lambda m: m["name"].lower())]


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    role: str
    email: str = ""
    phone: str = ""
    pin: str


@app.post("/api/auth/register")
def register(body: RegisterIn):
    db = get_db()
    if body.role not in D.ROLES:
        raise HTTPException(400, "Pilih role yang tersedia")
    if not re.fullmatch(r"\d{4,6}", body.pin):
        raise HTTPException(400, "PIN harus 4–6 digit angka")
    if body.phone and not re.fullmatch(r"08\d{7,12}", body.phone):
        raise HTTPException(400, "Nomor WhatsApp harus diawali 08, contoh 081234567890")
    if body.email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", body.email):
        raise HTTPException(400, "Format email tidak valid")
    if db.members.find_one({"name": {"$regex": f"^{re.escape(body.name.strip())}$", "$options": "i"}}):
        raise HTTPException(409, "Nama sudah terdaftar. Pilih nama Anda di halaman login")
    first = db.members.count_documents({}) == 0
    if body.role == "pid_head" and not first:
        raise HTTPException(403, "Role PID Head hanya bisa diberikan Admin. Daftar dengan role lain, lalu minta Admin mengubah role Anda")
    m = {"id": D.new_id(), "name": body.name.strip(), "role": body.role, "email": body.email.strip(), "phone": body.phone.strip(),
         "pinHash": hash_pin(body.pin), "active": True, "isAdmin": first, "failedPins": 0, "lockedUntil": None,
         "createdAt": D.now_utc_iso()}
    db.members.insert_one(m)
    return {"token": new_session(m["id"]), "member": {k: m[k] for k in ("id", "name", "role", "isAdmin")}}


@app.post("/api/auth/login")
def login(body: dict = Body(...)):
    db = get_db()
    m = db.members.find_one({"id": body.get("memberId")})
    if not m or not m.get("active", True):
        raise HTTPException(404, "Nama tidak ditemukan atau tidak aktif")
    m = clean(m)
    lock_check(m)
    if not verify_pin(str(body.get("pin", "")), m["pinHash"]):
        register_fail(m)
        raise HTTPException(401, "PIN salah. Periksa kembali PIN Anda")
    db.members.update_one({"id": m["id"]}, {"$set": {"failedPins": 0, "lockedUntil": None}})
    return {"token": new_session(m["id"]), "member": {k: m[k] for k in ("id", "name", "role", "isAdmin")}}


@app.post("/api/auth/admin-login")
def admin_login(body: dict = Body(...)):
    db = get_db()
    s = S.get_settings()
    pin = str(body.get("pin", ""))
    ok = verify_pin(pin, s["adminPinHash"]) if s.get("adminPinHash") else pin == config.DEFAULT_ADMIN_PIN
    if not ok:
        raise HTTPException(401, "Admin PIN salah")
    admin = db.members.find_one({"isAdmin": True, "active": True})
    if not admin:
        raise HTTPException(404, "Belum ada Admin. Register user pertama terlebih dahulu")
    return {"token": new_session(admin["id"]), "member": {k: admin[k] for k in ("id", "name", "role", "isAdmin")}}


@app.post("/api/auth/logout")
def logout(request: Request):
    token = request.headers.get("authorization", "").replace("Bearer", "").strip()
    get_db().sessions.delete_one({"token": token})
    return {"ok": True}


@app.get("/api/state")
def state(me=Depends(current_member)):
    return S.build_state(me)


# ======================= projects =======================
class ProjectIn(BaseModel):
    nama: str = Field(min_length=2, max_length=80)
    category: str
    subType: list[str] = []
    slotId: str | None = None
    targetLaunch: str | None = None
    objective: str = ""
    picId: str | None = None


@app.post("/api/projects")
def create_project(body: ProjectIn, me=Depends(current_member)):
    require(is_editor(me))
    db = get_db()
    if body.category not in D.CATEGORIES:
        raise HTTPException(400, "Pilih kategori yang tersedia")
    if body.category == "varian_cimol" and not body.subType:
        raise HTTPException(400, "Pilih minimal 1 jenis varian: Bumbu, Isian, Kuah, atau Saos")
    target = body.targetLaunch
    slot = None
    if body.slotId:
        slot = db.slots.find_one({"id": body.slotId})
        if not slot:
            raise HTTPException(404, "Slot tidak ditemukan")
        if slot["category"] != body.category:
            raise HTTPException(400, "Slot tidak sesuai kategori proyek")
        if slot.get("projectId"):
            other = db.projects.find_one({"id": slot["projectId"]})
            if other and other.get("status") != "dropped":
                raise HTTPException(409, f"Slot sudah dipakai proyek {other['kode']}")
        target = target or f"{slot['period']}-01"
    settings = S.get_settings()
    prefix = D.project_code_prefix(body.category, target)
    used = [int(x["kode"].rsplit("-", 1)[1]) for x in db.projects.find({"kode": {"$regex": f"^{prefix}-"}}, {"kode": 1})]
    n = max(used, default=0) + 1
    kode = f"{prefix}-{n:02d}"
    stages = D.empty_stages()
    D.back_schedule(stages, target, settings["slaDays"][body.category])
    stages[0]["state"] = "in_progress"
    stages[0]["actualStart"] = D.fdate(D.today())
    now = D.now_utc_iso()
    p = {"id": D.new_id(), "kode": kode, "nama": body.nama.strip(), "category": body.category,
         "subType": body.subType if body.category == "varian_cimol" else [], "slotId": slot["id"] if slot else None,
         "targetLaunch": target, "currentStage": 1, "status": "on_track", "statusNote": "", "picId": body.picId or me["id"],
         "objective": body.objective, "stages": stages,
         "handoff": [dict(h, done=False, na=False, pic="") for h in D.DEFAULT_HANDOFF],
         "createdAt": now, "updatedAt": now, "updatedBy": me["name"], "lastActivityAt": now, "launchedAt": None}
    db.projects.insert_one(p)
    if slot:
        db.slots.update_one({"id": slot["id"]}, {"$set": {"projectId": p["id"]}})
    S.log_activity(p["id"], me, "create", note=f"Proyek dibuat ({kode})")
    return _project_detail(p["id"])


@app.get("/api/projects/{pid}")
def get_project(pid: str, me=Depends(current_member)):
    return _project_detail(pid)


@app.put("/api/projects/{pid}")
def update_project(pid: str, body: dict = Body(...), me=Depends(current_member)):
    require(is_editor(me))
    db = get_db()
    p = _project(pid)
    upd = {}
    for k in ("nama", "objective", "picId", "subType"):
        if k in body:
            upd[k] = body[k]
    if "slotId" in body and body["slotId"] != p.get("slotId"):
        if p.get("slotId"):
            db.slots.update_one({"id": p["slotId"]}, {"$set": {"projectId": None}})
        if body["slotId"]:
            slot = db.slots.find_one({"id": body["slotId"]})
            if not slot or slot["category"] != p["category"]:
                raise HTTPException(400, "Slot tidak valid untuk kategori ini")
            if slot.get("projectId") and slot["projectId"] != pid:
                other = db.projects.find_one({"id": slot["projectId"]})
                if other and other.get("status") != "dropped":
                    raise HTTPException(409, f"Slot sudah dipakai proyek {other['kode']}")
            db.slots.update_one({"id": slot["id"]}, {"$set": {"projectId": pid}})
            if "targetLaunch" not in body:
                body["targetLaunch"] = f"{slot['period']}-01"
        upd["slotId"] = body["slotId"]
    if "targetLaunch" in body and body["targetLaunch"] != p.get("targetLaunch"):
        upd["targetLaunch"] = body["targetLaunch"] or None
        stages = p["stages"]
        D.back_schedule(stages, upd["targetLaunch"], S.get_settings()["slaDays"][p["category"]],
                        keep_overrides=not body.get("resetPlanned"))
        upd["stages"] = stages
    _save_project(p, upd)
    S.log_activity(pid, me, "edit", note="Data proyek diubah: " + ", ".join(upd.keys()))
    return _project_detail(pid)


@app.post("/api/projects/{pid}/stage")
def move_stage(pid: str, body: dict = Body(...), me=Depends(current_member)):
    require(is_editor(me), "Hanya PID Supervisor / PID Head yang dapat memindahkan stage")
    p = _project(pid)
    if p["status"] in ("done", "dropped"):
        raise HTTPException(400, "Proyek sudah selesai/dropped. Reopen terlebih dahulu")
    cur = p["currentStage"]
    to = int(body.get("to", 0))
    note = (body.get("note") or "").strip()
    st = p["stages"][cur - 1]
    today = D.fdate(D.today())
    if to == cur and st["state"] == "not_started":
        st["state"], st["actualStart"] = "in_progress", today
        _save_project(p, {"stages": p["stages"], "status": "on_track"})
        S.log_activity(pid, me, "stage_start", to=cur, note=note or f"Mulai {D.STAGES[cur - 1]['nama']}")
        return _project_detail(pid)
    nxt, prv = _next_active(p, cur, 1), _next_active(p, cur, -1)
    if to == nxt:
        if st["state"] == "not_started":
            raise HTTPException(400, "Mulai stage ini terlebih dahulu")
        _gate(p, cur)
        st["state"], st["actualEnd"] = "done", today
        if nxt == 8:
            p["status"] = "done"
            _save_project(p, {"stages": p["stages"], "status": "done", "launchedAt": (st.get("details") or {}).get("launchDate") or today})
            _promote_kandidat(pid, 8)
            S.log_activity(pid, me, "launch", frm=cur, to="launch", note=note or "Komersialisasi selesai — produk launch")
            return _project_detail(pid)
        ns = p["stages"][nxt - 1]
        ns["state"], ns["actualStart"], ns["actualEnd"] = "in_progress", today, None
        ns["decision"] = None if nxt in D.DECISION_STAGES and ns.get("decision") != "go" else ns.get("decision")
        _save_project(p, {"stages": p["stages"], "currentStage": nxt,
                          "status": p["status"] if p["status"] in ("blocked",) else "on_track"})
        _promote_kandidat(pid, nxt)
        S.log_activity(pid, me, "stage_advance", frm=cur, to=nxt, note=note)
        return _project_detail(pid)
    if to == prv and prv >= 1:
        if not note:
            raise HTTPException(400, "Tulis alasan sebelum kembali ke stage sebelumnya")
        st["state"], st["actualStart"] = "not_started", None
        ps = p["stages"][prv - 1]
        ps["state"], ps["actualEnd"] = "in_progress", None
        if prv in D.DECISION_STAGES:
            ps["decision"], ps["decisionRequested"] = None, False
        _save_project(p, {"stages": p["stages"], "currentStage": prv})
        S.log_activity(pid, me, "stage_back", frm=cur, to=prv, note=note)
        return _project_detail(pid)
    raise HTTPException(400, "Stage hanya bisa maju/mundur satu langkah. Gunakan Skip stage untuk melewati stage")


@app.post("/api/projects/{pid}/skip")
def skip_stage(pid: str, body: dict = Body(...), me=Depends(current_member)):
    require(is_editor(me))
    p = _project(pid)
    reason = (body.get("reason") or "").strip()
    if not reason:
        raise HTTPException(400, "Tulis alasan skip stage")
    cur = p["currentStage"]
    if cur in (1, 7):
        raise HTTPException(400, "Stage Pencarian Ide dan Komersialisasi tidak dapat di-skip")
    nxt = _next_active(p, cur, 1)
    st = p["stages"][cur - 1]
    st.update({"state": "skipped", "skipReason": reason, "actualStart": None, "actualEnd": None})
    ns = p["stages"][nxt - 1]
    ns["state"], ns["actualStart"] = "in_progress", D.fdate(D.today())
    D.back_schedule(p["stages"], p.get("targetLaunch"), S.get_settings()["slaDays"][p["category"]])
    _save_project(p, {"stages": p["stages"], "currentStage": nxt})
    if cur <= 2:
        for k in clean_all(get_db().kandidat.find({"projectId": pid, "status": "ide"})):
            _set_kandidat_status(k, "lolos_screening")
    _promote_kandidat(pid, nxt)
    S.log_activity(pid, me, "skip", frm=cur, to=nxt, note=reason)
    return _project_detail(pid)


@app.post("/api/projects/{pid}/status")
def set_status(pid: str, body: dict = Body(...), me=Depends(current_member)):
    require(is_editor(me))
    p = _project(pid)
    status = body.get("status")
    note = (body.get("note") or "").strip()
    if status not in ("on_track", "at_risk", "blocked"):
        raise HTTPException(400, "Status hanya bisa On track, At risk, atau Blocked")
    if status in ("at_risk", "blocked") and not note:
        raise HTTPException(400, "Tulis catatan penyebab status At risk / Blocked")
    if p["status"] in ("done", "dropped"):
        raise HTTPException(400, "Proyek sudah selesai/dropped")
    _save_project(p, {"status": status, "statusNote": note})
    S.log_activity(pid, me, "status_change", frm=p["status"], to=status, note=note)
    return _project_detail(pid)


@app.post("/api/projects/{pid}/reopen")
def reopen(pid: str, body: dict = Body(default={}), me=Depends(current_member)):
    require(is_head(me), "Hanya PID Head yang dapat reopen proyek")
    p = _project(pid)
    if p["status"] != "dropped":
        raise HTTPException(400, "Hanya proyek dropped yang dapat di-reopen")
    st = p["stages"][p["currentStage"] - 1]
    st["decision"], st["decisionRequested"] = None, False
    _save_project(p, {"status": "on_track", "stages": p["stages"]})
    S.log_activity(pid, me, "reopen", note=body.get("note") or "Proyek dibuka kembali")
    return _project_detail(pid)


@app.post("/api/projects/{pid}/request-decision")
def request_decision(pid: str, body: dict = Body(default={}), me=Depends(current_member)):
    require(is_editor(me) or me["role"] == "pid_staff")
    p = _project(pid)
    cur = p["currentStage"]
    if cur not in D.DECISION_STAGES:
        raise HTTPException(400, "Stage ini tidak membutuhkan keputusan PID Head")
    st = p["stages"][cur - 1]
    if st["state"] != "in_progress":
        raise HTTPException(400, "Mulai stage ini terlebih dahulu")
    st["decisionRequested"], st["decision"] = True, None
    _save_project(p, {"stages": p["stages"]})
    S.log_activity(pid, me, "decision_request", to=cur, note=body.get("note"))
    heads = [m["email"] for m in clean_all(get_db().members.find({"role": "pid_head", "active": True}))]
    J.send_email(heads, f"Keputusan dibutuhkan: {p['nama']}",
                 f"{me['name']} meminta keputusan Go / Revisi / Drop untuk {p['nama']} ({p['kode']}) di stage "
                 f"{D.STAGES[cur - 1]['roman']} {D.STAGES[cur - 1]['nama']}.\n{body.get('note') or ''}")
    return _project_detail(pid)


@app.post("/api/projects/{pid}/decision")
def decide(pid: str, body: dict = Body(...), me=Depends(current_member)):
    require(is_head(me), "Hanya PID Head yang dapat memberi keputusan Go / Revisi / Drop")
    db = get_db()
    p = _project(pid)
    cur = p["currentStage"]
    dec = body.get("decision")
    if dec not in ("go", "revisi", "drop"):
        raise HTTPException(400, "Pilih keputusan Go, Revisi, atau Drop")
    if cur not in D.DECISION_STAGES:
        raise HTTPException(400, "Stage ini tidak membutuhkan keputusan")
    st = p["stages"][cur - 1]
    if st["state"] != "in_progress" or p["status"] in ("done", "dropped"):
        raise HTTPException(400, "Keputusan hanya bisa diberikan pada stage yang sedang berjalan")
    st.update({"decision": dec, "decisionNote": body.get("note") or "", "decidedBy": me["name"], "decidedAt": D.now_utc_iso(),
               "decisionRequested": False})
    for kid, kdec in (body.get("kandidat") or {}).items():
        k = db.kandidat.find_one({"id": kid, "projectId": pid})
        if k and kdec == "drop":
            _set_kandidat_status(clean(k), "drop")
    upd = {"stages": p["stages"]}
    if dec == "drop":
        upd["status"] = "dropped"
        if p.get("slotId"):
            db.slots.update_one({"id": p["slotId"]}, {"$set": {"projectId": None}})
            upd["slotId"] = None
        for k in clean_all(db.kandidat.find({"projectId": pid, "status": {"$in": list(CONTINUING)}})):
            _set_kandidat_status(k, "drop")
    _save_project(p, upd)
    S.log_activity(pid, me, "decision", to=dec, note=body.get("note"))
    return _project_detail(pid)


@app.put("/api/projects/{pid}/stages/{n}")
def update_stage(pid: str, n: int, body: dict = Body(...), me=Depends(current_member)):
    if not 1 <= n <= 7:
        raise HTTPException(400, "Stage tidak valid")
    staff_ok = me["role"] == "pid_staff" and n in (5, 6)
    require(is_editor(me) or staff_ok)
    p = _project(pid)
    st = p["stages"][n - 1]
    if "plannedStart" in body or "plannedEnd" in body:
        require(is_editor(me))
        st["plannedStart"] = body.get("plannedStart", st["plannedStart"])
        st["plannedEnd"] = body.get("plannedEnd", st["plannedEnd"])
        if st["plannedStart"] and st["plannedEnd"] and st["plannedStart"] > st["plannedEnd"]:
            raise HTTPException(400, "Tanggal mulai harus sebelum tanggal selesai")
        st["plannedOverride"] = True
    if body.get("resetPlanned"):
        st["plannedOverride"] = False
        D.back_schedule(p["stages"], p.get("targetLaunch"), S.get_settings()["slaDays"][p["category"]])
    if "notes" in body:
        st["notes"] = body["notes"]
    if "details" in body and isinstance(body["details"], dict):
        det = dict(st.get("details") or {})
        det.update(body["details"])
        if n == 7:
            try:
                hf, hp = D.num(det.get("hargaFinal")), D.num(det.get("hppFinal"))
            except ValueError as e:
                raise HTTPException(400, str(e))
            det["foodCostPct"] = round(hp / hf * 100, 1) if hf and hp else None
        st["details"] = det
    _save_project(p, {"stages": p["stages"]})
    S.log_activity(pid, me, "edit", to=n, note=f"Update data stage {D.STAGES[n - 1]['roman']}")
    return _project_detail(pid)


@app.put("/api/projects/{pid}/handoff")
def update_handoff(pid: str, body: dict = Body(...), me=Depends(current_member)):
    require(is_editor(me))
    p = _project(pid)
    items = body.get("items")
    if not isinstance(items, list):
        raise HTTPException(400, "Format checklist tidak valid")
    _save_project(p, {"handoff": items})
    S.log_activity(pid, me, "edit", note="Update checklist hand-off")
    return _project_detail(pid)


@app.delete("/api/projects/{pid}")
def delete_project(pid: str, me=Depends(current_member)):
    require(me.get("isAdmin"), "Hanya Admin yang dapat menghapus proyek")
    db = get_db()
    p = _project(pid)
    if p.get("slotId"):
        db.slots.update_one({"id": p["slotId"]}, {"$set": {"projectId": None}})
    kids = [k["id"] for k in db.kandidat.find({"projectId": pid})]
    db.bom.delete_many({"kandidatId": {"$in": kids}})
    db.kandidat.delete_many({"projectId": pid})
    db.projects.delete_one({"id": pid})
    return {"ok": True}


@app.get("/api/projects/{pid}/timeline")
def timeline(pid: str, me=Depends(current_member)):
    return _timeline(pid)


@app.post("/api/projects/{pid}/comments")
def comment(pid: str, body: dict = Body(...), me=Depends(current_member)):
    p = _project(pid)
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "Komentar tidak boleh kosong")
    db = get_db()
    c = {"id": D.new_id(), "projectId": pid, "kandidatId": body.get("kandidatId"), "byId": me["id"], "byName": me["name"],
         "at": D.now_utc_iso(), "text": text}
    db.comments.insert_one(c)
    db.projects.update_one({"id": pid}, {"$set": {"lastActivityAt": c["at"]}})
    mentioned = [m for m in clean_all(db.members.find({"active": True})) if f"@{m['name'].lower()}" in text.lower()]
    if mentioned:
        J.send_email([m["email"] for m in mentioned], f"{me['name']} menyebut Anda di {p['nama']}", text)
    return clean(c)


# ======================= kandidat & BOM =======================
KANDIDAT_EDITOR_FIELDS = {"nama", "deskripsi", "sumberIde", "sumberDetail", "referensi", "status", "estHargaJual", "estHpp",
                          "concept", "recipe", "testResult", "photos"}
KANDIDAT_STAFF_FIELDS = {"recipe", "testResult", "photos"}


@app.post("/api/kandidat")
def add_kandidat(body: dict = Body(...), me=Depends(current_member)):
    require(is_editor(me))
    p = _project(body.get("projectId", ""))
    nama = (body.get("nama") or "").strip()
    if len(nama) < 2:
        raise HTTPException(400, "Isi nama kandidat ide")
    k = {"id": D.new_id(), "projectId": p["id"], "nama": nama, "deskripsi": body.get("deskripsi", ""),
         "sumberIde": body.get("sumberIde") or "Internal", "sumberDetail": body.get("sumberDetail", ""),
         "referensi": body.get("referensi") or [], "status": "ide", "maxStatus": "ide", "screeningScores": {},
         "estHargaJual": None, "estHpp": None, "concept": {}, "recipe": {}, "testResult": {}, "photos": [],
         "createdAt": D.now_utc_iso()}
    get_db().kandidat.insert_one(k)
    S.log_activity(p["id"], me, "kandidat_add", note=f"Kandidat ditambahkan: {nama}", kandidat_id=k["id"])
    return clean(k)


@app.put("/api/kandidat/{kid}")
def update_kandidat(kid: str, body: dict = Body(...), me=Depends(current_member)):
    k = _kandidat(kid)
    allowed = KANDIDAT_EDITOR_FIELDS if is_editor(me) else KANDIDAT_STAFF_FIELDS if me["role"] == "pid_staff" else set()
    bad = set(body) - allowed
    require(not bad and bool(allowed))
    if "status" in body and body["status"] not in D.KANDIDAT_STATUSES:
        raise HTTPException(400, "Status kandidat tidak valid")
    upd = {}
    for key, v in body.items():
        if key in ("concept", "recipe", "testResult") and isinstance(v, dict):
            merged = dict(k.get(key) or {})
            merged.update(v)
            upd[key] = merged
        else:
            upd[key] = v
    if "status" in body:
        upd["statusManual"] = True
    get_db().kandidat.update_one({"id": kid}, {"$set": upd})
    if "status" in body:
        _set_kandidat_status(k, body["status"])
    S.log_activity(k["projectId"], me, "kandidat_edit", note=f"Update kandidat {k['nama']}: {', '.join(body)}", kandidat_id=kid)
    return {"ok": True}


@app.delete("/api/kandidat/{kid}")
def delete_kandidat(kid: str, me=Depends(current_member)):
    require(is_editor(me))
    k = _kandidat(kid)
    get_db().bom.delete_many({"kandidatId": kid})
    get_db().kandidat.delete_one({"id": kid})
    S.log_activity(k["projectId"], me, "kandidat_delete", note=f"Kandidat dihapus: {k['nama']}")
    return {"ok": True}


@app.put("/api/kandidat/{kid}/scores")
def score_kandidat(kid: str, body: dict = Body(...), me=Depends(current_member)):
    require(is_editor(me))
    k = _kandidat(kid)
    settings = S.get_settings()
    try:
        scores = {key: D.num(v) for key, v in (body.get("scores") or {}).items() if v not in (None, "")}
    except ValueError as e:
        raise HTTPException(400, str(e))
    for c in settings["screeningCriteria"]:
        v = scores.get(c["id"])
        if v is not None and not (1 <= float(v) <= 5):
            raise HTTPException(400, "Skor harus 1–5")
    total = D.screening_total(scores, settings["screeningCriteria"])
    upd = {"screeningScores": scores, "screeningTotal": total}
    for f in ("estHargaJual", "estHpp"):
        if f in body:
            upd[f] = D.num(body[f])
    suggested = None
    auto = k["status"] in ("ide", "lolos_screening", "gugur") and not k.get("statusManual")
    if total is not None:
        suggested = "lolos_screening" if total >= settings["screeningPassScore"] else "gugur"
    elif auto and k["status"] != "ide":
        upd["status"] = "ide"
    if suggested and auto:
        upd["status"] = suggested
        if suggested == "lolos_screening" and RANK.get(k.get("maxStatus", "ide"), 0) < 1:
            upd["maxStatus"] = "lolos_screening"
    get_db().kandidat.update_one({"id": kid}, {"$set": upd})
    S.log_activity(k["projectId"], me, "score", note=f"Scoring {k['nama']}: {total}", kandidat_id=kid)
    return {"ok": True, "screeningTotal": total, "suggested": suggested}


def _validate_bom(k, body):
    db = get_db()
    p = _project(k["projectId"])
    vid = body.get("vendorId") or None
    if vid:
        v = db.vendors.find_one({"id": vid})
        if not v:
            raise HTTPException(404, "Vendor tidak ditemukan")
        if v.get("statusVendor") == "blacklist":
            raise HTTPException(400, f"Vendor {v['nama']} berstatus blacklist dan tidak dapat dipilih")
    elif p["category"] == "online_food" and not body.get("inhouse"):
        raise HTTPException(400, "Bahan Online Food wajib memilih vendor (atau tandai in-house)")
    if not (body.get("bahan") or "").strip():
        raise HTTPException(400, "Isi nama bahan")
    if body.get("unit", "g") not in ("g", "ml", "pcs"):
        raise HTTPException(400, "Satuan harus g, ml, atau pcs")
    try:
        qty, harga = D.num(body.get("qty"), 0), D.num(body.get("hargaPerUnit"), 0)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if qty <= 0:
        raise HTTPException(400, "Isi qty bahan per porsi lebih dari 0")
    if harga < 0:
        raise HTTPException(400, "Harga bahan tidak boleh negatif")
    return {"bahan": body["bahan"].strip(), "vendorId": vid, "inhouse": bool(body.get("inhouse")),
            "qty": qty, "unit": body.get("unit", "g"), "hargaPerUnit": harga, "versi": (body.get("versi") or "v1").strip()}


@app.post("/api/kandidat/{kid}/bom")
def add_bom(kid: str, body: dict = Body(...), me=Depends(current_member)):
    require(is_editor(me) or me["role"] == "pid_staff")
    k = _kandidat(kid)
    line = _validate_bom(k, body)
    line.update({"id": D.new_id(), "kandidatId": kid})
    line["biayaPerPorsi"] = round(D.bom_line_cost(line), 2)
    get_db().bom.insert_one(line)
    S.log_activity(k["projectId"], me, "bom", note=f"BOM {k['nama']}: + {line['bahan']}", kandidat_id=kid)
    return clean(line)


@app.put("/api/bom/{lid}")
def update_bom(lid: str, body: dict = Body(...), me=Depends(current_member)):
    require(is_editor(me) or me["role"] == "pid_staff")
    db = get_db()
    l = db.bom.find_one({"id": lid})
    if not l:
        raise HTTPException(404, "Baris BOM tidak ditemukan")
    k = _kandidat(l["kandidatId"])
    merged = {**clean(l), **body}
    line = _validate_bom(k, merged)
    line["biayaPerPorsi"] = round(D.bom_line_cost(line), 2)
    db.bom.update_one({"id": lid}, {"$set": line})
    return {"ok": True}


@app.delete("/api/bom/{lid}")
def delete_bom(lid: str, me=Depends(current_member)):
    require(is_editor(me) or me["role"] == "pid_staff")
    get_db().bom.delete_one({"id": lid})
    return {"ok": True}


# ======================= vendors =======================
VENDOR_FIELDS = ["nama", "kategoriBahan", "produkBahan", "kontakNama", "kontakHp", "email", "alamat", "kota", "moq",
                 "leadTimeHari", "termin", "sertifikatHalal", "halalNomor", "halalExpiry", "statusVendor", "rating", "catatan",
                 "attachments"]


def _vendor_out(v):
    v = clean(v)
    v["halalWarning"] = _halal_warning(v)
    db = get_db()
    kids = {l["kandidatId"] for l in db.bom.find({"vendorId": v["id"]})}
    pids = {k["projectId"] for k in db.kandidat.find({"id": {"$in": list(kids)}})}
    v["usedIn"] = [{"id": p["id"], "kode": p["kode"], "nama": p["nama"]} for p in db.projects.find({"id": {"$in": list(pids)}})]
    return v


@app.get("/api/vendors")
def list_vendors(kategori: str = "", status: str = "", me=Depends(current_member)):
    q = {}
    if kategori:
        q["kategoriBahan"] = kategori
    if status:
        q["statusVendor"] = status
    vs = [_vendor_out(v) for v in get_db().vendors.find(q)]
    return sorted(vs, key=lambda v: v["nama"].lower())


@app.post("/api/vendors")
def create_vendor(body: dict = Body(...), me=Depends(current_member)):
    require(is_editor(me))
    if len((body.get("nama") or "").strip()) < 2:
        raise HTTPException(400, "Isi nama vendor")
    if body.get("statusVendor", "prospek") not in D.VENDOR_STATUSES:
        raise HTTPException(400, "Status vendor tidak valid")
    if body.get("kontakHp") and not re.fullmatch(r"(08|628)\d{7,12}", body["kontakHp"]):
        raise HTTPException(400, "Nomor HP vendor harus diawali 08, contoh 081234567890")
    v = {k: body.get(k) for k in VENDOR_FIELDS}
    v.update({"id": D.new_id(), "statusVendor": body.get("statusVendor") or "prospek", "updatedAt": D.now_utc_iso(),
              "produkBahan": body.get("produkBahan") or [], "attachments": body.get("attachments") or []})
    get_db().vendors.insert_one(v)
    return _vendor_out(get_db().vendors.find_one({"id": v["id"]}))


@app.put("/api/vendors/{vid}")
def update_vendor(vid: str, body: dict = Body(...), me=Depends(current_member)):
    require(is_editor(me))
    db = get_db()
    if not db.vendors.find_one({"id": vid}):
        raise HTTPException(404, "Vendor tidak ditemukan")
    if "statusVendor" in body and body["statusVendor"] not in D.VENDOR_STATUSES:
        raise HTTPException(400, "Status vendor tidak valid")
    upd = {k: body[k] for k in VENDOR_FIELDS if k in body}
    upd["updatedAt"] = D.now_utc_iso()
    db.vendors.update_one({"id": vid}, {"$set": upd})
    return _vendor_out(db.vendors.find_one({"id": vid}))


@app.delete("/api/vendors/{vid}")
def delete_vendor(vid: str, me=Depends(current_member)):
    require(is_head(me), "Hanya PID Head / Admin yang dapat menghapus vendor")
    if get_db().bom.count_documents({"vendorId": vid}):
        raise HTTPException(400, "Vendor masih dipakai di BOM. Ubah status menjadi blacklist bila tidak dipakai lagi")
    get_db().vendors.delete_one({"id": vid})
    return {"ok": True}


# ======================= files =======================
@app.post("/api/files")
async def upload_file(file: UploadFile = File(...), projectId: str = Form(""), kandidatId: str = Form(""),
                      vendorId: str = Form(""), kind: str = Form("photo"), me=Depends(current_member)):
    require(me["role"] != "viewer", "Viewer tidak dapat upload file")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "Ukuran file maksimal 10 MB")
    fid = D.new_id()
    ext = os.path.splitext(file.filename or "")[1].lower() or ".bin"
    ctype = file.content_type or "application/octet-stream"
    if ctype.startswith("image/"):
        try:
            from PIL import Image, ImageOps
            img = ImageOps.exif_transpose(Image.open(io.BytesIO(data)))
            img.thumbnail((1600, 1600))
            buf = io.BytesIO()
            img.convert("RGB").save(buf, "JPEG", quality=85)
            data, ext, ctype = buf.getvalue(), ".jpg", "image/jpeg"
        except Exception:
            pass
    os.makedirs(config.UPLOAD_DIR, exist_ok=True)
    path = os.path.join(config.UPLOAD_DIR, fid + ext)
    with open(path, "wb") as f:
        f.write(data)
    meta = {"id": fid, "name": file.filename, "path": path, "contentType": ctype, "size": len(data), "kind": kind,
            "projectId": projectId or None, "kandidatId": kandidatId or None, "vendorId": vendorId or None,
            "byName": me["name"], "at": D.now_utc_iso(), "url": f"/api/files/{fid}"}
    get_db().files.insert_one(meta)
    return clean(meta)


@app.get("/api/files/{fid}")
def get_file(fid: str):
    m = get_db().files.find_one({"id": fid})
    if not m or not os.path.exists(m["path"]):
        raise HTTPException(404, "File tidak ditemukan")
    return FileResponse(m["path"], media_type=m["contentType"], filename=m.get("name"))


# ======================= slots =======================
@app.post("/api/slots")
def add_slot(body: dict = Body(...), me=Depends(current_member)):
    require(is_head(me), "Hanya PID Head yang dapat mengatur slot launch")
    cat, period = body.get("category"), body.get("period")
    if cat not in D.CATEGORIES or not re.fullmatch(r"\d{4}-\d{2}", period or ""):
        raise HTTPException(400, "Isi kategori dan bulan slot (YYYY-MM)")
    s = {"id": D.new_id(), "category": cat, "period": period, "label": f"{D.CATEGORIES[cat]['label']} {D.period_label(period)}",
         "projectId": None, "note": body.get("note", ""), "auto": False}
    get_db().slots.insert_one(s)
    return clean(s)


@app.put("/api/slots/{sid}")
def update_slot(sid: str, body: dict = Body(...), me=Depends(current_member)):
    require(is_head(me), "Hanya PID Head yang dapat mengatur slot launch")
    db = get_db()
    s = db.slots.find_one({"id": sid})
    if not s:
        raise HTTPException(404, "Slot tidak ditemukan")
    upd = {"auto": False}
    if body.get("period"):
        upd["period"] = body["period"]
        upd["label"] = f"{D.CATEGORIES[s['category']]['label']} {D.period_label(body['period'])}"
    if "note" in body:
        upd["note"] = body["note"]
    db.slots.update_one({"id": sid}, {"$set": upd})
    return clean(db.slots.find_one({"id": sid}))


@app.delete("/api/slots/{sid}")
def delete_slot(sid: str, me=Depends(current_member)):
    require(is_head(me), "Hanya PID Head yang dapat mengatur slot launch")
    db = get_db()
    s = db.slots.find_one({"id": sid})
    if s and s.get("projectId"):
        p = db.projects.find_one({"id": s["projectId"]})
        if p and p.get("status") != "dropped":
            raise HTTPException(400, "Slot masih dipakai proyek. Pindahkan proyek ke slot lain terlebih dahulu")
    if s:
        db.settings.update_one({"id": "settings"}, {"$addToSet": {"suppressedSlots": f"{s['category']}|{s['period']}"}})
    db.slots.delete_one({"id": sid})
    return {"ok": True}


# ======================= reporting (public) =======================
def _check_token(t):
    if not t or not secrets.compare_digest(t, S.get_settings()["shareToken"]):
        raise HTTPException(404, "Link laporan tidak valid")


@app.get("/api/report")
def report(t: str = ""):
    _check_token(t)
    return S.report_payload()


@app.get("/api/report/weekly-text", response_class=PlainTextResponse)
def report_weekly(t: str = ""):
    _check_token(t)
    return S.report_payload()["weeklyText"]


@app.get("/api/public-metrics")
def public_metrics(key: str = ""):
    if not secrets.compare_digest(key or "", config.METRICS_API_KEY):
        raise HTTPException(401, "Metrics key tidak valid")
    r = S.report_payload()
    sm = r["summary"]
    return {"activeProjects": sm["activeProjects"], "onTrackPct": sm["onTrackPct"], "overSla": sm["overSla"],
            "nextLaunch": {"name": sm["nextLaunch"]["nama"], "date": sm["nextLaunch"]["date"]} if sm["nextLaunch"] else None,
            "launchesYtd": sm["launchesYtd"], "launchTargetYtd": sm["launchTargetYtd"], "emptySlotsNext3m": sm["emptySlotsNext3m"]}


# ======================= admin =======================
@app.put("/api/settings")
def update_settings(body: dict = Body(...), me=Depends(current_member)):
    require(is_head(me), "Hanya PID Head / Admin yang dapat mengubah Settings")
    allowed = {"appName", "slaDays", "cadence", "launchTargetPerYear", "screeningCriteria", "screeningPassScore",
               "targetFoodCostPct", "slotStart", "digestTime", "nudgeTime", "weeklyDay", "weeklyTime", "workDays", "adminEmail", "stalledDays"}
    upd = {k: v for k, v in body.items() if k in allowed}
    if "slaDays" in upd:
        for cat, arr in upd["slaDays"].items():
            if cat not in D.CATEGORIES or len(arr) != 7 or any(int(x) < 1 for x in arr):
                raise HTTPException(400, "SLA harus 7 angka (hari) ≥ 1 untuk setiap kategori")
            upd["slaDays"][cat] = [int(x) for x in arr]
    if "screeningCriteria" in upd and sum(float(c.get("weight", 0)) for c in upd["screeningCriteria"]) <= 0:
        raise HTTPException(400, "Total bobot kriteria screening harus lebih dari 0")
    get_db().settings.update_one({"id": "settings"}, {"$set": upd})
    if "cadence" in upd:
        S.ensure_slots(force=True)
    if "slaDays" in upd:
        settings = S.get_settings()
        for p in clean_all(get_db().projects.find({"status": {"$nin": ["done", "dropped"]}})):
            D.back_schedule(p["stages"], p.get("targetLaunch"), settings["slaDays"][p["category"]])
            get_db().projects.update_one({"id": p["id"]}, {"$set": {"stages": p["stages"]}})
    return S.public_settings(S.get_settings())


@app.post("/api/settings/share-token")
def regen_token(me=Depends(current_member)):
    require(is_head(me))
    tok = secrets.token_urlsafe(24)
    get_db().settings.update_one({"id": "settings"}, {"$set": {"shareToken": tok}})
    return {"shareToken": tok}


@app.put("/api/settings/admin-pin")
def set_admin_pin(body: dict = Body(...), me=Depends(current_member)):
    require(me.get("isAdmin"), "Hanya Admin")
    pin = str(body.get("pin", ""))
    if not re.fullmatch(r"\d{4,6}", pin):
        raise HTTPException(400, "Admin PIN harus 4–6 digit angka")
    get_db().settings.update_one({"id": "settings"}, {"$set": {"adminPinHash": hash_pin(pin)}})
    return {"ok": True}


@app.put("/api/members/{mid}")
def update_member(mid: str, body: dict = Body(...), me=Depends(current_member)):
    self_edit = mid == me["id"] and set(body) <= {"email", "phone"}
    require(me.get("isAdmin") or self_edit, "Hanya Admin yang dapat mengubah member")
    upd = {k: body[k] for k in ("role", "active", "isAdmin", "email", "phone", "name") if k in body}
    if "role" in upd and upd["role"] not in D.ROLES:
        raise HTTPException(400, "Role tidak valid")
    if upd.get("active") is False or upd.get("isAdmin") is False:
        target = get_db().members.find_one({"id": mid})
        admins = get_db().members.count_documents({"isAdmin": True, "active": True})
        if target and target.get("isAdmin") and admins <= 1:
            raise HTTPException(400, "Tidak bisa menonaktifkan / mencabut Admin terakhir. Jadikan member lain Admin terlebih dahulu")
    get_db().members.update_one({"id": mid}, {"$set": upd})
    if upd.get("active") is False:
        get_db().sessions.delete_many({"memberId": mid})
    return {"ok": True}


@app.post("/api/members/{mid}/reset-pin")
def reset_pin(mid: str, body: dict = Body(...), me=Depends(current_member)):
    require(me.get("isAdmin"), "Hanya Admin yang dapat reset PIN")
    pin = str(body.get("pin", ""))
    if not re.fullmatch(r"\d{4,6}", pin):
        raise HTTPException(400, "PIN baru harus 4–6 digit angka")
    get_db().members.update_one({"id": mid}, {"$set": {"pinHash": hash_pin(pin), "failedPins": 0, "lockedUntil": None}})
    return {"ok": True}


@app.post("/api/jobs/{name}/run")
def run_job(name: str, me=Depends(current_member)):
    require(me.get("isAdmin") or is_head(me))
    if name not in J.JOBS:
        raise HTTPException(404, "Job tidak dikenal")
    return J.JOBS[name](force=True)


@app.post("/api/seed/whiteboard")
def seed(me=Depends(current_member)):
    require(me.get("isAdmin"), "Hanya Admin")
    res = seed_whiteboard(me)
    if not res["ok"]:
        raise HTTPException(400, res["message"])
    return res


def _csv(rows, cols):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(cols)
    for r in rows:
        w.writerow([r.get(c, "") if not isinstance(r.get(c), (list, dict)) else "; ".join(map(str, r.get(c))) if isinstance(r.get(c), list) else str(r.get(c)) for c in cols])
    return buf.getvalue()


@app.get("/api/export/{name}.csv")
def export(name: str, me=Depends(current_member)):
    require(me.get("isAdmin") or is_head(me))
    db = get_db()
    if name == "projects":
        projects, _ = S.all_projects_enriched()
        rows = [dict(p, stage=f"{D.STAGES[p['currentStage'] - 1]['roman']} {p['stageName']}",
                     statusEfektif=p["flags"]["effectiveStatus"], lewatSla=p["flags"]["lewatSla"],
                     kategori=D.CATEGORIES[p["category"]]["label"]) for p in projects]
        out = _csv(rows, ["kode", "nama", "kategori", "subType", "targetLaunch", "stage", "status", "statusEfektif", "lewatSla",
                          "statusNote", "objective", "updatedAt", "updatedBy"])
    elif name == "kandidat":
        pm = {p["id"]: p["kode"] for p in db.projects.find({})}
        rows = [dict(clean(k), proyek=pm.get(k["projectId"])) for k in db.kandidat.find({})]
        out = _csv(rows, ["proyek", "nama", "deskripsi", "sumberIde", "sumberDetail", "status", "screeningTotal", "estHargaJual", "estHpp"])
    elif name == "vendors":
        out = _csv(clean_all(db.vendors.find({})), VENDOR_FIELDS[:-1])
    else:
        raise HTTPException(404, "Export tidak dikenal")
    return Response("﻿" + out, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="pid-{name}-{D.fdate(D.today())}.csv"'})


# ======================= static frontend =======================
static_dir = os.path.abspath(config.STATIC_DIR)
if os.path.isdir(static_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(static_dir, "assets")), name="assets") if os.path.isdir(
        os.path.join(static_dir, "assets")) else None

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404, "Endpoint tidak ditemukan")
        candidate = os.path.join(static_dir, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(static_dir, "index.html"))
