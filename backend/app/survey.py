"""Public respondent survey for stage VI (Pengujian Prototipe) — opened via link / QR code."""
import csv
import io
import secrets
from collections import defaultdict

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import Response

from . import domain as D, services as S
from .auth import current_member, is_editor, is_head, require
from .db import get_db, clean, clean_all
from . import wa as WA

router = APIRouter()
INTENTS = ("pasti", "mungkin", "tidak")
ACTIVE_K = ("lolos_screening", "konsep", "prototipe", "lolos_uji")


def _project(pid):
    p = get_db().projects.find_one({"id": pid})
    if not p:
        raise HTTPException(404, "Proyek tidak ditemukan")
    return clean(p)


def _target(det):
    try:
        return int(D.num(det.get("respondenTarget"), 30) or 30)
    except ValueError:
        return 30


def _status(survey, p):
    """Returns (open, reason)."""
    det = p["stages"][5].get("details") or {}
    count = get_db().responses.count_documents({"surveyId": survey["id"]})
    if not survey.get("open"):
        return False, "Survey ditutup oleh tim PID"
    if p.get("status") in ("done", "dropped"):
        return False, "Proyek sudah selesai"
    if count >= _target(det) and not survey.get("allowOverTarget"):
        return False, "Target responden sudah tercapai. Terima kasih!"
    end = D.pdate(det.get("tanggalSelesai"))
    if end and D.today() > end:
        return False, "Periode pengujian sudah berakhir"
    return True, None


def _survey_info(pid):
    db = get_db()
    sv = db.surveys.find_one({"projectId": pid})
    if not sv:
        return None
    sv = clean(sv)
    p = _project(pid)
    open_, reason = _status(sv, p)
    return {"token": sv["token"], "open": open_, "manualOpen": sv.get("open"), "reason": reason,
            "count": db.responses.count_documents({"surveyId": sv["id"]}),
            "target": _target(p["stages"][5].get("details") or {}), "url": f"/survey/{sv['token']}",
            "allowOverTarget": bool(sv.get("allowOverTarget"))}


def _kandidat_for(pid):
    ks = clean_all(get_db().kandidat.find({"projectId": pid, "status": {"$in": list(ACTIVE_K)}}))
    out = []
    for k in ks:
        porsi = [r.get("nama") for r in ((k.get("recipe") or {}).get("porsi") or []) if r.get("nama")]
        out.append({"id": k["id"], "nama": (k.get("concept") or {}).get("namaProduk") or k["nama"], "porsi": porsi,
                    "foto": (k.get("photos") or [None])[0]})
    return out


def recompute(pid):
    """Aggregate all survey responses into kandidat.testResult.prototipe and stage VI respondenActual."""
    db = get_db()
    sv = db.surveys.find_one({"projectId": pid})
    if not sv:
        return
    rows = clean_all(db.responses.find({"surveyId": sv["id"]}))
    per = defaultdict(list)
    for r in rows:
        for a in r.get("answers", []):
            per[a["kandidatId"]].append(dict(a, at=r["at"]))
    for kid, ans in per.items():
        k = db.kandidat.find_one({"id": kid})
        if not k:
            continue

        def avg(key, xs=ans):
            v = [a[key] for a in xs if isinstance(a.get(key), (int, float))]
            return round(sum(v) / len(v), 2) if v else None

        n = len(ans)
        intents = [a.get("intent") for a in ans if a.get("intent") in INTENTS]
        price = [a.get("priceOk") for a in ans if isinstance(a.get("priceOk"), bool)]
        comments = [a["comment"].strip() for a in sorted(ans, key=lambda a: a["at"], reverse=True) if (a.get("comment") or "").strip()]
        by_porsi = {}
        for nama in sorted({a.get("porsi") for a in ans if a.get("porsi")}):
            xs = [a for a in ans if a.get("porsi") == nama]
            ins = [a.get("intent") for a in xs if a.get("intent") in INTENTS]
            by_porsi[nama] = {"n": len(xs), "rasa": avg("rasa", xs), "porsi": avg("porsiScore", xs),
                              "intentPasti": round(ins.count("pasti") / len(ins) * 100) if ins else None}
        agg = {
            "source": "survey", "n": n, "rasa": avg("rasa"), "tekstur": avg("tekstur"), "porsi": avg("porsiScore"),
            "harga": avg("harga"),
            "intentPasti": round(intents.count("pasti") / len(intents) * 100) if intents else None,
            "intentMungkin": round(intents.count("mungkin") / len(intents) * 100) if intents else None,
            "intentTidak": round(intents.count("tidak") / len(intents) * 100) if intents else None,
            "priceAcceptance": round(sum(price) / len(price) * 100) if price else None,
            "feedback": "\n".join(f"• {c}" for c in comments[:3]),
            "byPorsi": by_porsi,
        }
        tr = dict(k.get("testResult") or {})
        tr["prototipe"] = {**(tr.get("prototipe") or {}), **agg}
        db.kandidat.update_one({"id": kid}, {"$set": {"testResult": tr}})
    p = _project(pid)
    p["stages"][5]["details"] = {**(p["stages"][5].get("details") or {}), "respondenActual": len(rows), "respondenSource": "survey"}
    db.projects.update_one({"id": pid}, {"$set": {"stages": p["stages"]}})


# ---------------- team endpoints ----------------
@router.post("/api/projects/{pid}/survey")
def manage_survey(pid: str, body: dict = Body(default={}), me=Depends(current_member)):
    require(is_editor(me), "Hanya PID Supervisor / Head yang dapat mengatur survey")
    db = get_db()
    p = _project(pid)
    sv = db.surveys.find_one({"projectId": pid})
    action = body.get("action", "open")
    if not sv:
        sv = {"id": D.new_id(), "projectId": pid, "token": secrets.token_urlsafe(9), "open": False,
              "allowOverTarget": False, "createdAt": D.now_utc_iso()}
        db.surveys.insert_one(sv)
    upd = {}
    if action == "open":
        if not _kandidat_for(pid):
            raise HTTPException(400, "Belum ada kandidat yang lanjut ke pengujian prototipe")
        upd["open"] = True
    elif action == "close":
        upd["open"] = False
    elif action == "regenerate":
        upd["token"] = secrets.token_urlsafe(9)
    if "allowOverTarget" in body:
        upd["allowOverTarget"] = bool(body["allowOverTarget"])
    if upd:
        db.surveys.update_one({"id": sv["id"]}, {"$set": upd})
    S.log_activity(pid, me, "survey", to=6, note={"open": "Survey responden dibuka", "close": "Survey responden ditutup",
                                                     "regenerate": "Link survey diganti"}.get(action, "Survey diubah"))
    return _survey_info(pid)


@router.get("/api/projects/{pid}/survey")
def survey_rows(pid: str, me=Depends(current_member)):
    db = get_db()
    sv = db.surveys.find_one({"projectId": pid})
    if not sv:
        return {"info": None, "rows": []}
    rows = clean_all(db.responses.find({"surveyId": sv["id"]}))
    rows.sort(key=lambda r: r["at"], reverse=True)
    for r in rows:
        r.pop("clientId", None)
    return {"info": _survey_info(pid), "rows": rows}


@router.delete("/api/responses/{rid}")
def delete_response(rid: str, me=Depends(current_member)):
    require(is_head(me) or is_editor(me), "Hanya PID Supervisor / Head yang dapat menghapus respons")
    db = get_db()
    r = db.responses.find_one({"id": rid})
    if not r:
        raise HTTPException(404, "Respons tidak ditemukan")
    db.responses.delete_one({"id": rid})
    recompute(r["projectId"])
    S.log_activity(r["projectId"], me, "survey", to=6, note="Satu respons survey dihapus")
    return {"ok": True}


@router.get("/api/projects/{pid}/survey.csv")
def survey_csv(pid: str, me=Depends(current_member)):
    require(is_editor(me) or is_head(me))
    db = get_db()
    sv = db.surveys.find_one({"projectId": pid})
    kmap = {k["id"]: k["nama"] for k in db.kandidat.find({"projectId": pid})}
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["waktu", "responden", "kandidat", "porsi", "rasa", "tekstur", "porsi_skor", "harga", "niat_beli", "harga_ok", "komentar"])
    for r in clean_all(db.responses.find({"surveyId": sv["id"]})) if sv else []:
        for a in r.get("answers", []):
            w.writerow([r["at"], r.get("nama") or "", kmap.get(a["kandidatId"], a["kandidatId"]), a.get("porsi") or "",
                        a.get("rasa"), a.get("tekstur"), a.get("porsiScore"), a.get("harga"), a.get("intent"),
                        {True: "ya", False: "tidak"}.get(a.get("priceOk"), ""), a.get("comment") or ""])
    return Response("﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="survey-{pid}.csv"'})


# ---------------- public endpoints ----------------
def _by_token(token):
    sv = get_db().surveys.find_one({"token": token})
    if not sv:
        raise HTTPException(404, "Link survey tidak valid")
    return clean(sv)


@router.get("/api/survey/{token}")
def public_survey(token: str):
    sv = _by_token(token)
    p = _project(sv["projectId"])
    det = p["stages"][5].get("details") or {}
    open_, reason = _status(sv, p)
    return {"open": open_, "reason": reason, "lokasi": det.get("lokasi") or "",
            "judul": D.CATEGORIES[p["category"]]["label"], "kandidat": _kandidat_for(p["id"]) if open_ else []}


@router.post("/api/survey/{token}")
def submit_survey(token: str, body: dict = Body(...)):
    db = get_db()
    sv = _by_token(token)
    p = _project(sv["projectId"])
    open_, reason = _status(sv, p)
    if not open_:
        raise HTTPException(400, reason)
    client = str(body.get("clientId") or "")[:64]
    if client and db.responses.find_one({"surveyId": sv["id"], "clientId": client}):
        raise HTTPException(409, "Anda sudah mengisi survey ini. Terima kasih!")
    valid = {k["id"]: k for k in _kandidat_for(p["id"])}
    answers = []
    for a in body.get("answers") or []:
        kid = a.get("kandidatId")
        if kid not in valid:
            continue
        clean_a = {"kandidatId": kid}
        for key in ("rasa", "tekstur", "porsiScore", "harga"):
            v = a.get(key)
            if v is not None:
                try:
                    v = int(v)
                except (TypeError, ValueError):
                    raise HTTPException(400, "Nilai harus 1–5")
                if not 1 <= v <= 5:
                    raise HTTPException(400, "Nilai harus 1–5")
            clean_a[key] = v
        if clean_a.get("rasa") is None:
            raise HTTPException(400, f"Beri nilai rasa untuk {valid[kid]['nama']}")
        intent = a.get("intent")
        clean_a["intent"] = intent if intent in INTENTS else None
        clean_a["priceOk"] = a.get("priceOk") if isinstance(a.get("priceOk"), bool) else None
        porsi = a.get("porsi")
        clean_a["porsi"] = porsi if porsi in valid[kid]["porsi"] else None
        clean_a["comment"] = str(a.get("comment") or "")[:500]
        answers.append(clean_a)
    if not answers:
        raise HTTPException(400, "Isi penilaian minimal untuk 1 menu")
    db.responses.insert_one({"id": D.new_id(), "surveyId": sv["id"], "projectId": p["id"], "at": D.now_utc_iso(),
                             "nama": str(body.get("nama") or "")[:60], "clientId": client or None, "answers": answers})
    recompute(p["id"])
    count = db.responses.count_documents({"surveyId": sv["id"]})
    target = _target(p["stages"][5].get("details") or {})
    if count == target:
        WA.send_async(WA.phones(ids=[p.get("picId")]) + WA.phones(["pid_head"]),
                      f"*Survey mencapai target* (PID)\n{p['nama']} · {p['kode']}\n{count} responden terkumpul. "
                      f"Hasil sudah terisi di stage VI; silakan minta keputusan PID Head.\n\n{WA.link(p['id'])}", "surveyTarget")
    return {"ok": True, "message": "Terima kasih atas penilaian Anda!"}
