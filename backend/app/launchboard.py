"""Push hand-off items of a project to the CRK Product Launch Tracker Google Sheet (tab Tasks, A:K)."""
import json
import os
import threading

from . import domain as D, services as S
from .config import log
from .db import get_db, clean

DEFAULT_SHEET_ID = "1A_POLPQACET9ZN4pVyLFNxU7FgyIzewy6ABfHgdhaqs"
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
API = "https://sheets.googleapis.com/v4/spreadsheets"

# hand-off key -> (divisi name exactly as in tab Panduan, kode ID, fase exactly as in tab Phases)
HANDOFF_MAP = {
    "sop": ("Sales & Operation", "SOP", "Pra Pre Launch"),
    "posm": ("Brand & Creative", "BRC", "Content Creation"),
    "listing": ("Marketing", "MKT", "Pre Launch"),
    "po": ("Supply Chain Management", "SCM", "Pra Pre Launch"),
    "frozen": ("Factory", "FAC", "Pra Pre Launch"),
    "pos": ("Sales & Operation", "SOP", "Pre Launch"),
}
DELIVERABLE = {
    "sop": "SOP penyajian + crew outlet terlatih",
    "posm": "Brief POSM & konten launch",
    "listing": "Menu aktif di GoFood/GrabFood/ShopeeFood",
    "po": "PO bahan baku ke vendor terkirim",
    "frozen": "Batch produksi frozen siap",
    "pos": "Harga & SKU aktif di POS",
}


def sa_info():
    raw = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        log.error("GOOGLE_SERVICE_ACCOUNT_JSON bukan JSON yang valid")
        return None


def lb_settings():
    s = get_db().settings.find_one({"id": "settings"}) or {}
    info = sa_info()
    return {"sheetId": s.get("launchSheetId") or DEFAULT_SHEET_ID, "auto": s.get("launchBoardAuto", True),
            "configured": bool(info), "serviceEmail": (info or {}).get("client_email")}


def _token():
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request
    creds = service_account.Credentials.from_service_account_info(sa_info(), scopes=SCOPES)
    creds.refresh(Request())
    return creds.token


def _call(method, url, body=None):  # replaced in tests
    import httpx
    r = httpx.request(method, url, headers={"Authorization": f"Bearer {_token()}"}, json=body, timeout=30)
    if r.status_code >= 300:
        try:
            msg = r.json().get("error", {}).get("message")
        except Exception:
            msg = r.text[:200]
        raise RuntimeError(msg or f"HTTP {r.status_code}")
    return r.json() if r.content else {}


def build_rows(p, members):
    st7 = p["stages"][6]
    det = st7.get("details") or {}
    mulai = st7.get("actualStart") or st7.get("plannedStart") or D.fdate(D.today())
    selesai = det.get("launchDate") or p.get("targetLaunch") or ""
    eff = p.get("flags", {}).get("effectiveStatus") or p.get("status")
    run_status = {"blocked": "Blocked", "at_risk": "At risk"}.get(eff, "On track")
    pic_name = next((m["name"] for m in members if m["id"] == p.get("picId")), "")
    nama = det.get("namaMenu") or p["nama"]
    rows = [[f"PID-{p['kode']}", "R&D", "PID (Product Development)", f"Produk final siap launch: {nama}",
             "Resep, HPP, SOP final + keputusan launch PID Head", pic_name, mulai, selesai,
             "Done" if p.get("status") == "done" else run_status,
             100 if p.get("status") == "done" else p.get("flags", {}).get("progress", 0),
             f"Sinkron otomatis dari PID Dashboard ({p['kode']})"]]
    for h in p.get("handoff", []):
        if h.get("na") or h["key"] not in HANDOFF_MAP:
            continue
        div, code, fase = HANDOFF_MAP[h["key"]]
        rows.append([f"{code}-{p['kode']}-{h['key'].upper()}", fase, div, f"{h['label']} — {nama}", DELIVERABLE[h["key"]],
                     h.get("pic") or "", mulai, selesai, "Done" if h.get("done") else run_status,
                     100 if h.get("done") else 0, f"Hand-off PID {p['kode']}"])
    return rows


def sync(pid, by=None):
    """Upsert this project's rows into Tasks!A:K. Returns the sync status stored on the project."""
    db = get_db()
    cfg = lb_settings()
    status = {"at": D.now_utc_iso(), "ok": False, "rows": 0, "sheetId": cfg["sheetId"]}
    p = clean(db.projects.find_one({"id": pid}))
    if not p:
        return None
    if not cfg["configured"]:
        status["reason"] = "GOOGLE_SERVICE_ACCOUNT_JSON belum diisi di Railway"
    else:
        try:
            settings = S.get_settings()
            p["flags"] = D.compute_project_flags(p, settings, p.get("lastActivityAt"))
            members = list(db.members.find({}, {"id": 1, "name": 1}))
            rows = build_rows(p, members)
            col = _call("GET", f"{API}/{cfg['sheetId']}/values/Tasks!A:A").get("values", [])
            index = {r[0]: i + 1 for i, r in enumerate(col) if r}
            updates, appends = [], []
            for row in rows:
                if row[0] in index:
                    n = index[row[0]]
                    updates.append({"range": f"Tasks!A{n}:K{n}", "values": [row]})
                else:
                    appends.append(row)
            if updates:
                _call("POST", f"{API}/{cfg['sheetId']}/values:batchUpdate",
                      {"valueInputOption": "USER_ENTERED", "data": updates})
            if appends:
                _call("POST", f"{API}/{cfg['sheetId']}/values/Tasks!A:K:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS",
                      {"values": appends})
            status.update(ok=True, rows=len(rows), updated=len(updates), appended=len(appends))
        except Exception as e:
            status["reason"] = str(e)[:300]
            log.error("Sinkron Launch Board gagal untuk %s: %s", pid, e)
    db.projects.update_one({"id": pid}, {"$set": {"launchBoardSync": status}})
    if by is not None or not status["ok"]:
        S.log_activity(pid, by, "launchboard",
                       note=f"Sinkron Launch Board: {status['rows']} baris" if status["ok"] else f"Sinkron Launch Board gagal: {status.get('reason')}")
    return status


def sync_async(pid):
    cfg = lb_settings()
    if not (cfg["configured"] and cfg["auto"]):
        return
    if os.getenv("WA_SYNC") == "1":  # tests run synchronously
        return sync(pid)
    threading.Thread(target=sync, args=(pid,), daemon=True).start()


def test_connection():
    cfg = lb_settings()
    if not cfg["configured"]:
        raise RuntimeError("GOOGLE_SERVICE_ACCOUNT_JSON belum diisi di Railway")
    head = _call("GET", f"{API}/{cfg['sheetId']}/values/Tasks!A1:K1").get("values", [[]])[0]
    expected = ["ID", "Fase", "Divisi", "Task", "Deliverable", "PIC", "Mulai", "Selesai", "Status", "Progres (%)", "Catatan / Blocker"]
    if head != expected:
        raise RuntimeError(f"Header tab Tasks tidak sesuai. Ditemukan: {', '.join(head) or '(kosong)'}")
    return {"ok": True, "serviceEmail": cfg["serviceEmail"], "sheetId": cfg["sheetId"]}
