"""WhatsApp notifications via Fonnte (https://api.fonnte.com/send)."""
import os
import re
import threading

from . import config, domain as D
from .config import log
from .db import get_db, clean_all

FONNTE_URL = "https://api.fonnte.com/send"

EVENTS = {
    "decisionRequest": "Permintaan keputusan → PID Head",
    "decisionResult": "Hasil keputusan Go/Revisi/Drop → PIC proyek",
    "blocked": "Proyek Blocked → PID Head",
    "surveyTarget": "Survey mencapai target responden → PIC proyek",
    "nudge": "Pengingat harian 09:00 → PID Supervisor",
    "digest": "Daily digest 17:00 → PID Head",
    "weekly": "Weekly Update → grup WhatsApp",
}
DEFAULT_EVENTS = {k: k != "digest" for k in EVENTS}


def _post(url, headers, data):  # replaced in tests
    import httpx
    return httpx.post(url, headers=headers, data=data, timeout=20)


def wa_settings():
    s = get_db().settings.find_one({"id": "settings"}) or {}
    events = {**DEFAULT_EVENTS, **(s.get("waEvents") or {})}
    token = s.get("waToken") or os.getenv("FONNTE_TOKEN", "")
    return {"enabled": bool(s.get("waEnabled")) and bool(token), "token": token, "group": s.get("waGroup") or "",
            "events": events}


def norm_phone(p):
    p = re.sub(r"\D", "", str(p or ""))
    if p.startswith("0"):
        p = "62" + p[1:]
    return p if len(p) >= 10 else ""


def send(targets, message, event="manual", force=False):
    """Send one message to many targets (phones or a group id). Returns a result dict; never raises."""
    ws = wa_settings()
    targets = sorted({t if t.endswith("@g.us") else norm_phone(t) for t in targets if t} - {""})
    res = {"event": event, "targets": targets, "at": D.now_utc_iso(), "message": message[:400]}
    if not targets:
        res.update(ok=False, reason="Tidak ada nomor tujuan")
    elif not ws["token"]:
        res.update(ok=False, reason="Token Fonnte belum diisi")
    elif not ws["enabled"] and not force:
        res.update(ok=False, reason="Notifikasi WhatsApp dimatikan")
    elif not force and not ws["events"].get(event, True):
        res.update(ok=False, reason="Event ini dimatikan di Settings")
    else:
        try:
            r = _post(FONNTE_URL, {"Authorization": ws["token"]},
                      {"target": ",".join(targets), "message": message, "countryCode": "62"})
            body = {}
            try:
                body = r.json()
            except Exception:
                pass
            ok = r.status_code < 300 and body.get("status") is not False
            res.update(ok=ok, reason=None if ok else (body.get("reason") or f"HTTP {r.status_code}"))
        except Exception as e:  # network error
            res.update(ok=False, reason=str(e)[:200])
    try:
        get_db().walog.insert_one(dict(res))
    except Exception:
        pass
    if not res["ok"]:
        log.info("WA tidak terkirim (%s): %s", event, res["reason"])
    return res


def send_async(targets, message, event):
    """Fire-and-forget so API requests are never slowed by Fonnte."""
    if os.getenv("WA_SYNC") == "1":
        return send(targets, message, event)
    threading.Thread(target=send, args=(targets, message, event), daemon=True).start()


def phones(roles=None, ids=None):
    q = {"active": True}
    ms = clean_all(get_db().members.find(q))
    if roles:
        ms = [m for m in ms if m.get("role") in roles]
    if ids is not None:
        ms = [m for m in ms if m["id"] in ids]
    return [m.get("phone") for m in ms if m.get("phone")]


def link(pid=None):
    base = config.PUBLIC_BASE_URL
    return f"{base}/#/proyek/{pid}" if pid else base


def recent_log(limit=20):
    rows = clean_all(get_db().walog.find({}))
    rows.sort(key=lambda r: r["at"], reverse=True)
    return rows[:limit]
