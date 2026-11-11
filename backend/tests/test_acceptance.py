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

FIXED_TODAY = date(2026, 11, 10)


@pytest.fixture(scope="module")
def c():
    D.today = lambda: FIXED_TODAY  # freeze at whiteboard date
    dbmod.reset_mock_db()
    with TestClient(app) as client:
        yield client


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


def reg(c, name, role, pin="1111"):
    r = c.post("/api/auth/register", json={"name": name, "role": role, "email": f"{name.lower()}@citarasakuliner.com",
                                           "phone": "081234567890", "pin": pin})
    assert r.status_code == 200, r.text
    return r.json()


def test_full_flow(c):
    handry = reg(c, "Handry", "pid_head")
    assert handry["member"]["isAdmin"] is True
    c.put("/api/settings", headers=H(handry["token"]), json={"registrationMode": "open"})
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
    assert r["text"].startswith("WEEKLY UPDATE PID CRK — 10 Nov 2026")
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


def test_regressions(c):
    th = c.post("/api/auth/admin-login", json={"pin": "1234"}).json()["token"]
    # only the first user may self-register as PID Head
    r = c.post("/api/auth/register", json={"name": "Orang Luar", "email": "orangluar@citarasakuliner.com", "role": "pid_head", "pin": "1111"})
    assert r.status_code == 409 and "Handry" in r.json()["detail"]
    st = c.get("/api/state", headers=H(th)).json()
    vc = next(p for p in st["projects"] if p["kode"] == "VC-2702-01")
    # planned override (whiteboard 9-23 Nov) is the deadline, not start+SLA
    assert vc["flags"]["deadline"] == "2026-11-23" and vc["flags"]["slaSisa"] == 13
    # Indonesian number formats
    k = c.post("/api/kandidat", headers=H(th), json={"projectId": vc["id"], "nama": "Keju Lumer"}).json()
    r = c.post(f"/api/kandidat/{k['id']}/bom", headers=H(th), json={"bahan": "Keju", "qty": "4,5", "unit": "g", "hargaPerUnit": "120.000"})
    assert r.status_code == 200 and r.json()["qty"] == 4.5 and r.json()["hargaPerUnit"] == 120000 and r.json()["biayaPerPorsi"] == 540
    assert c.post(f"/api/kandidat/{k['id']}/bom", headers=H(th), json={"bahan": "X", "qty": "abc"}).status_code == 400
    # re-scoring keeps lolos/gugur in sync until set manually
    low = {"market": 2, "harga": 2, "ops": 2, "bahan": 2, "diferensiasi": 2}
    c.put(f"/api/kandidat/{k['id']}/scores", headers=H(th), json={"scores": low})
    c.put(f"/api/kandidat/{k['id']}/scores", headers=H(th), json={"scores": {x: 5 for x in low}})
    d = c.get(f"/api/projects/{vc['id']}", headers=H(th)).json()
    assert next(x for x in d["kandidat"] if x["id"] == k["id"])["status"] == "lolos_screening"
    c.put(f"/api/kandidat/{k['id']}", headers=H(th), json={"status": "gugur"})
    c.put(f"/api/kandidat/{k['id']}/scores", headers=H(th), json={"scores": {x: 4 for x in low}})
    d = c.get(f"/api/projects/{vc['id']}", headers=H(th)).json()
    assert next(x for x in d["kandidat"] if x["id"] == k["id"])["status"] == "gugur"
    # leaving II: only undecided kandidat must be scored (Salted Egg etc. still unscored -> blocked)
    r = c.post(f"/api/projects/{vc['id']}/stage", headers=H(th), json={"to": 4})
    assert r.status_code == 400 and "Salted Egg" in r.json()["detail"]
    # code numbering survives deletes
    a = c.post("/api/projects", headers=H(th), json={"nama": "NB A", "category": "new_brand", "targetLaunch": "2027-10-01"}).json()["project"]
    b = c.post("/api/projects", headers=H(th), json={"nama": "NB B", "category": "new_brand", "targetLaunch": "2027-10-01"}).json()["project"]
    c.delete(f"/api/projects/{a['id']}", headers=H(th))
    r = c.post("/api/projects", headers=H(th), json={"nama": "NB C", "category": "new_brand", "targetLaunch": "2027-10-01"})
    assert r.status_code == 200 and r.json()["project"]["kode"] == "NB-2710-03"
    # skipping II promotes undecided ideas so the project is not stuck at the prototype gate
    p = c.post("/api/projects", headers=H(th), json={"nama": "OF Mar", "category": "online_food", "targetLaunch": "2027-03-05"}).json()["project"]
    c.post("/api/kandidat", headers=H(th), json={"projectId": p["id"], "nama": "Rice bowl"})
    c.post(f"/api/projects/{p['id']}/stage", headers=H(th), json={"to": 2})
    r = c.post(f"/api/projects/{p['id']}/skip", headers=H(th), json={"reason": "Data GoFood sudah jelas"})
    assert r.json()["kandidat"][0]["status"] == "konsep"
    # decision only on a running stage; stage VI target defaults to 30
    assert c.post(f"/api/projects/{p['id']}/decision", headers=H(th), json={"decision": "go"}).status_code == 400
    # last admin cannot be deactivated
    me = c.get("/api/state", headers=H(th)).json()["me"]
    assert c.put(f"/api/members/{me['id']}", headers=H(th), json={"active": False}).status_code == 400
    # stage VII food cost with formatted numbers
    r = c.put(f"/api/projects/{p['id']}/stages/7", headers=H(th), json={"details": {"hargaFinal": "25.000", "hppFinal": "8.750"}})
    assert r.json()["project"]["stages"][6]["details"]["foodCostPct"] == 35.0


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


def test_full_lifecycle_to_launch(c):
    th = c.post("/api/auth/admin-login", json={"pin": "1234"}).json()["token"]
    st = c.get("/api/state", headers=H(th)).json()
    slot = next(s for s in st["slots"] if s["category"] == "online_food" and s["period"] == "2027-02")
    p = c.post("/api/projects", headers=H(th), json={"nama": "OF Feb 2027", "category": "online_food", "slotId": slot["id"]}).json()["project"]
    pid = p["id"]
    k = c.post("/api/kandidat", headers=H(th), json={"projectId": pid, "nama": "Chicken Katsu Cimol"}).json()
    k2 = c.post("/api/kandidat", headers=H(th), json={"projectId": pid, "nama": "Beef Bulgogi Cimol"}).json()
    v = c.post("/api/vendors", headers=H(th), json={"nama": "Vendor Katsu", "statusVendor": "approved"}).json()
    ok = lambda r: (r.status_code == 200) or print(r.text)
    assert ok(c.post(f"/api/projects/{pid}/stage", headers=H(th), json={"to": 2}))
    for kid in (k["id"], k2["id"]):
        c.put(f"/api/kandidat/{kid}/scores", headers=H(th), json={"scores": {x: 4 for x in ("market", "harga", "ops", "bahan", "diferensiasi")}})
    for to in (3, 4):
        assert ok(c.post(f"/api/projects/{pid}/stage", headers=H(th), json={"to": to}))
    c.post(f"/api/projects/{pid}/request-decision", headers=H(th), json={})
    assert ok(c.post(f"/api/projects/{pid}/decision", headers=H(th), json={"decision": "go", "kandidat": {k2["id"]: "drop"}}))
    assert ok(c.post(f"/api/projects/{pid}/stage", headers=H(th), json={"to": 5}))
    assert ok(c.post(f"/api/kandidat/{k['id']}/bom", headers=H(th), json={"bahan": "Ayam katsu", "qty": 80, "hargaPerUnit": 65000, "vendorId": v["id"]}))
    c.put(f"/api/kandidat/{k['id']}", headers=H(th), json={"photos": ["/api/files/x"], "recipe": {"hargaJual": 25000}})
    assert ok(c.post(f"/api/projects/{pid}/stage", headers=H(th), json={"to": 6}))  # dropped kandidat not required
    r = c.post(f"/api/projects/{pid}/stage", headers=H(th), json={"to": 7})
    assert r.status_code == 400 and "keputusan" in r.json()["detail"].lower()
    c.post(f"/api/projects/{pid}/decision", headers=H(th), json={"decision": "go"})
    r = c.post(f"/api/projects/{pid}/stage", headers=H(th), json={"to": 7})
    assert r.status_code == 400 and "Responden baru 0 dari target 30" in r.json()["detail"]
    c.put(f"/api/projects/{pid}/stages/6", headers=H(th), json={"details": {"respondenActual": 31}})
    assert ok(c.post(f"/api/projects/{pid}/stage", headers=H(th), json={"to": 7}))
    c.put(f"/api/projects/{pid}/stages/7", headers=H(th), json={"details": {"launchDate": "2027-02-03", "hargaFinal": 25000, "hppFinal": 7800}})
    c.post(f"/api/projects/{pid}/decision", headers=H(th), json={"decision": "go"})
    r = c.post(f"/api/projects/{pid}/stage", headers=H(th), json={"to": 8})
    assert r.status_code == 400 and "hand-off" in r.json()["detail"]
    items = [dict(h, done=True) if h["key"] != "frozen" else dict(h, na=True) for h in r.json().get("project", {}).get("handoff", []) or
             c.get(f"/api/projects/{pid}", headers=H(th)).json()["project"]["handoff"]]
    c.put(f"/api/projects/{pid}/handoff", headers=H(th), json={"items": items})
    r = c.post(f"/api/projects/{pid}/stage", headers=H(th), json={"to": 8})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["project"]["status"] == "done" and d["project"]["launchedAt"] == "2027-02-03"
    ks = {x["nama"]: x["status"] for x in d["kandidat"]}
    assert ks == {"Chicken Katsu Cimol": "launch", "Beef Bulgogi Cimol": "drop"}
    st = c.get("/api/state", headers=H(th)).json()
    s2 = next(s for s in st["slots"] if s["id"] == slot["id"])
    assert s2["flags"]["launched"] is True
    assert st["funnel"][-1]["count"] >= 1
    rep = c.get(f"/api/report?t={st['settings']['shareToken']}").json()
    assert any(x["id"] == pid for x in rep["launched"])
    assert next(x for x in rep["projects"] if x["id"] == pid)["foodCost"] == "sesuai target"


def test_porsi_files_survey(c):
    th = c.post("/api/auth/admin-login", json={"pin": "1234"}).json()["token"]
    p = c.post("/api/projects", headers=H(th), json={"nama": "Saos Q3", "category": "varian_cimol", "subType": ["Saos"],
                                                     "targetLaunch": "2027-09-01"}).json()["project"]
    pid = p["id"]
    k = c.post("/api/kandidat", headers=H(th), json={"projectId": pid, "nama": "Saos Keju Pedas"}).json()
    k2 = c.post("/api/kandidat", headers=H(th), json={"projectId": pid, "nama": "Saos Mentai"}).json()
    c.post(f"/api/projects/{pid}/stage", headers=H(th), json={"to": 2})
    for kid in (k["id"], k2["id"]):
        c.put(f"/api/kandidat/{kid}/scores", headers=H(th), json={"scores": {x: 4 for x in ("market", "harga", "ops", "bahan", "diferensiasi")}})
    c.post(f"/api/projects/{pid}/stage", headers=H(th), json={"to": 3})
    c.post(f"/api/projects/{pid}/skip", headers=H(th), json={"reason": "Konsep sudah dari Direksi"})
    c.post(f"/api/projects/{pid}/skip", headers=H(th), json={"reason": "Direksi sudah setuju konsep"})
    assert c.get(f"/api/projects/{pid}", headers=H(th)).json()["project"]["currentStage"] == 5
    # porsi HPP: base 3.000/porsi kecil; besar x1,6 => 4.800
    c.post(f"/api/kandidat/{k['id']}/bom", headers=H(th), json={"bahan": "Saos keju", "qty": 30, "unit": "g", "hargaPerUnit": 100000})
    c.put(f"/api/kandidat/{k['id']}", headers=H(th), json={"recipe": {"porsi": [
        {"nama": "Kecil", "multiplier": 1, "hargaJual": 12000}, {"nama": "Besar", "multiplier": "1,6", "hargaJual": "18.000"}]}})
    d = c.get(f"/api/projects/{pid}", headers=H(th)).json()
    kk = next(x for x in d["kandidat"] if x["id"] == k["id"])
    assert [(r["nama"], r["hpp"], r["foodCostPct"]) for r in kk["porsiHpp"]] == [("Kecil", 3000, 25.0), ("Besar", 4800, 26.7)]
    assert kk["maxFoodCostPct"] == 26.7
    # stage attachment upload + delete (also removes it from kandidat photos)
    r = c.post("/api/files", headers=H(th), files={"file": ("sop.pdf", b"%PDF-1.4 test", "application/pdf")},
               data={"projectId": pid, "stage": "5", "kind": "attachment"})
    f = r.json()
    assert r.status_code == 200 and f["stage"] == 5 and "path" not in f
    d = c.get(f"/api/projects/{pid}", headers=H(th)).json()
    assert any(x["id"] == f["id"] for x in d["files"])
    assert c.delete(f"/api/files/{f['id']}", headers=H(th)).status_code == 200
    assert c.get(f["url"]).status_code == 404
    # vendor attachments
    v = c.post("/api/vendors", headers=H(th), json={"nama": "Vendor Saos"}).json()
    c.post("/api/files", headers=H(th), files={"file": ("pricelist.pdf", b"%PDF", "application/pdf")}, data={"vendorId": v["id"], "kind": "pricelist"})
    vs = c.get("/api/vendors", headers=H(th)).json()
    assert next(x for x in vs if x["id"] == v["id"])["files"][0]["name"] == "pricelist.pdf"

    # ---- survey ----
    c.put(f"/api/kandidat/{k['id']}", headers=H(th), json={"photos": ["/api/files/x"]})
    c.put(f"/api/kandidat/{k2['id']}", headers=H(th), json={"photos": ["/api/files/y"]})
    c.post(f"/api/kandidat/{k2['id']}/bom", headers=H(th), json={"bahan": "Mentai", "qty": 20, "unit": "g", "hargaPerUnit": 150000})
    assert c.post(f"/api/projects/{pid}/stage", headers=H(th), json={"to": 6}).status_code == 200
    c.put(f"/api/projects/{pid}/stages/6", headers=H(th), json={"details": {"respondenTarget": 3, "lokasi": "Outlet Braga"}})
    info = c.post(f"/api/projects/{pid}/survey", headers=H(th), json={"action": "open"}).json()
    assert info["open"] is True and info["count"] == 0
    tok = info["token"]
    pub = c.get(f"/api/survey/{tok}").json()
    assert pub["open"] and pub["lokasi"] == "Outlet Braga" and {x["nama"] for x in pub["kandidat"]} == {"Saos Keju Pedas", "Saos Mentai"}
    assert next(x for x in pub["kandidat"] if x["id"] == k["id"])["porsi"] == ["Kecil", "Besar"]
    assert "hpp" not in str(pub).lower() and "harga" not in str(pub["kandidat"]).lower()
    ans = lambda rasa, intent, ok, porsi="Kecil", cm="": {"kandidatId": k["id"], "rasa": rasa, "tekstur": 4, "porsiScore": 3, "harga": 4,
                                                           "intent": intent, "priceOk": ok, "porsi": porsi, "comment": cm}
    assert c.post(f"/api/survey/{tok}", json={"clientId": "a", "answers": [ans(5, "pasti", True, cm="Enak, pedasnya pas")]}).status_code == 200
    assert c.post(f"/api/survey/{tok}", json={"clientId": "a", "answers": [ans(5, "pasti", True)]}).status_code == 409
    assert c.post(f"/api/survey/{tok}", json={"clientId": "b", "answers": [ans(9, "pasti", True)]}).status_code == 400
    assert c.post(f"/api/survey/{tok}", json={"clientId": "b", "answers": [{"kandidatId": k["id"]}]}).status_code == 400
    c.post(f"/api/survey/{tok}", json={"clientId": "b", "answers": [ans(4, "mungkin", False, "Besar", "Kurang asin")]})
    c.post(f"/api/survey/{tok}", json={"clientId": "c", "answers": [ans(3, "pasti", True),
                                                                   {"kandidatId": k2["id"], "rasa": 4, "intent": "tidak"}]})
    d = c.get(f"/api/projects/{pid}", headers=H(th)).json()
    pr = next(x for x in d["kandidat"] if x["id"] == k["id"])["testResult"]["prototipe"]
    assert pr["n"] == 3 and pr["rasa"] == 4.0 and pr["intentPasti"] == 67 and pr["priceAcceptance"] == 67
    assert pr["byPorsi"]["Besar"]["n"] == 1 and "Kurang asin" in pr["feedback"]
    assert d["project"]["stages"][5]["details"]["respondenActual"] == 3
    # target reached -> closed
    st = c.get(f"/api/survey/{tok}").json()
    assert st["open"] is False and "Target" in st["reason"]
    assert c.post(f"/api/survey/{tok}", json={"clientId": "d", "answers": [ans(5, "pasti", True)]}).status_code == 400
    # gate VI now satisfied by survey count
    c.post(f"/api/projects/{pid}/decision", headers=H(th), json={"decision": "go"})
    assert c.post(f"/api/projects/{pid}/stage", headers=H(th), json={"to": 7}).status_code == 200
    # team views + csv + delete response recomputes
    rows = c.get(f"/api/projects/{pid}/survey", headers=H(th)).json()["rows"]
    assert len(rows) == 3 and "clientId" not in rows[0]
    csvt = c.get(f"/api/projects/{pid}/survey.csv", headers=H(th)).text
    assert "Saos Mentai" in csvt and "Kurang asin" in csvt
    c.delete(f"/api/responses/{rows[0]['id']}", headers=H(th))
    d = c.get(f"/api/projects/{pid}", headers=H(th)).json()
    assert d["project"]["stages"][5]["details"]["respondenActual"] == 2
    assert c.get("/api/survey/salah").status_code == 404
    # SLA compliance per category
    st = c.get("/api/state", headers=H(th)).json()
    assert set(st["slaComplianceByCat"]) == {"varian_cimol", "minuman", "online_food", "new_brand"}


def test_whatsapp_fonnte(c):
    from app import wa as WA
    os.environ["WA_SYNC"] = "1"
    sent = []

    class R:
        def __init__(self, ok=True): self.status_code, self._ok = 200, ok
        def json(self): return {"status": self._ok} if self._ok else {"status": False, "reason": "invalid token"}

    def fake_post(url, headers, data):
        sent.append({"url": url, "auth": headers["Authorization"], **data})
        return R(ok=headers["Authorization"] != "salah")
    WA._post = fake_post
    th = c.post("/api/auth/admin-login", json={"pin": "1234"}).json()["token"]
    st = c.get("/api/state", headers=H(th)).json()
    head = next(m for m in st["members"] if m["role"] == "pid_head")
    sup = next(m for m in st["members"] if m["role"] == "pid_supervisor")
    c.put(f"/api/members/{head['id']}", headers=H(th), json={"phone": "081111111111"})
    c.put(f"/api/members/{sup['id']}", headers=H(th), json={"phone": "082222222222"})

    # disabled by default: nothing sent
    p = c.post("/api/projects", headers=H(th), json={"nama": "Minuman Jun", "category": "minuman", "targetLaunch": "2027-06-01",
                                                     "picId": sup["id"]}).json()["project"]
    c.post(f"/api/projects/{p['id']}/status", headers=H(th), json={"status": "blocked", "note": "Tes"})
    assert sent == []

    # enable with token + group, token never returned to clients
    c.put("/api/settings", headers=H(th), json={"waEnabled": True, "waToken": "TOKEN123", "waGroup": "120363000000@g.us"})
    st = c.get("/api/state", headers=H(th)).json()
    assert "TOKEN123" not in str(st) and st["settings"]["waHasToken"] is True
    assert "TOKEN123" not in str(c.get("/api/wa", headers=H(th)).json())

    # test message
    r = c.post("/api/wa/test", headers=H(th), json={})
    assert r.status_code == 200 and sent[-1]["target"] == "6281111111111" and sent[-1]["auth"] == "TOKEN123"
    assert sent[-1]["url"] == "https://api.fonnte.com/send"

    # blocked -> PID Head
    c.post(f"/api/projects/{p['id']}/status", headers=H(th), json={"status": "on_track"})
    c.post(f"/api/projects/{p['id']}/status", headers=H(th), json={"status": "blocked", "note": "Sampel gula aren telat"})
    assert "BLOCKED" in sent[-1]["message"] and "Sampel gula aren telat" in sent[-1]["message"] and sent[-1]["target"] == "6281111111111"

    # decision request -> head; decision result -> PIC (supervisor)
    pid = p["id"]
    c.post("/api/kandidat", headers=H(th), json={"projectId": pid, "nama": "Es Teh Leci"})
    c.post(f"/api/projects/{pid}/stage", headers=H(th), json={"to": 2})
    c.post(f"/api/projects/{pid}/skip", headers=H(th), json={"reason": "x"})
    c.post(f"/api/projects/{pid}/skip", headers=H(th), json={"reason": "y"})
    assert c.get(f"/api/projects/{pid}", headers=H(th)).json()["project"]["currentStage"] == 4
    c.post(f"/api/projects/{pid}/request-decision", headers=H(th), json={"note": "Mohon review"})
    assert "Keputusan dibutuhkan" in sent[-1]["message"] and sent[-1]["target"] == "6281111111111" and "/#/proyek/" in sent[-1]["message"]
    c.post(f"/api/projects/{pid}/decision", headers=H(th), json={"decision": "revisi", "note": "Kurangi manis"})
    assert "Keputusan REVISI" in sent[-1]["message"] and sent[-1]["target"] == "6282222222222"

    # event switched off -> not sent, but logged
    n = len(sent)
    ev = c.get("/api/wa", headers=H(th)).json()["events"]
    c.put("/api/settings", headers=H(th), json={"waEvents": {**ev, "decisionRequest": False}})
    c.post(f"/api/projects/{pid}/request-decision", headers=H(th), json={})
    assert len(sent) == n
    log = c.get("/api/wa", headers=H(th)).json()["log"]
    assert log[0]["ok"] is False and "dimatikan" in log[0]["reason"]

    # weekly -> group
    r = c.post("/api/jobs/weekly/run", headers=H(th)).json()
    assert r["email"]["wa"]["ok"] and sent[-1]["target"] == "120363000000@g.us" and sent[-1]["message"].startswith("WEEKLY UPDATE PID CRK")

    # Fonnte rejects token -> clear error
    c.put("/api/settings", headers=H(th), json={"waToken": "salah"})
    r = c.post("/api/wa/test", headers=H(th), json={})
    assert r.status_code == 400 and "invalid token" in r.json()["detail"]
    c.put("/api/settings", headers=H(th), json={"waEnabled": False})
    os.environ.pop("WA_SYNC")
