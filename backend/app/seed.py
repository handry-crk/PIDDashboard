"""Seed: state of whiteboard SO-PID-010 per 9 Nov 2026."""
from . import domain as D, services as S
from .db import get_db


def _st(stages, n, **kw):
    stages[n - 1].update(kw)


def _mk_project(kode, nama, cat, sub, target, objective, current, status, stage_cfg, by):
    stages = D.empty_stages()
    for n, cfg in stage_cfg.items():
        _st(stages, n, **cfg)
        if cfg.get("plannedStart"):
            stages[n - 1]["plannedOverride"] = True
    settings = S.get_settings()
    D.back_schedule(stages, target, settings["slaDays"][cat], keep_overrides=True)
    now = D.now_utc_iso()
    return {"id": D.new_id(), "kode": kode, "nama": nama, "category": cat, "subType": sub, "slotId": None,
            "targetLaunch": target, "currentStage": current, "status": status, "statusNote": "", "picId": by,
            "objective": objective, "stages": stages, "handoff": [dict(h, done=False, na=False, pic="") for h in D.DEFAULT_HANDOFF],
            "createdAt": now, "updatedAt": now, "updatedBy": "Import whiteboard", "lastActivityAt": now, "launchedAt": None}


def seed_whiteboard(member):
    db = get_db()
    if db.projects.count_documents({}) > 0:
        return {"ok": False, "message": "Database sudah berisi proyek; import whiteboard hanya untuk database kosong"}
    # whiteboard starts the cycles at Jan 2027 (Online Food) and Feb 2027 (Varian Cimol, Minuman)
    start = {"varian_cimol": "2027-02", "minuman": "2027-02", "online_food": "2027-01"}
    db.settings.update_one({"id": "settings"}, {"$set": {"slotStart": start}})
    for cat, per in start.items():
        db.slots.delete_many({"category": cat, "period": {"$lt": per}, "auto": True, "projectId": None})
    S.ensure_slots(force=True)
    sup = db.members.find_one({"role": "pid_supervisor", "active": True})
    pic = sup["id"] if sup else member["id"]

    shared = {
        2: {"state": "in_progress", "plannedStart": "2026-11-09", "plannedEnd": "2026-11-23", "actualStart": "2026-11-09",
            "notes": "Fokus penyaringan: harga."},
        3: {"state": "skipped", "skipReason": "Konsep langsung dari hasil Expo"},
        4: {"plannedStart": "2026-11-23", "plannedEnd": "2026-12-01", "notes": "Pengujian konsep oleh Direksi",
            "details": {"panel": "Direksi"}},
        5: {"plannedStart": "2026-11-23", "plannedEnd": "2026-12-01", "notes": "Porsi kecil & besar",
            "details": {"porsi": ["Kecil", "Besar"]}},
        6: {"plannedStart": "2026-12-02", "plannedEnd": "2026-12-21", "notes": "Uji prototipe di Braga, 30 responden",
            "details": {"lokasi": "Outlet Braga", "respondenTarget": 30, "tanggalMulai": "2026-12-02", "tanggalSelesai": "2026-12-21"}},
        7: {"plannedStart": "2026-12-22", "plannedEnd": "2027-02-01",
            "notes": "Prototype Final Feb 2027; siklus berikutnya Jun, Sep, Des 2027"},
    }
    vc_cfg = {1: {"state": "done", "plannedStart": "2026-10-26", "plannedEnd": "2026-11-08", "actualStart": "2026-10-26",
                  "actualEnd": "2026-11-08", "notes": "Ide dari Expo"}}
    vc_cfg.update({k: dict(v) for k, v in shared.items()})
    vc = _mk_project("VC-2702-01", "Bumbu Cimol Q1 2027", "varian_cimol", ["Bumbu"], "2027-02-01",
                     "Menghadirkan varian bumbu cimol baru (Salted Egg, Truffle, Nori) untuk slot launch Feb 2027.",
                     2, "on_track", vc_cfg, pic)

    mn_cfg = {1: {"state": "in_progress", "plannedStart": "2026-10-26", "plannedEnd": "2026-11-08", "actualStart": "2026-10-26",
                  "notes": "Satu baris dengan Bumbu Cimol di whiteboard; kandidat minuman belum diisi"}}
    mn_cfg.update({k: dict(v, state="not_started", actualStart=None) if k == 2 else dict(v) for k, v in shared.items()})
    mn = _mk_project("MN-2702-01", "Minuman Q1 2027", "minuman", [], "2027-02-01",
                     "Menu minuman baru untuk slot launch Feb 2027, berjalan paralel dengan Bumbu Cimol.",
                     1, "on_track", mn_cfg, pic)

    of_cfg = {
        1: {"state": "done", "plannedStart": "2026-10-27", "plannedEnd": "2026-10-31", "actualStart": "2026-10-27", "actualEnd": "2026-10-31"},
        2: {"state": "in_progress", "plannedStart": "2026-11-01", "plannedEnd": "2026-11-09", "actualStart": "2026-11-01",
            "notes": "Penyaringan berbasis data GoFood"},
        3: {"state": "skipped", "skipReason": "Langsung prototipe berdasarkan data GoFood"},
        4: {"state": "skipped", "skipReason": "Langsung prototipe berdasarkan data GoFood"},
        5: {"plannedStart": "2026-11-10", "plannedEnd": "2026-11-20"},
        6: {"plannedStart": "2026-11-23", "plannedEnd": "2026-12-01"},
        7: {"plannedStart": "2026-12-02", "plannedEnd": "2027-01-05", "notes": "Prototype Final Jan 2027"},
    }
    of = _mk_project("OF-2701-01", "Produk Online Jan 2027", "online_food", [], "2027-01-05",
                     "Menu khusus Online Food berbasis data GoFood untuk launch Jan 2027.", 2, "on_track", of_cfg, pic)

    nb_cfg = {6: {"plannedStart": "2027-03-01", "plannedEnd": "2027-03-31", "notes": "Target pengujian prototipe Mar 2027"}}
    nb = _mk_project("NB-2703-01", "Brand Baru 2027", "new_brand", [], None,
                     "Konsep brand baru CRK; launch date ditentukan PID Head.", 1, "not_started", nb_cfg, pic)

    for p in (vc, mn, of, nb):
        db.projects.insert_one(p)
    for slot_period, p in (("2027-02", vc), ("2027-02", mn), ("2027-01", of)):
        s = db.slots.find_one({"category": p["category"], "period": slot_period})
        if s:
            db.slots.update_one({"id": s["id"]}, {"$set": {"projectId": p["id"]}})
            db.projects.update_one({"id": p["id"]}, {"$set": {"slotId": s["id"]}})
    for nama in ("Salted Egg", "Truffle", "Nori"):
        db.kandidat.insert_one({"id": D.new_id(), "projectId": vc["id"], "nama": nama, "deskripsi": f"Bumbu cimol {nama}",
                                "sumberIde": "Expo/Event", "sumberDetail": "Expo", "referensi": [], "status": "ide",
                                "maxStatus": "ide", "screeningScores": {}, "screeningTotal": None, "estHargaJual": None,
                                "estHpp": None, "concept": {}, "recipe": {}, "testResult": {}, "photos": [],
                                "createdAt": D.now_utc_iso()})
    for p in (vc, mn, of, nb):
        S.log_activity(p["id"], member, "import", note="Import data whiteboard SO-PID-010 (9 Nov 2026)")
    return {"ok": True, "projects": 4}
