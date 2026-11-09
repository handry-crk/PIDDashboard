"""Acceptance tests from the build spec (CRK PID Dashboard)."""
import os
import tempfile
from datetime import date

os.environ["USE_MOCK_DB"] = "true"
os.environ["ENABLE_SCHEDULER"] = "false"
os.environ["UPLOAD_DIR"] = tempfile.mkdtemp()
os.environ["BACKUP_DIR"] = tempfile.mkdtemp()

import pytest
from fastapi.testclient import TestClient

from app import domain as D, db as dbmod
from app.main import app

FIXED_TODAY = date(2026, 11, 9)


@pytest.fixture(scope="module")
def c():
    D.today = lambda: FIXED_TODAY  # freeze at whiteboard date
    dbmod.reset_mock_db()
    with TestClient(app) as client:
        yield client


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


def reg(c, name, role, pin="1111"):
    r = c.post("/api/auth/register", json={"name": name, "role": role, "email": f"{name.lower()}@crk.id",
                                           "phone": "081234567890", "pin": pin})
    assert r.status_code == 200, r.text
    return r.json()


def test_full_flow(c):
    handry = reg(c, "Handry", "pid_head")
    assert handry["member"]["isAdmin"] is True
    sinta = reg(c, "Sinta", "pid_supervisor")
    ari = reg(c, "Ari", "pid_staff")
    direksi = reg(c, "Direksi", "viewer")
    assert sinta["member"]["isAdmin"] is False
    th, ts, ta, tv = handry["token"], sinta["token"], ari["token"], direksi["token"]

    # import whiteboard
    r = c.post("/api/seed/whiteboard", headers=H(th))
    assert r.status_code == 200, r.text
    st = c.get("/api/state", headers=H(th)).json()
    ps = {p["kode"]: p for p in st["projects"]}
    assert set(ps) == {"VC-2702-01", "MN-2702-01", "OF-2701-01", "NB-2703-01"}
    vc = ps["VC-2702-01"]
    assert vc["currentStage"] == 2 and vc["stages"][2]["state"] == "skipped"
    assert vc["targetLaunch"].startswith("2027-02")
    assert ps["OF-2701-01"]["flags"]["lewatSla"] is True
    assert vc["flags"]["lewatSla"] is False
    # second import refused
    assert c.post("/api/seed/whiteboard", headers=H(th)).status_code == 400

    # Sinta creates VC Jun 2027 (Isian) on slot
    slot = next(s for s in st["slots"] if s["category"] == "varian_cimol" and s["period"] == "2027-06")
    r = c.post("/api/projects", headers=H(ts), json={"nama": "Varian Cimol Jun 2027", "category": "varian_cimol",
                                                     "subType": ["Isian"], "slotId": slot["id"]})
    assert r.status_code == 200, r.text
    p = r.json()["project"]
    assert p["kode"] == "VC-2706-01"
    stages = p["stages"]
    assert stages[6]["plannedEnd"] == "2027-06-01"
    total = (date.fromisoformat(stages[6]["plannedEnd"]) - date.fromisoformat(stages[0]["plannedStart"])).days
    assert total == 87
    pid = p["id"]
    # slot taken
    r = c.post("/api/projects", headers=H(ts), json={"nama": "Dobel", "category": "varian_cimol", "subType": ["Saos"],
                                                     "slotId": slot["id"]})
    assert r.status_code == 409
    # Varian Cimol requires subType
    assert c.post("/api/projects", headers=H(ts), json={"nama": "Tes", "category": "varian_cimol"}).status_code == 400

    # gate leave I without kandidat
    r = c.post(f"/api/projects/{pid}/stage", headers=H(ts), json={"to": 2})
    assert r.status_code == 400 and "minimal 1 kandidat" in r.json()["detail"]
    kids = []
    for n in ("Mozza Lumer", "Ayam Suwir Pedas", "Sosis Keju"):
        r = c.post("/api/kandidat", headers=H(ts), json={"projectId": pid, "nama": n, "sumberIde": "Trend socmed"})
        kids.append(r.json()["id"])
    assert c.post(f"/api/projects/{pid}/stage", headers=H(ts), json={"to": 2}).status_code == 200
    # leave II without scores
    r = c.post(f"/api/projects/{pid}/stage", headers=H(ts), json={"to": 3})
    assert r.status_code == 400 and "scoring" in r.json()["detail"]
    good = {"market": 5, "harga": 4, "ops": 4, "bahan": 3, "diferensiasi": 4}  # 4.1
    bad = {"market": 2, "harga": 2, "ops": 3, "bahan": 3, "diferensiasi": 2}
    r = c.put(f"/api/kandidat/{kids[0]}/scores", headers=H(ts), json={"scores": good})
    assert r.json()["screeningTotal"] == 4.1 and r.json()["suggested"] == "lolos_screening"
    for k in kids[1:]:
        c.put(f"/api/kandidat/{k}/scores", headers=H(ts), json={"scores": bad})
    assert c.post(f"/api/projects/{pid}/stage", headers=H(ts), json={"to": 3}).status_code == 200
    assert c.post(f"/api/projects/{pid}/stage", headers=H(ts), json={"to": 4}).status_code == 200
    # cannot advance from IV without decision
    assert c.post(f"/api/projects/{pid}/stage", headers=H(ts), json={"to": 5}).status_code == 400
    c.post(f"/api/projects/{pid}/request-decision", headers=H(ts), json={"note": "Mohon review"})
    st = c.get("/api/state", headers=H(th)).json()
    assert any(x["id"] == pid and x["waitingDecision"] for x in st["projects"])
    # Sinta cannot decide
    assert c.post(f"/api/projects/{pid}/decision", headers=H(ts), json={"decision": "go"}).status_code == 403
    r = c.post(f"/api/projects/{pid}/decision", headers=H(th), json={"decision": "go", "note": "Lanjut"})
    assert r.status_code == 200
    tl = c.get(f"/api/projects/{pid}/timeline", headers=H(th)).json()
    assert any(a.get("action") == "decision" for a in tl)
    assert c.post(f"/api/projects/{pid}/stage", headers=H(ts), json={"to": 5}).status_code == 200

    # BOM / HPP
    vc_kid = kids[0]
    r = c.post(f"/api/kandidat/{vc_kid}/bom", headers=H(ta), json={"bahan": "Truffle oil", "qty": 5, "unit": "g", "hargaPerUnit": 400000})
    assert r.status_code == 200, r.text
    c.post(f"/api/kandidat/{vc_kid}/bom", headers=H(ta), json={"bahan": "Cimol", "qty": 120, "unit": "g", "hargaPerUnit": 18000})
    c.put(f"/api/kandidat/{vc_kid}", headers=H(ta), json={"recipe": {"hargaJual": 15000}})
    det = c.get(f"/api/projects/{pid}", headers=H(th)).json()
    k = next(x for x in det["kandidat"] if x["id"] == vc_kid)
    assert k["hpp"] == 4160 and k["foodCostPct"] == 27.7

    # Ari cannot advance, can edit stage V/VI
    assert c.post(f"/api/projects/{pid}/stage", headers=H(ta), json={"to": 6}).status_code == 403
    assert c.put(f"/api/projects/{pid}/stages/6", headers=H(ta), json={"details": {"respondenTarget": 30}}).status_code == 200
    assert c.put(f"/api/projects/{pid}/stages/2", headers=H(ta), json={"notes": "x"}).status_code == 403
    # viewer read-only
    assert c.post("/api/kandidat", headers=H(tv), json={"projectId": pid, "nama": "Y"}).status_code == 403

    # leave V needs photo
    r = c.post(f"/api/projects/{pid}/stage", headers=H(ts), json={"to": 6})
    assert r.status_code == 400 and "foto" in r.json()["detail"]
    from PIL import Image
    import io
    buf = io.BytesIO()
    Image.new("RGB", (2400, 1800), (180, 47, 39)).save(buf, "JPEG")
    r = c.post("/api/files", headers=H(ta), files={"file": ("proto.jpg", buf.getvalue(), "image/jpeg")},
               data={"projectId": pid, "kandidatId": vc_kid})
    assert r.status_code == 200
    f = r.json()
    img = Image.open(io.BytesIO(c.get(f["url"]).content))
    assert max(img.size) == 1600
    c.put(f"/api/kandidat/{vc_kid}", headers=H(ta), json={"photos": [f["url"]]})
    assert c.post(f"/api/projects/{pid}/stage", headers=H(ts), json={"to": 6}).status_code == 200

    # Online Food vendor rules
    of_id = ps["OF-2701-01"]["id"]
    rk = c.post("/api/kandidat", headers=H(ts), json={"projectId": of_id, "nama": "Chicken Pop Mozza"}).json()
    r = c.post(f"/api/kandidat/{rk['id']}/bom", headers=H(ts), json={"bahan": "Ayam", "qty": 100, "hargaPerUnit": 50000})
    assert r.status_code == 400 and "vendor" in r.json()["detail"]
    v_black = c.post("/api/vendors", headers=H(ts), json={"nama": "Vendor X", "statusVendor": "blacklist"}).json()
    r = c.post(f"/api/kandidat/{rk['id']}/bom", headers=H(ts), json={"bahan": "Ayam", "qty": 100, "hargaPerUnit": 50000, "vendorId": v_black["id"]})
    assert r.status_code == 400 and "blacklist" in r.json()["detail"]
    v = c.post("/api/vendors", headers=H(ts), json={"nama": "PT Ayam Segar", "kategoriBahan": "Protein", "statusVendor": "approved",
                                                    "sertifikatHalal": True, "halalExpiry": "2026-11-29", "kontakHp": "081298765432"}).json()
    assert v["halalWarning"] is True
    r = c.post(f"/api/kandidat/{rk['id']}/bom", headers=H(ts), json={"bahan": "Ayam", "qty": 100, "hargaPerUnit": 50000, "vendorId": v["id"]})
    assert r.status_code == 200
    det = c.get(f"/api/projects/{of_id}", headers=H(th)).json()
    assert "PT Ayam Segar" in next(x for x in det["kandidat"] if x["id"] == rk["id"])["halalWarnings"]

    # status blocked needs note
    assert c.post(f"/api/projects/{pid}/status", headers=H(ts), json={"status": "blocked"}).status_code == 400
    assert c.post(f"/api/projects/{pid}/status", headers=H(ts), json={"status": "blocked", "note": "Menunggu sampel isian"}).status_code == 200

    # drop frees slot
    mn = ps["MN-2702-01"]
    # move MN to IV quickly: add kandidat, score, advance
    kk = c.post("/api/kandidat", headers=H(ts), json={"projectId": mn["id"], "nama": "Es Kopi Gula Aren"}).json()
    c.put(f"/api/kandidat/{kk['id']}/scores", headers=H(ts), json={"scores": good})
    assert c.post(f"/api/projects/{mn['id']}/stage", headers=H(ts), json={"to": 2}).status_code == 200  # start II
    assert c.post(f"/api/projects/{mn['id']}/stage", headers=H(ts), json={"to": 4}).status_code == 200  # III skipped
    c.post(f"/api/projects/{mn['id']}/request-decision", headers=H(ts), json={})
    assert c.post(f"/api/projects/{mn['id']}/decision", headers=H(th), json={"decision": "drop", "note": "Tidak sesuai"}).status_code == 200
    st = c.get("/api/state", headers=H(th)).json()
    s_feb = next(s for s in st["slots"] if s["category"] == "minuman" and s["period"] == "2027-02")
    assert s_feb["projectId"] is None and s_feb["flags"]["slotKosong"] is True

    # report public
    token = st["settings"]["shareToken"]
    assert c.get("/api/report?t=wrong").status_code == 404
    rep = c.get(f"/api/report?t={token}").json()
    txt = str(rep)
    assert "hargaPerUnit" not in txt and "PT Ayam Segar" not in txt and "kontakHp" not in txt and "4160" not in txt
    assert any(p["kode"] == "VC-2702-01" for p in rep["projects"])

    # weekly
    r = c.post("/api/jobs/weekly/run", headers=H(th)).json()
    assert r["text"].startswith("WEEKLY UPDATE PID CRK — 9 Nov 2026")
    assert "BUTUH DUKUNGAN" in r["text"] and "Menunggu sampel isian" in r["text"]
    assert c.get(f"/api/report/weekly-text?t={token}").text == r["text"]

    # metrics
    assert c.get("/api/public-metrics?key=bad").status_code == 401
    m = c.get("/api/public-metrics?key=change-me-metrics").json()
    assert m["activeProjects"] >= 3

    # exports
    r = c.get("/api/export/projects.csv", headers=H(th))
    assert r.status_code == 200 and "VC-2706-01" in r.text

    # backup
    assert c.post("/api/jobs/backup/run", headers=H(th)).json()["ok"]


def test_pin_lock(c):
    ms = c.get("/api/auth/members").json()
    ari = next(m for m in ms if m["name"] == "Ari")
    for _ in range(5):
        assert c.post("/api/auth/login", json={"memberId": ari["id"], "pin": "9999"}).status_code == 401
    r = c.post("/api/auth/login", json={"memberId": ari["id"], "pin": "1111"})
    assert r.status_code == 423
    th = c.post("/api/auth/admin-login", json={"pin": "1234"}).json()["token"]
    assert c.post(f"/api/members/{ari['id']}/reset-pin", headers=H(th), json={"pin": "2222"}).status_code == 200
    assert c.post("/api/auth/login", json={"memberId": ari["id"], "pin": "2222"}).status_code == 200
