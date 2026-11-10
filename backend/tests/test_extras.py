"""Launch Board sync, vendor price history, post-launch scorecard, S3 storage."""
import json
import os
import tempfile
from datetime import date

os.environ.setdefault("USE_MOCK_DB", "true")
os.environ.setdefault("ENABLE_SCHEDULER", "false")
os.environ.setdefault("UPLOAD_DIR", tempfile.mkdtemp())
os.environ.setdefault("BACKUP_DIR", tempfile.mkdtemp())

import pytest
from fastapi.testclient import TestClient

from app import domain as D, db as dbmod, config, storage as ST, launchboard as LB, wa as WA
from app.main import app

H = lambda t: {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def c():
    D.today = lambda: date(2026, 11, 10)
    dbmod.reset_mock_db()
    os.environ["WA_SYNC"] = "1"
    with TestClient(app) as client:
        yield client
    os.environ.pop("WA_SYNC", None)


def setup_project(c, th, cat="online_food", launch="2027-03-05", nama="OF Mar 2027"):
    p = c.post("/api/projects", headers=H(th), json={"nama": nama, "category": cat, "targetLaunch": launch,
                                                     "subType": ["Isian"] if cat == "varian_cimol" else []}).json()["project"]
    pid = p["id"]
    k = c.post("/api/kandidat", headers=H(th), json={"projectId": pid, "nama": "Chicken Pop"}).json()
    c.post(f"/api/projects/{pid}/stage", headers=H(th), json={"to": 2})
    c.put(f"/api/kandidat/{k['id']}/scores", headers=H(th), json={"scores": {x: 4 for x in ("market", "harga", "ops", "bahan", "diferensiasi")}})
    c.post(f"/api/projects/{pid}/stage", headers=H(th), json={"to": 3})
    c.post(f"/api/projects/{pid}/skip", headers=H(th), json={"reason": "a"})
    c.post(f"/api/projects/{pid}/skip", headers=H(th), json={"reason": "b"})
    return pid, k


def test_vendor_price_history(c):
    th = c.post("/api/auth/register", json={"name": "Handry", "role": "pid_head", "pin": "1111", "phone": "081111111111"}).json()["token"]
    sent = []
    WA._post = lambda url, headers, data: (sent.append(data), type("R", (), {"status_code": 200, "json": lambda s: {"status": True}})())[1]
    c.put("/api/settings", headers=H(th), json={"waEnabled": True, "waToken": "T"})
    v = c.post("/api/vendors", headers=H(th), json={"nama": "PT Ayam Segar", "statusVendor": "approved"}).json()
    r = c.post(f"/api/vendors/{v['id']}/prices", headers=H(th), json={"bahan": "Ayam fillet", "unit": "kg", "harga": "48.000", "berlakuMulai": "2026-11-01"})
    assert r.status_code == 200 and r.json()["current"][0]["harga"] == 48000
    pid, k = setup_project(c, th)
    # BOM line without price picks the vendor's current price
    line = c.post(f"/api/kandidat/{k['id']}/bom", headers=H(th), json={"bahan": "ayam fillet", "qty": 100, "unit": "g", "vendorId": v["id"]}).json()
    assert line["hargaPerUnit"] == 48000 and line["biayaPerPorsi"] == 4800 and line["autoPrice"] is True
    c.put(f"/api/kandidat/{k['id']}", headers=H(th), json={"recipe": {"porsi": [{"nama": "Reguler", "multiplier": 1, "hargaJual": 15000}]}})
    # scheduled future price does not apply yet
    r = c.post(f"/api/vendors/{v['id']}/prices", headers=H(th), json={"bahan": "Ayam fillet", "unit": "kg", "harga": 52000, "berlakuMulai": "2026-12-01"}).json()
    assert r["terjadwal"] and r["current"][0]["harga"] == 48000 and any(h["terjadwal"] for h in r["history"])
    # price increase today -> BOM + HPP history + food cost alert (4.800 -> 6.000 => 40% > 35%)
    r = c.post(f"/api/vendors/{v['id']}/prices", headers=H(th), json={"bahan": "Ayam fillet", "unit": "kg", "harga": 60000}).json()
    assert r["kandidatUpdated"] == 1 and r["alerts"] and r["alerts"][0]["foodCostPct"] == 40.0
    d = c.get(f"/api/projects/{pid}", headers=H(th)).json()
    kk = d["kandidat"][0]
    assert kk["hpp"] == 6000 and [h["hpp"] for h in kk["hppHistory"]] == [4800, 6000]
    assert "Food cost di atas target" in sent[-1]["message"]
    assert any(t.get("action") == "harga_vendor" for t in d["timeline"])
    # line with autoPrice off is not touched; deleting price reverts
    c.put(f"/api/bom/{line['id']}", headers=H(th), json={"autoPrice": False})
    pid_price = r["price"]["id"]
    c.delete(f"/api/prices/{pid_price}", headers=H(th))
    assert c.get(f"/api/projects/{pid}", headers=H(th)).json()["kandidat"][0]["hpp"] == 6000
    c.put(f"/api/bom/{line['id']}", headers=H(th), json={"autoPrice": True})
    c.post(f"/api/vendors/{v['id']}/prices", headers=H(th), json={"bahan": "Ayam fillet", "unit": "kg", "harga": 50000})
    assert c.get(f"/api/projects/{pid}", headers=H(th)).json()["kandidat"][0]["hpp"] == 5000
    # unit mismatch / invalid
    assert c.post(f"/api/vendors/{v['id']}/prices", headers=H(th), json={"bahan": "X", "unit": "ton", "harga": 1}).status_code == 400
    assert c.post(f"/api/vendors/{v['id']}/prices", headers=H(th), json={"bahan": "X", "unit": "kg", "harga": "abc"}).status_code == 400
    # vendor list shows current prices
    vs = c.get("/api/vendors", headers=H(th)).json()
    assert next(x for x in vs if x["id"] == v["id"])["prices"][0]["harga"] == 50000
    c.put("/api/settings", headers=H(th), json={"waEnabled": False})


def test_launchboard_sync(c, monkeypatch):
    th = c.post("/api/auth/admin-login", json={"pin": "1234"}).json()["token"]
    sheet = {"rows": [["ID", "Fase", "Divisi", "Task", "Deliverable", "PIC", "Mulai", "Selesai", "Status", "Progres (%)", "Catatan / Blocker"],
                      ["MKT-01", "Launch", "Marketing", "x", "", "", "", "", "Done", 100, ""]]}

    def fake_call(method, url, body=None):
        if method == "GET" and "Tasks!A1:K1" in url:
            return {"values": [sheet["rows"][0]]}
        if method == "GET":
            return {"values": [[r[0]] for r in sheet["rows"]]}
        if url.endswith("values:batchUpdate"):
            for u in body["data"]:
                n = int(u["range"].split("!A")[1].split(":")[0])
                sheet["rows"][n - 1] = u["values"][0]
            return {}
        sheet["rows"].extend(body["values"])
        return {}
    monkeypatch.setattr(LB, "_call", fake_call)
    # not configured
    st = c.get("/api/launchboard", headers=H(th)).json()
    assert st["configured"] is False and st["sheetId"] == LB.DEFAULT_SHEET_ID
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_JSON", json.dumps({"client_email": "pid-sync@crk.iam.gserviceaccount.com"}))
    assert c.post("/api/launchboard/test", headers=H(th)).json()["serviceEmail"] == "pid-sync@crk.iam.gserviceaccount.com"
    pid, k = setup_project(c, th, cat="varian_cimol", launch="2027-06-01", nama="Isian Jun")
    # before stage VII -> refused
    assert c.post(f"/api/projects/{pid}/launchboard/sync", headers=H(th)).status_code == 400
    # walk to VII quickly
    c.put(f"/api/kandidat/{k['id']}", headers=H(th), json={"photos": ["/api/files/x"]})
    c.post(f"/api/kandidat/{k['id']}/bom", headers=H(th), json={"bahan": "Keju", "qty": 20, "hargaPerUnit": 100000})
    c.post(f"/api/projects/{pid}/stage", headers=H(th), json={"to": 6})
    c.put(f"/api/projects/{pid}/stages/6", headers=H(th), json={"details": {"respondenActual": 30}})
    c.post(f"/api/projects/{pid}/decision", headers=H(th), json={"decision": "go"})
    r = c.post(f"/api/projects/{pid}/stage", headers=H(th), json={"to": 7})  # auto sync on entering VII
    assert r.status_code == 200
    ids = [row[0] for row in sheet["rows"]]
    assert "PID-VC-2706-01" in ids and "SOP-VC-2706-01-SOP" in ids and "MKT-VC-2706-01-LISTING" in ids
    row = next(r for r in sheet["rows"] if r[0] == "MKT-VC-2706-01-LISTING")
    assert row[1] == "Pre Launch" and row[2] == "Marketing" and row[8] == "On track" and row[7] == "2027-06-01"
    n_rows = len(sheet["rows"])
    # mark item done + N/A frozen -> update in place, not duplicated
    proj = c.get(f"/api/projects/{pid}", headers=H(th)).json()["project"]
    items = [dict(h, done=h["key"] == "listing", na=h["key"] == "frozen") for h in proj["handoff"]]
    c.put(f"/api/projects/{pid}/handoff", headers=H(th), json={"items": items})
    row = next(r for r in sheet["rows"] if r[0] == "MKT-VC-2706-01-LISTING")
    assert row[8] == "Done" and row[9] == 100 and len(sheet["rows"]) == n_rows
    d = c.post(f"/api/projects/{pid}/launchboard/sync", headers=H(th)).json()
    assert d["project"]["launchBoardSync"]["ok"] and d["project"]["launchBoardSync"]["updated"] >= 6
    assert sheet["rows"][1][0] == "MKT-01"  # existing rows untouched
    # sheet error surfaces clearly
    monkeypatch.setattr(LB, "_call", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("The caller does not have permission")))
    r = c.post(f"/api/projects/{pid}/launchboard/sync", headers=H(th))
    assert r.status_code == 400 and "permission" in r.json()["detail"]


def test_launchboard_appsscript(c, monkeypatch):
    th = c.post("/api/auth/admin-login", json={"pin": "1234"}).json()["token"]
    monkeypatch.delenv("GOOGLE_SERVICE_ACCOUNT_JSON", raising=False)
    got = []

    def fake_webhook(payload):
        got.append(payload)
        if payload.get("action") == "test":
            return {"ok": True, "sheet": "CRK Product Launch Tracker"}
        return {"ok": True, "updated": 0, "appended": len(payload["rows"])}
    monkeypatch.setattr(LB, "_webhook", fake_webhook)
    assert c.put("/api/settings", headers=H(th), json={"launchWebhookUrl": "https://evil.example.com/x"}).status_code == 400
    c.put("/api/settings", headers=H(th), json={"launchWebhookUrl": "https://script.google.com/macros/s/ABC/exec"})
    st = c.get("/api/launchboard", headers=H(th)).json()
    assert st["mode"] == "appsscript" and st["configured"] and len(st["webhookSecret"]) > 10
    assert st["webhookSecret"] not in str(c.get("/api/state", headers=H(th)).json())
    assert c.post("/api/launchboard/test", headers=H(th)).json()["sheet"] == "CRK Product Launch Tracker"
    p = next(x for x in c.get("/api/state", headers=H(th)).json()["projects"] if x["nama"] == "Isian Jun")
    d = c.post(f"/api/projects/{p['id']}/launchboard/sync", headers=H(th)).json()
    assert d["project"]["launchBoardSync"]["ok"] and got[-1]["rows"][0][0] == "PID-VC-2706-01"
    c.put("/api/settings", headers=H(th), json={"launchWebhookUrl": ""})


def test_scorecard(c):
    th = c.post("/api/auth/admin-login", json={"pin": "1234"}).json()["token"]
    st = c.get("/api/state", headers=H(th)).json()
    assert st["scorecard"]["overall"]["launched"] == 0
    # finish the Launch Board project (stage VII) and record 4 weeks
    p = next(x for x in st["projects"] if x["nama"] == "Isian Jun")
    pid = p["id"]
    proj = c.get(f"/api/projects/{pid}", headers=H(th)).json()["project"]
    c.put(f"/api/projects/{pid}/handoff", headers=H(th), json={"items": [dict(h, done=True) for h in proj["handoff"]]})
    c.put(f"/api/projects/{pid}/stages/7", headers=H(th), json={"details": {"launchDate": "2027-06-01", "hargaFinal": 15000, "hppFinal": 4500}})
    c.post(f"/api/projects/{pid}/decision", headers=H(th), json={"decision": "go"})
    assert c.post(f"/api/projects/{pid}/stage", headers=H(th), json={"to": 8}).status_code == 200
    c.put(f"/api/projects/{pid}/stages/7", headers=H(th), json={"details": {"targetPorsiMinggu": "1.000", "salesWeeks": ["1.200", 900, None, None]}})
    sc = c.get("/api/state", headers=H(th)).json()["scorecard"]
    row = sc["projects"][0]
    assert row["actual"] == 2100 and row["targetTotal"] == 2000 and row["pct"] == 105 and row["verdict"] == "berjalan"
    assert row["weeklyPct"] == [120, 90, None, None]
    c.put(f"/api/projects/{pid}/stages/7", headers=H(th), json={"details": {"salesWeeks": [1200, 900, 800, 700]}})
    sc = c.get("/api/state", headers=H(th)).json()["scorecard"]
    assert sc["projects"][0]["verdict"] == "miss" and sc["projects"][0]["pct"] == 90
    b = sc["byCategoryYear"][0]
    assert (b["year"], b["category"], b["launched"], b["evaluated"], b["hit"], b["hitRate"]) == ("2027", "varian_cimol", 1, 1, 0, 0)
    rep = c.get(f"/api/report?t={c.get('/api/state', headers=H(th)).json()['settings']['shareToken']}").json()
    assert rep["scorecard"]["overall"]["evaluated"] == 1


def test_s3_storage(c, monkeypatch):
    from moto import mock_aws
    import boto3
    th = c.post("/api/auth/admin-login", json={"pin": "1234"}).json()["token"]
    with mock_aws():
        monkeypatch.setattr(config, "S3_BUCKET", "crk-pid")
        monkeypatch.setattr(config, "S3_KEY", "k")
        monkeypatch.setattr(config, "S3_SECRET", "s")
        monkeypatch.setattr(config, "S3_ENDPOINT", "")
        monkeypatch.setattr(config, "S3_REGION", "us-east-1")
        ST.reset()
        boto3.client("s3", region_name="us-east-1").create_bucket(Bucket="crk-pid")
        v = c.post("/api/vendors", headers=H(th), json={"nama": "Vendor S3"}).json()
        r = c.post("/api/files", headers=H(th), files={"file": ("halal.pdf", b"%PDF-1.4 halal", "application/pdf")},
                   data={"vendorId": v["id"], "kind": "vendor"})
        f = r.json()
        assert r.status_code == 200 and f["storage"] == "s3" and "key" not in f
        obj = boto3.client("s3", region_name="us-east-1").get_object(Bucket="crk-pid", Key=f"uploads/{f['id']}.pdf")
        assert obj["Body"].read() == b"%PDF-1.4 halal"
        g = c.get(f["url"], follow_redirects=False)
        assert g.status_code == 302 and "crk-pid" in g.headers["location"]
        b = c.post("/api/jobs/backup/run", headers=H(th)).json()
        assert b["storage"] == "s3" and ST.list_backups()[-1].startswith("backups/pid-backup-")
        c.delete(f"/api/files/{f['id']}", headers=H(th))
        keys = [o["Key"] for o in boto3.client("s3", region_name="us-east-1").list_objects_v2(Bucket="crk-pid").get("Contents", [])]
        assert f"uploads/{f['id']}.pdf" not in keys
    ST.reset()
