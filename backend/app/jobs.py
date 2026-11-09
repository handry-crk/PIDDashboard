import json
import os
import smtplib
import html
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from . import config, domain as D, services as S
from .config import log
from .db import get_db, clean_all


# ---------- email ----------
def brand_html(title, body_text):
    body = html.escape(body_text).replace("\n", "<br>")
    body = body.replace("**", "")
    return f"""<div style="background:#ECE4D4;padding:24px;font-family:Arial,sans-serif;color:#212121">
<div style="max-width:640px;margin:auto;background:#F6F1E7;border:1px solid #D9CDB8">
<div style="background:#B42F27;color:#ECE4D4;padding:16px 20px"><div style="font-size:11px;letter-spacing:2px">CRK GROUP · PRODUCT INNOVATION DEVELOPMENT</div>
<div style="font-size:20px;font-weight:bold;margin-top:4px">{html.escape(title)}</div></div>
<div style="padding:20px;font-size:14px;line-height:1.6">{body}</div>
<div style="padding:12px 20px;font-size:12px;border-top:1px solid #D9CDB8"><a style="color:#B42F27" href="{config.PUBLIC_BASE_URL}">Buka PID Dashboard</a></div>
</div></div>"""


def send_email(to_list, subject, text):
    to_list = sorted({t for t in to_list if t})
    if not to_list:
        return {"sent": False, "reason": "no recipients"}
    html_body = brand_html(subject, text)
    try:
        if config.RESEND_API_KEY:
            import httpx
            r = httpx.post("https://api.resend.com/emails", headers={"Authorization": f"Bearer {config.RESEND_API_KEY}"},
                           json={"from": config.SMTP_FROM, "to": to_list, "subject": subject, "html": html_body, "text": text},
                           timeout=15)
            return {"sent": r.status_code < 300, "via": "resend", "status": r.status_code, "to": to_list}
        if config.SMTP_HOST:
            msg = MIMEMultipart("alternative")
            msg["Subject"], msg["From"], msg["To"] = subject, config.SMTP_FROM, ", ".join(to_list)
            msg.attach(MIMEText(text, "plain", "utf-8"))
            msg.attach(MIMEText(html_body, "html", "utf-8"))
            if config.SMTP_PORT == 465:
                conn = smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT, timeout=15)
            else:
                conn = smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=15)
                conn.starttls()
            with conn as s:
                if config.SMTP_USER:
                    s.login(config.SMTP_USER, config.SMTP_PASS)
                s.sendmail(config.SMTP_FROM, to_list, msg.as_string())
            return {"sent": True, "via": "smtp", "to": to_list}
    except Exception as e:  # pragma: no cover
        log.error("Email gagal: %s", e)
        return {"sent": False, "reason": str(e), "to": to_list}
    log.info("Email (tanpa SMTP/Resend) ke %s: %s", to_list, subject)
    return {"sent": False, "reason": "SMTP/Resend belum diatur", "to": to_list}


def _members(roles=None):
    ms = [m for m in clean_all(get_db().members.find({"active": True}))]
    if roles:
        ms = [m for m in ms if m["role"] in roles or (m.get("isAdmin") and "admin" in roles)]
    return ms


def _log_reminder(slot, recipients, result, date=None):
    get_db().reminderlog.insert_one({"date": date or D.fdate(D.today()), "slot": slot, "sentAt": D.now_utc_iso(),
                                     "recipients": recipients, "result": result})


def _already(slot):
    return get_db().reminderlog.find_one({"date": D.fdate(D.today()), "slot": slot}) is not None


# ---------- jobs ----------
def job_digest(force=False):
    if not force and _already("digest"):
        return {"skipped": "sudah terkirim hari ini"}
    settings = S.get_settings()
    projects, _ = S.all_projects_enriched(settings)
    db = get_db()
    today = D.fdate(D.today())
    moved = [a for a in clean_all(db.activity.find({"action": {"$in": ["stage_advance", "skip", "decision", "launch"]}}))
             if datetime.fromisoformat(a["at"]).astimezone(config.TZ).date().isoformat() == today]
    active = [p for p in projects if p.get("status") not in ("done", "dropped")]
    lines = [f"Daily digest PID — {D.fmt_tgl(D.today())}", ""]
    lines.append("PERGERAKAN HARI INI")
    pmap = {p["id"]: p for p in projects}
    lines += [f"• {pmap.get(a['projectId'], {}).get('nama', '-')}: {a['action']} {a.get('to') or ''} ({a['byName']})" for a in moved] or ["• Tidak ada"]
    lines += ["", "MENUNGGU KEPUTUSAN PID HEAD"]
    lines += [f"• {p['nama']} — {p['stageName']}" for p in active if p["waitingDecision"]] or ["• Tidak ada"]
    lines += ["", "LEWAT SLA / STALLED / BLOCKED"]
    probs = [p for p in active if p["flags"]["lewatSla"] or p["flags"]["stalled"] or p["flags"]["effectiveStatus"] == "blocked"]
    lines += [f"• {p['nama']} — {p['stageName']}" + (f" (lewat {-p['flags']['slaSisa']} hari)" if p['flags']['lewatSla'] else "")
              + (" [stalled]" if p["flags"]["stalled"] else "") + (f" [blocked: {p.get('statusNote') or '-'}]" if p['flags']['effectiveStatus'] == 'blocked' else "")
              for p in probs] or ["• Tidak ada"]
    to = [m["email"] for m in _members(["pid_head", "pid_supervisor", "admin"])] + [settings.get("adminEmail")]
    res = send_email(to, "Daily digest PID", "\n".join(lines))
    _log_reminder("digest", res.get("to", []), res)
    return {"ok": True, "text": "\n".join(lines), "email": res}


def job_nudge(force=False):
    if not force and _already("nudge"):
        return {"skipped": "sudah terkirim hari ini"}
    settings = S.get_settings()
    projects, _ = S.all_projects_enriched(settings)
    slots = S.slots_enriched(projects, settings)
    t = D.today()
    items = []
    for p in projects:
        if p.get("status") in ("done", "dropped"):
            continue
        st = p["stages"][p["currentStage"] - 1]
        if p["flags"]["lewatSla"]:
            items.append(f"• {p['nama']}: {p['stageName']} lewat SLA {-p['flags']['slaSisa']} hari")
        elif st.get("plannedEnd") and 0 <= (D.pdate(st["plannedEnd"]) - t).days <= 2:
            items.append(f"• {p['nama']}: {p['stageName']} berakhir {D.fmt_tgl(st['plannedEnd'])}")
    for s in slots:
        if s["flags"]["slotTerlambat"] and not s["flags"]["past"]:
            items.append(f"• Slot {s['label']} belum punya proyek dan seharusnya sudah mulai")
    text = "Pengingat PID hari ini:\n" + ("\n".join(items) if items else "Tidak ada stage yang jatuh tempo.")
    to = [m["email"] for m in _members(["pid_supervisor"])]
    res = send_email(to, f"Pengingat PID: {len(items)} item", text) if items else {"sent": False, "reason": "tidak ada item"}
    _log_reminder("nudge", res.get("to", []), res)
    return {"ok": True, "text": text, "email": res}


def job_weekly(force=False):
    if not force and _already("weekly"):
        return {"skipped": "sudah terkirim hari ini"}
    settings = S.get_settings()
    projects, _ = S.all_projects_enriched(settings)
    slots = S.slots_enriched(projects, settings)
    text = S.weekly_text(projects, slots, settings)
    get_db().settings.update_one({"id": "settings"}, {"$set": {"lastWeeklyText": text, "lastWeeklyAt": D.now_utc_iso()}})
    to = [m["email"] for m in _members()] + [settings.get("adminEmail")]
    res = send_email(to, "Weekly Update PID CRK", text)
    _log_reminder("weekly", res.get("to", []), res)
    return {"ok": True, "text": text, "email": res}


def job_backup(force=False):
    db = get_db()
    os.makedirs(config.BACKUP_DIR, exist_ok=True)
    data = {c: clean_all(db[c].find({})) for c in
            ["members", "projects", "kandidat", "bom", "vendors", "slots", "activity", "comments", "settings", "files"]}
    name = f"pid-backup-{datetime.now(config.TZ).strftime('%Y%m%d-%H%M%S')}.json"
    path = os.path.join(config.BACKUP_DIR, name)
    with open(path, "w") as f:
        json.dump(data, f, default=str)
    files = sorted(x for x in os.listdir(config.BACKUP_DIR) if x.startswith("pid-backup-"))
    for old in files[:-8]:
        os.remove(os.path.join(config.BACKUP_DIR, old))
    _log_reminder("backup", [], {"file": name})
    return {"ok": True, "file": name}


JOBS = {"digest": job_digest, "nudge": job_nudge, "weekly": job_weekly, "backup": job_backup}


def tick():
    """Runs every 15 minutes; fires each slot once per day when its time has passed."""
    try:
        s = S.get_settings()
        now = datetime.now(config.TZ)
        hm = now.strftime("%H:%M")
        wd = now.isoweekday()
        workday = wd in s.get("workDays", [1, 2, 3, 4, 5])
        if workday and hm >= s.get("nudgeTime", "09:00"):
            job_nudge()
        if workday and hm >= s.get("digestTime", "17:00"):
            job_digest()
        if wd == s.get("weeklyDay", 1) and hm >= s.get("weeklyTime", "08:30"):
            job_weekly()
        if wd == 7 and hm >= "02:00" and not _already("backup"):
            job_backup()
    except Exception as e:  # pragma: no cover
        log.exception("Scheduler error: %s", e)


def start_scheduler():
    from apscheduler.schedulers.background import BackgroundScheduler
    sch = BackgroundScheduler(timezone=config.TZ)
    sch.add_job(tick, "interval", minutes=15, id="tick", next_run_time=datetime.now(config.TZ))
    sch.start()
    return sch
