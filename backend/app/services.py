import copy
import secrets

from .db import get_db, clean, clean_all
from . import domain as D


# ---------- settings ----------
def get_settings():
    db = get_db()
    s = db.settings.find_one({"id": "settings"})
    if not s:
        s = copy.deepcopy(D.DEFAULT_SETTINGS)
        s["id"] = "settings"
        s["shareToken"] = secrets.token_urlsafe(24)
        s["adminPinHash"] = None
        db.settings.insert_one(s)
        s = db.settings.find_one({"id": "settings"})
    s = clean(s)
    for k, v in D.DEFAULT_SETTINGS.items():
        s.setdefault(k, copy.deepcopy(v))
    return s


def public_settings(s):
    s = dict(s)
    s.pop("adminPinHash", None)
    s["waHasToken"] = bool(s.pop("waToken", None))
    s.pop("launchWebhookSecret", None)
    return s


# ---------- activity ----------
def log_activity(project_id, by, action, frm=None, to=None, note=None, kandidat_id=None):
    db = get_db()
    row = {"id": D.new_id(), "projectId": project_id, "kandidatId": kandidat_id, "at": D.now_utc_iso(),
           "byId": by["id"] if by else None, "byName": by["name"] if by else "Sistem",
           "action": action, "from": frm, "to": to, "note": note}
    db.activity.insert_one(row)
    if project_id:
        db.projects.update_one({"id": project_id}, {"$set": {"lastActivityAt": row["at"], "updatedAt": row["at"],
                                                             "updatedBy": row["byName"]}})
    return row


# ---------- slots ----------
_last_slot_sync = {"at": 0.0}


def ensure_slots(settings=None, force=False):
    import time
    if not force and time.time() - _last_slot_sync["at"] < 60:
        return
    _last_slot_sync["at"] = time.time()
    db = get_db()
    settings = settings or get_settings()
    t = D.today()
    suppressed = set(settings.get("suppressedSlots") or [])
    for cat in D.CATEGORY_ORDER:
        months = settings["cadence"].get(cat, [])
        start = (settings.get("slotStart") or {}).get(cat) or ""
        for y, m in D.month_iter(t.replace(day=1), 15):
            if m not in months:
                continue
            period = f"{y}-{m:02d}"
            if period < start or f"{cat}|{period}" in suppressed:
                continue
            if not db.slots.find_one({"category": cat, "period": period}):
                db.slots.insert_one({"id": D.new_id(), "category": cat, "period": period,
                                     "label": f"{D.CATEGORIES[cat]['label']} {D.period_label(period)}",
                                     "projectId": None, "note": "", "auto": True})
    # remove auto, empty slots no longer in cadence (future only)
    for s in list(db.slots.find({"auto": True, "projectId": None})):
        y, m = map(int, s["period"].split("-"))
        if m not in settings["cadence"].get(s["category"], []) and (y, m) >= (t.year, t.month):
            db.slots.delete_one({"id": s["id"]})


def slot_flags(slot, projects_by_id, settings, t=None):
    t = t or D.today()
    y, m = map(int, slot["period"].split("-"))
    first = D.date(y, m, 1)
    p = projects_by_id.get(slot.get("projectId")) if slot.get("projectId") else None
    active = p and p.get("status") != "dropped"
    total_sla = sum(settings["slaDays"][slot["category"]])
    months_ahead = (y - t.year) * 12 + (m - t.month)
    f = {"launched": bool(p and p.get("status") == "done"), "hasProject": bool(active),
         "slotKosong": (not active) and 0 <= months_ahead < 6,
         "slotTerlambat": (not active) and (first - D.timedelta(days=total_sla)) < t and months_ahead >= 0,
         "past": months_ahead < 0}
    return f


# ---------- projects ----------
def enrich_project(p, settings, kandidat_by_project, last_act=None):
    p = dict(p)
    p["flags"] = D.compute_project_flags(p, settings, p.get("lastActivityAt"))
    p["stageName"] = D.STAGES[(p.get("currentStage") or 1) - 1]["nama"]
    ks = kandidat_by_project.get(p["id"], [])
    p["kandidatCount"] = len(ks)
    p["kandidatNames"] = [k["nama"] for k in ks if k.get("status") not in ("gugur", "drop")]
    cur = p["stages"][(p.get("currentStage") or 1) - 1]
    p["waitingDecision"] = (p.get("status") not in ("done", "dropped") and p.get("currentStage") in D.DECISION_STAGES
                            and cur["state"] == "in_progress" and not cur.get("decision")
                            and bool(cur.get("decisionRequested")))
    return p


def all_projects_enriched(settings=None):
    db = get_db()
    settings = settings or get_settings()
    kandidat = clean_all(db.kandidat.find({}))
    kb = {}
    for k in kandidat:
        kb.setdefault(k["projectId"], []).append(k)
    projects = [enrich_project(p, settings, kb) for p in clean_all(db.projects.find({}))]
    projects.sort(key=lambda p: (p.get("targetLaunch") or "9999", p["kode"]))
    return projects, kandidat


def summary(projects, slots, settings):
    t = D.today()
    active = [p for p in projects if p.get("status") not in ("done", "dropped")]
    started = [p for p in active if p["flags"]["effectiveStatus"] != "not_started"]
    on_track = [p for p in started if p["flags"]["effectiveStatus"] == "on_track"]
    over = [p for p in active if p["flags"]["lewatSla"]]
    waiting = [p for p in active if p["waitingDecision"]]
    blocked = [p for p in active if p["flags"]["effectiveStatus"] == "blocked"]
    at_risk = [p for p in active if p["flags"]["effectiveStatus"] == "at_risk"]
    upcoming = sorted([p for p in active if p.get("targetLaunch") and D.pdate(p["targetLaunch"]) >= t],
                      key=lambda p: p["targetLaunch"])
    nxt = upcoming[0] if upcoming else None
    launched_ytd = [p for p in projects if p.get("status") == "done" and (p.get("launchedAt") or "")[:4] == str(t.year)]
    target_ytd = sum(settings["launchTargetPerYear"].values())
    empty3 = [s for s in slots if s["flags"]["slotKosong"] and _months_ahead(s["period"], t) < 3]
    return {
        "activeProjects": len(active),
        "onTrackPct": round(len(on_track) / len(started) * 100) if started else None,
        "onTrack": len(on_track), "started": len(started),
        "overSla": len(over), "waitingDecision": len(waiting), "blocked": len(blocked), "atRisk": len(at_risk),
        "nextLaunch": {"id": nxt["id"], "kode": nxt["kode"], "nama": nxt["nama"], "date": nxt["targetLaunch"],
                       "daysTo": (D.pdate(nxt["targetLaunch"]) - t).days} if nxt else None,
        "launchesYtd": len(launched_ytd), "launchTargetYtd": target_ytd,
        "emptySlotsNext3m": len(empty3),
        "takeaway": takeaway(active, over, blocked, waiting, nxt, empty3, t),
    }


def _months_ahead(period, t):
    y, m = map(int, period.split("-"))
    return (y - t.year) * 12 + (m - t.month)


def takeaway(active, over, blocked, waiting, nxt, empty3, t):
    if not active:
        return "Belum ada proyek aktif. Buat proyek pertama dari Launch Calendar atau tombol + Proyek."
    s = f"PID sedang mengembangkan {len(active)} proyek"
    if nxt:
        s += f"; launch berikutnya **{nxt['nama']}** dalam {(D.pdate(nxt['targetLaunch']) - t).days} hari"
    s += "."
    issues = []
    if over:
        names = ", ".join(f"{p['nama']} ({D.STAGES[p['currentStage'] - 1]['nama']})" for p in over[:2])
        issues.append(f"{len(over)} proyek melewati SLA: {names}")
    if blocked:
        issues.append(f"{len(blocked)} proyek blocked dan membutuhkan dukungan")
    if waiting:
        issues.append(f"{len(waiting)} keputusan menunggu PID Head")
    if empty3:
        issues.append(f"{len(empty3)} slot launch 3 bulan ke depan belum memiliki proyek")
    if issues:
        s += " Namun, " + "; ".join(issues) + "."
    else:
        s += " Semua proyek berjalan sesuai SLA."
    return s


def slots_enriched(projects, settings):
    db = get_db()
    pb = {p["id"]: p for p in projects}
    out = []
    for s in clean_all(db.slots.find({})):
        s["flags"] = slot_flags(s, pb, settings)
        p = pb.get(s.get("projectId"))
        s["project"] = {"id": p["id"], "kode": p["kode"], "nama": p["nama"],
                        "status": p["flags"]["effectiveStatus"]} if p else None
        out.append(s)
    out.sort(key=lambda s: (s["period"], D.CATEGORY_ORDER.index(s["category"])))
    return out


def funnel(projects, kandidat, year=None):
    year = year or D.today().year
    pids = {p["id"] for p in projects}
    since = D.fdate(D.today() - D.timedelta(days=365))
    ks = [k for k in kandidat if k["projectId"] in pids and (k.get("createdAt") or "")[:10] >= since]
    order = ["ide", "lolos_screening", "konsep", "prototipe", "lolos_uji", "launch"]
    rank = {s: i for i, s in enumerate(order)}
    rank.update({"gugur": 0, "drop": None})

    def reached(k, level):
        st = k.get("status")
        if st == "drop":
            return rank.get(k.get("maxStatus", "ide"), 0) >= level
        if st == "gugur":
            return level == 0
        return rank.get(st, 0) >= level

    labels = ["Kandidat ide", "Lolos screening", "Konsep", "Prototipe", "Lolos uji", "Launch"]
    rows = []
    for i, lab in enumerate(labels):
        rows.append({"label": lab, "count": sum(1 for k in ks if reached(k, i))})
    base = rows[0]["count"] or 0
    for r in rows:
        r["pct"] = round(r["count"] / base * 100) if base else 0
    return rows


def sla_compliance(projects, settings, category=None):
    rows = []
    if category:
        projects = [p for p in projects if p["category"] == category]
    for st in D.STAGES:
        n = st["n"]
        actual, slas = [], []
        for p in projects:
            s = p["stages"][n - 1]
            if s["state"] == "done" and s.get("actualStart") and s.get("actualEnd"):
                actual.append((D.pdate(s["actualEnd"]) - D.pdate(s["actualStart"])).days)
                slas.append(settings["slaDays"][p["category"]][n - 1])
        rows.append({"stage": n, "roman": st["roman"], "nama": st["nama"],
                     "avgActual": round(sum(actual) / len(actual), 1) if actual else None,
                     "avgSla": round(sum(slas) / len(slas), 1) if slas else None, "n": len(actual)})
    return rows


# ---------- post-launch scorecard ----------
def project_scorecard(p):
    det = p["stages"][6].get("details") or {}
    try:
        target = D.num(det.get("targetPorsiMinggu"))
    except ValueError:
        target = None
    weeks = []
    for w in (det.get("salesWeeks") or [])[:4]:
        try:
            weeks.append(D.num(w))
        except ValueError:
            weeks.append(None)
    weeks += [None] * (4 - len(weeks))
    filled = [w for w in weeks if w is not None]
    actual = sum(filled) if filled else None
    tgt_total = target * len(filled) if target and filled else None
    pct = round(actual / tgt_total * 100) if tgt_total else None
    weekly_pct = [round(w / target * 100) if (w is not None and target) else None for w in weeks]
    if len(filled) == 4 and pct is not None:
        verdict = "hit" if pct >= 100 else "miss"
    else:
        verdict = "berjalan" if filled else "belum ada data"
    return {"target": target, "weeks": weeks, "weeklyPct": weekly_pct, "actual": actual, "targetTotal": tgt_total,
            "pct": pct, "weeksFilled": len(filled), "verdict": verdict, "decision": det.get("postDecision") or None}


def scorecard(projects):
    launched = [p for p in projects if p.get("status") == "done"]
    rows, by = [], {}
    for p in launched:
        sc = project_scorecard(p)
        year = (p.get("launchedAt") or "")[:4]
        rows.append({"id": p["id"], "kode": p["kode"], "nama": (p["stages"][6].get("details") or {}).get("namaMenu") or p["nama"],
                     "category": p["category"], "launchedAt": p.get("launchedAt"), "year": year, **sc})
        key = (year, p["category"])
        b = by.setdefault(key, {"year": year, "category": p["category"], "launched": 0, "evaluated": 0, "hit": 0})
        b["launched"] += 1
        if sc["verdict"] in ("hit", "miss"):
            b["evaluated"] += 1
            b["hit"] += sc["verdict"] == "hit"
    for b in by.values():
        b["hitRate"] = round(b["hit"] / b["evaluated"] * 100) if b["evaluated"] else None
    rows.sort(key=lambda r: r.get("launchedAt") or "", reverse=True)
    summary_rows = sorted(by.values(), key=lambda b: (b["year"], D.CATEGORY_ORDER.index(b["category"])), reverse=True)
    ev = [r for r in rows if r["verdict"] in ("hit", "miss")]
    return {"projects": rows, "byCategoryYear": summary_rows,
            "overall": {"launched": len(rows), "evaluated": len(ev), "hit": sum(r["verdict"] == "hit" for r in ev),
                        "hitRate": round(sum(r["verdict"] == "hit" for r in ev) / len(ev) * 100) if ev else None}}


# ---------- weekly text ----------
def weekly_text(projects, slots, settings):
    t = D.today()
    sm = summary(projects, slots, settings)
    nl = sm["nextLaunch"]
    lines = [f"WEEKLY UPDATE PID CRK — {D.fmt_tgl(t)}"]
    l2 = f"Proyek aktif: {sm['activeProjects']} · On track: {sm['onTrack']} · At risk: {sm['atRisk']}"
    l2 += f" · Launch berikutnya: {nl['nama']} ({D.fmt_tgl(nl['date'])}, H-{nl['daysTo']})" if nl else " · Launch berikutnya: -"
    lines.append(l2)
    active = [p for p in projects if p.get("status") not in ("done", "dropped")]
    st_label = {"on_track": "on track", "at_risk": "at risk", "blocked": "blocked", "not_started": "not started"}
    for cat in D.CATEGORY_ORDER:
        ps = [p for p in active if p["category"] == cat]
        if not ps:
            continue
        lines.append("")
        lines.append(D.CATEGORIES[cat]["label"].upper())
        for p in ps:
            f = p["flags"]
            st = D.STAGES[p["currentStage"] - 1]
            sla_txt = ""
            if f["slaSisa"] is not None:
                sla_txt = f", SLA sisa {f['slaSisa']} hari" if f["slaSisa"] >= 0 else f", lewat SLA {-f['slaSisa']} hari"
            lines.append(f"• {p['nama']} — stage {st['roman']} {st['nama']}, {st_label.get(f['effectiveStatus'], f['effectiveStatus'])}{sla_txt}")
    waiting = [p for p in active if p["waitingDecision"]]
    lines.append("")
    lines.append("BUTUH KEPUTUSAN")
    lines += [f"• {p['nama']} — {D.STAGES[p['currentStage'] - 1]['nama']}" for p in waiting] or ["• Tidak ada"]
    blocked = [p for p in active if p["flags"]["effectiveStatus"] == "blocked"]
    lines.append("")
    lines.append("BUTUH DUKUNGAN")
    lines += [f"• {p['nama']}: {p.get('statusNote') or '-'}" for p in blocked] or ["• Tidak ada"]
    empty = [s for s in slots if s["flags"]["slotKosong"] and _months_ahead(s["period"], t) < 3]
    lines.append("")
    lines.append("Slot kosong 3 bulan ke depan: " + (", ".join(s["label"] for s in empty) if empty else "tidak ada"))
    return "\n".join(lines)


# ---------- full state ----------
def build_state(member):
    db = get_db()
    settings = get_settings()
    ensure_slots(settings)
    projects, kandidat = all_projects_enriched(settings)
    slots = slots_enriched(projects, settings)
    members = [{k: m.get(k) for k in ("id", "name", "role", "email", "phone", "active", "isAdmin")}
               for m in clean_all(db.members.find({}))]
    return {
        "me": {k: member.get(k) for k in ("id", "name", "role", "email", "phone", "isAdmin")},
        "members": members,
        "settings": public_settings(settings),
        "constants": constants(),
        "projects": projects,
        "slots": slots,
        "summary": summary(projects, slots, settings),
        "funnel": funnel(projects, kandidat),
        "slaCompliance": sla_compliance(projects, settings),
        "slaComplianceByCat": {c: sla_compliance(projects, settings, c) for c in D.CATEGORY_ORDER},
        "scorecard": scorecard(projects),
        "kandidat": [{k: x.get(k) for k in ("id", "projectId", "nama", "status", "screeningTotal")} for x in kandidat],
        "serverToday": D.fdate(D.today()),
    }


def constants():
    return {"stages": D.STAGES, "categories": D.CATEGORIES, "categoryOrder": D.CATEGORY_ORDER, "roles": D.ROLES,
            "kandidatStatuses": D.KANDIDAT_STATUSES, "sumberIde": D.SUMBER_IDE, "vendorStatuses": D.VENDOR_STATUSES,
            "kategoriBahan": D.KATEGORI_BAHAN, "defaultHandoff": D.DEFAULT_HANDOFF}


def report_payload():
    settings = get_settings()
    ensure_slots(settings)
    projects, kandidat = all_projects_enriched(settings)
    slots = slots_enriched(projects, settings)
    db = get_db()
    targets = settings["targetFoodCostPct"]
    pub = []
    for p in projects:
        if p.get("status") == "dropped":
            continue
        stages = [{k: s.get(k) for k in ("stage", "state", "plannedStart", "plannedEnd", "actualStart", "actualEnd", "decision")}
                  for s in p["stages"]]
        fc = None
        d7 = p["stages"][6]["details"] or {}
        if d7.get("foodCostPct") is not None:
            fc = "sesuai target" if d7["foodCostPct"] <= targets.get(p["category"], 35) else "di atas target"
        pub.append({k: p.get(k) for k in ("id", "kode", "nama", "category", "subType", "targetLaunch", "currentStage",
                                          "stageName", "kandidatNames", "launchedAt", "objective", "status")}
                   | {"flags": p["flags"], "stages": stages, "foodCost": fc})
    launched = [p for p in pub if p.get("status") == "done"]
    return {
        "generatedAt": D.now_utc_iso(), "serverToday": D.fdate(D.today()),
        "constants": {"stages": D.STAGES, "categories": D.CATEGORIES, "categoryOrder": D.CATEGORY_ORDER},
        "summary": summary(projects, slots, settings),
        "slots": [{k: s.get(k) for k in ("id", "category", "period", "label", "flags", "project")} for s in slots],
        "projects": pub,
        "launched": launched,
        "scorecard": scorecard(projects),
        "weeklyText": settings.get("lastWeeklyText") or weekly_text(projects, slots, settings),
        "weeklyAt": settings.get("lastWeeklyAt"),
    }
