"""Business constants and pure computations for CRK PID Dashboard."""
import uuid
from datetime import datetime, date, timedelta, timezone

from .config import TZ

STAGES = [
    {"n": 1, "roman": "I", "nama": "Pencarian Ide", "output": "Long list ide (kandidat) beserta sumbernya"},
    {"n": 2, "roman": "II", "nama": "Penyaringan Ide", "output": "Shortlist kandidat berdasarkan scoring"},
    {"n": 3, "roman": "III", "nama": "Pembuatan Konsep", "output": "Concept card per kandidat"},
    {"n": 4, "roman": "IV", "nama": "Pengujian Konsep", "output": "Hasil uji konsep (Direksi / panel)", "gate": True},
    {"n": 5, "roman": "V", "nama": "Pembuatan Prototipe", "output": "Resep/BOM, porsi, HPP, foto"},
    {"n": 6, "roman": "VI", "nama": "Pengujian Prototipe", "output": "Hasil uji customer (mis. 30 responden)", "gate": True},
    {"n": 7, "roman": "VII", "nama": "Komersialisasi", "output": "Launch date, harga final, SKU, hand-off", "gate": True},
]
DECISION_STAGES = {4, 6, 7}

CATEGORIES = {
    "varian_cimol": {"label": "Varian Cimol", "code": "VC", "cadence": "3 bulan sekali", "subTypes": ["Bumbu", "Isian", "Kuah", "Saos"]},
    "minuman": {"label": "Minuman", "code": "MN", "cadence": "3 bulan sekali", "subTypes": []},
    "online_food": {"label": "Online Food", "code": "OF", "cadence": "1 bulan sekali", "subTypes": []},
    "new_brand": {"label": "New Brand", "code": "NB", "cadence": "2x setahun", "subTypes": []},
}
CATEGORY_ORDER = ["varian_cimol", "minuman", "online_food", "new_brand"]

ROLES = {
    "pid_head": "PID Head",
    "pid_supervisor": "PID Supervisor",
    "pid_staff": "PID Staff / R&D",
    "viewer": "Viewer",
}

PROJECT_STATUSES = ["not_started", "on_track", "at_risk", "blocked", "done", "dropped"]
KANDIDAT_STATUSES = ["ide", "lolos_screening", "gugur", "konsep", "prototipe", "lolos_uji", "launch", "drop"]
SUMBER_IDE = ["Expo/Event", "Data penjualan", "Data GoFood/GrabFood", "Trend socmed", "Competitor", "Customer feedback", "Internal", "Lainnya"]
VENDOR_STATUSES = ["prospek", "sampling", "approved", "blacklist"]
KATEGORI_BAHAN = ["Protein", "Saus & Bumbu", "Packaging", "Minuman base", "Frozen", "Tepung & Aci", "Dairy", "Lainnya"]

DEFAULT_HANDOFF = [
    {"key": "sop", "label": "SOP & training crew", "divisi": "Sales & Operation"},
    {"key": "posm", "label": "POSM & content brief", "divisi": "Marketing / Brand & Creative"},
    {"key": "listing", "label": "Listing GoFood/GrabFood/ShopeeFood", "divisi": "Marketing"},
    {"key": "po", "label": "PO bahan ke vendor", "divisi": "Supply Chain"},
    {"key": "frozen", "label": "Produksi frozen (bila relevan)", "divisi": "Factory"},
    {"key": "pos", "label": "Harga di POS", "divisi": "Sales & Operation"},
]

DEFAULT_SETTINGS = {
    "appName": "CRK PID Dashboard",
    "slaDays": {
        "varian_cimol": [14, 14, 7, 7, 10, 21, 14],
        "minuman": [14, 14, 7, 7, 10, 21, 14],
        "online_food": [3, 4, 2, 3, 7, 7, 4],
        "new_brand": [21, 21, 21, 21, 30, 30, 36],
    },
    "cadence": {
        "varian_cimol": [2, 6, 9, 12],
        "minuman": [2, 6, 9, 12],
        "online_food": list(range(1, 13)),
        "new_brand": [],
    },
    "launchTargetPerYear": {"varian_cimol": 4, "minuman": 4, "online_food": 12, "new_brand": 2},
    "screeningCriteria": [
        {"id": "market", "label": "Market fit & trend", "weight": 25},
        {"id": "harga", "label": "Estimasi harga & HPP vs target food cost", "weight": 25},
        {"id": "ops", "label": "Kesiapan operasional outlet", "weight": 20},
        {"id": "bahan", "label": "Ketersediaan bahan / vendor", "weight": 15},
        {"id": "diferensiasi", "label": "Diferensiasi vs menu existing & competitor", "weight": 15},
    ],
    "screeningPassScore": 3.5,
    "targetFoodCostPct": {"varian_cimol": 35, "minuman": 30, "online_food": 35, "new_brand": 35},
    "digestTime": "17:00",
    "nudgeTime": "09:00",
    "weeklyDay": 1,
    "weeklyTime": "08:30",
    "workDays": [1, 2, 3, 4, 5],
    "adminEmail": "",
    "stalledDays": 5,
    "slotStart": {},
    "suppressedSlots": [],
    "lastWeeklyText": "",
    "lastWeeklyAt": None,
}

MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]


# ---------- time helpers ----------
def now_utc_iso():
    return datetime.now(timezone.utc).isoformat()


def today():
    return datetime.now(TZ).date()


def pdate(s):
    if not s:
        return None
    if isinstance(s, date):
        return s
    return date.fromisoformat(str(s)[:10])


def fdate(d):
    return d.isoformat() if d else None


def num(v, default=None):
    """Parse numbers typed Indonesian-style: '120.000' -> 120000, '4,5' -> 4.5."""
    if v is None or v == "":
        return default
    if isinstance(v, (int, float)):
        return v
    t = str(v).strip().replace("Rp", "").replace(" ", "")
    if "," in t:
        t = t.replace(".", "").replace(",", ".")
    elif t.count(".") >= 1 and len(t.split(".")[-1]) == 3:
        t = t.replace(".", "")
    try:
        f = float(t)
    except ValueError:
        raise ValueError(f"Angka tidak valid: {v}")
    return int(f) if f.is_integer() else f


def versi_key(v):
    m = [int(x) for x in __import__("re").findall(r"\d+", v or "")]
    return (m or [0], v or "")


def new_id():
    return uuid.uuid4().hex[:12]


def fmt_tgl(d):
    d = pdate(d)
    if not d:
        return "-"
    return f"{d.day} {MONTHS_ID[d.month - 1]} {d.year}"


def period_label(period):
    y, m = period.split("-")
    return f"{MONTHS_ID[int(m) - 1]} {y}"


def rupiah(n):
    try:
        return "Rp" + f"{int(round(n)):,}".replace(",", ".")
    except Exception:
        return "-"


# ---------- stages ----------
def empty_stages():
    return [
        {
            "stage": s["n"], "state": "not_started", "plannedStart": None, "plannedEnd": None,
            "actualStart": None, "actualEnd": None, "skipReason": None, "decision": None,
            "decisionNote": None, "decidedBy": None, "decidedAt": None, "notes": "",
            "plannedOverride": False, "slaPlannedStart": None, "slaPlannedEnd": None, "details": {},
        }
        for s in STAGES
    ]


def back_schedule(stages, target_launch, sla, keep_overrides=True):
    """VII ends on target launch; earlier active stages end where the next starts."""
    tl = pdate(target_launch)
    if not tl:
        return stages
    end = tl
    for st in reversed(stages):
        if st["state"] == "skipped":
            st["slaPlannedStart"] = st["slaPlannedEnd"] = None
            if not st.get("plannedOverride"):
                st["plannedStart"] = st["plannedEnd"] = None
            continue
        days = sla[st["stage"] - 1]
        start = end - timedelta(days=days)
        st["slaPlannedStart"], st["slaPlannedEnd"] = fdate(start), fdate(end)
        if not (keep_overrides and st.get("plannedOverride")):
            st["plannedStart"], st["plannedEnd"] = fdate(start), fdate(end)
            st["plannedOverride"] = False
        end = start
    return stages


def project_code_prefix(category, target_launch):
    tl = pdate(target_launch) or today()
    return f"{CATEGORIES[category]['code']}-{tl.strftime('%y%m')}"


def screening_total(scores, criteria):
    if not scores:
        return None
    tw, tot = 0, 0.0
    for c in criteria:
        v = scores.get(c["id"])
        if v is None:
            return None
        tw += c["weight"]
        tot += float(v) * c["weight"]
    return round(tot / tw, 2) if tw else None


def bom_line_cost(line):
    qty = float(line.get("qty") or 0)
    harga = float(line.get("hargaPerUnit") or 0)
    unit = line.get("unit") or "g"
    if unit in ("g", "ml"):
        return qty / 1000.0 * harga
    return qty * harga


def compute_hpp(lines, versi=None):
    ls = [l for l in lines if versi is None or l.get("versi") == versi]
    return round(sum(bom_line_cost(l) for l in ls), 2)


def porsi_rows(recipe, concept, hpp_base):
    """Per-portion HPP: BOM is entered for the base portion (multiplier 1); other portions scale it."""
    recipe, concept = recipe or {}, concept or {}
    rows = recipe.get("porsi") or []
    if not rows:
        rows = [{"nama": "Standar", "multiplier": 1, "hargaJual": recipe.get("hargaJual") or concept.get("hargaTarget")}]
    out = []
    for r in rows:
        try:
            mult = num(r.get("multiplier"), 1) or 1
            harga = num(r.get("hargaJual"))
        except ValueError:
            mult, harga = 1, None
        hpp = round((hpp_base or 0) * mult, 2)
        out.append({"nama": r.get("nama") or "Standar", "multiplier": mult, "hargaJual": harga, "hpp": hpp,
                    "foodCostPct": round(hpp / harga * 100, 1) if harga and hpp else None})
    return out


def compute_project_flags(p, settings, last_activity_at=None, t=None):
    t = t or today()
    sla = settings["slaDays"][p["category"]]
    cur = p.get("currentStage") or 1
    st = p["stages"][cur - 1]
    out = {"daysInStage": None, "sla": sla[cur - 1], "slaSisa": None, "lewatSla": False, "stalled": False,
           "risikoLaunch": False, "daysToLaunch": None, "progress": 0, "remainingSlaDays": None}
    done_count = sum(1 for s in p["stages"] if s["state"] in ("done", "skipped"))
    out["progress"] = round(done_count / 7 * 100)
    if p.get("status") in ("done", "dropped"):
        out["effectiveStatus"] = p["status"]
        if p.get("status") == "done":
            out["progress"] = 100
        return out
    if st["state"] == "in_progress" and st.get("actualStart"):
        d = (t - pdate(st["actualStart"])).days
        out["daysInStage"] = d
        # deadline: a manually agreed planned end (e.g. whiteboard dates) wins; otherwise start + SLA days
        if st.get("plannedOverride") and st.get("plannedEnd"):
            deadline = pdate(st["plannedEnd"])
        else:
            deadline = pdate(st["actualStart"]) + timedelta(days=sla[cur - 1])
        out["deadline"] = fdate(deadline)
        out["slaSisa"] = (deadline - t).days
        out["lewatSla"] = t > deadline
    remaining = 0
    for s in p["stages"]:
        if s["stage"] < cur or s["state"] in ("done", "skipped"):
            continue
        if s["stage"] == cur and out["slaSisa"] is not None:
            remaining += max(0, out["slaSisa"])
        else:
            remaining += sla[s["stage"] - 1]
    out["remainingSlaDays"] = remaining
    tl = pdate(p.get("targetLaunch"))
    if tl:
        out["daysToLaunch"] = (tl - t).days
        out["risikoLaunch"] = remaining > out["daysToLaunch"]
    if last_activity_at:
        try:
            la = datetime.fromisoformat(last_activity_at).astimezone(TZ).date()
            out["stalled"] = (t - la).days >= settings.get("stalledDays", 5)
        except Exception:
            pass
    status = p.get("status") or "not_started"
    if status == "blocked":
        eff = "blocked"
    elif out["lewatSla"] or out["risikoLaunch"]:
        eff = "at_risk"
    elif status == "not_started" and p["stages"][0]["state"] == "not_started":
        eff = "not_started"
    elif status == "at_risk":
        eff = "at_risk"
    else:
        eff = "on_track"
    out["effectiveStatus"] = eff
    return out


def month_iter(start, count):
    y, m = start.year, start.month
    for _ in range(count):
        yield y, m
        m += 1
        if m > 12:
            m, y = 1, y + 1
