"""Vendor price history: prices per bahan with an effective date; BOM lines follow the current price."""
import re

from . import domain as D, services as S, wa as WA
from .db import get_db, clean, clean_all

UNIT_FOR_BOM = {"kg": "g", "liter": "ml", "pcs": "pcs"}


def norm(s):
    return re.sub(r"\s+", " ", str(s or "").strip().lower())


def current_price(vendor_id, bahan, on=None):
    on = D.fdate(on or D.today())
    rows = [r for r in clean_all(get_db().vendorPrices.find({"vendorId": vendor_id}))
            if norm(r["bahan"]) == norm(bahan) and r["berlakuMulai"] <= on]
    rows.sort(key=lambda r: (r["berlakuMulai"], r["at"]))
    return rows[-1] if rows else None


def price_list(vendor_id):
    """Latest price per bahan + full history (newest first)."""
    rows = clean_all(get_db().vendorPrices.find({"vendorId": vendor_id}))
    rows.sort(key=lambda r: (r["berlakuMulai"], r["at"]), reverse=True)
    today = D.fdate(D.today())
    current = {}
    for r in sorted(rows, key=lambda r: (r["berlakuMulai"], r["at"])):
        if r["berlakuMulai"] <= today:
            current[norm(r["bahan"])] = r
    for r in rows:
        r["aktif"] = current.get(norm(r["bahan"]), {}).get("id") == r["id"]
        r["terjadwal"] = r["berlakuMulai"] > today
    return {"current": sorted(current.values(), key=lambda r: norm(r["bahan"])), "history": rows}


def kandidat_hpp(k, bom):
    versions = sorted({l.get("versi") or "v1" for l in bom}, key=D.versi_key) or ["v1"]
    active = (k.get("recipe") or {}).get("versi") or versions[-1]
    v = active if active in versions else versions[-1]
    return v, D.compute_hpp(bom, v)


def record_hpp(kandidat_id, reason):
    """Append an HPP snapshot when the base-portion HPP changes. Returns (old, new)."""
    db = get_db()
    k = clean(db.kandidat.find_one({"id": kandidat_id}))
    if not k:
        return None, None
    bom = clean_all(db.bom.find({"kandidatId": kandidat_id}))
    versi, hpp = kandidat_hpp(k, bom)
    hist = k.get("hppHistory") or []
    old = hist[-1]["hpp"] if hist else None
    if old is None or abs(old - hpp) >= 0.5:
        hist.append({"at": D.now_utc_iso(), "date": D.fdate(D.today()), "versi": versi, "hpp": hpp, "reason": reason})
        db.kandidat.update_one({"id": kandidat_id}, {"$set": {"hppHistory": hist[-60:]}})
    return old, hpp


def max_food_cost(k, hpp):
    rows = D.porsi_rows(k.get("recipe"), k.get("concept"), hpp)
    fcs = [r["foodCostPct"] for r in rows if r["foodCostPct"] is not None]
    return max(fcs) if fcs else None


def apply_prices(vendor_id=None, by=None):
    """Update BOM lines linked to a vendor to the vendor's current price. Returns a summary."""
    db = get_db()
    q = {"vendorId": vendor_id} if vendor_id else {"vendorId": {"$ne": None}}
    changed = {}
    for l in clean_all(db.bom.find(q)):
        if not l.get("vendorId") or l.get("autoPrice") is False:
            continue
        pr = current_price(l["vendorId"], l["bahan"])
        if not pr or UNIT_FOR_BOM.get(pr["unit"]) != l.get("unit", "g"):
            continue
        if abs(float(pr["harga"]) - float(l.get("hargaPerUnit") or 0)) < 0.01:
            continue
        new = dict(l, hargaPerUnit=pr["harga"])
        new["biayaPerPorsi"] = round(D.bom_line_cost(new), 2)
        db.bom.update_one({"id": l["id"]}, {"$set": {"hargaPerUnit": pr["harga"], "biayaPerPorsi": new["biayaPerPorsi"],
                                                     "priceId": pr["id"]}})
        changed.setdefault(l["kandidatId"], []).append(f"{l['bahan']} {D.rupiah(l.get('hargaPerUnit') or 0)} → {D.rupiah(pr['harga'])}")
    settings = S.get_settings()
    alerts = []
    for kid, notes in changed.items():
        k = clean(db.kandidat.find_one({"id": kid}))
        if not k:
            continue
        p = clean(db.projects.find_one({"id": k["projectId"]}))
        before_bom = None
        old, new = record_hpp(kid, "Harga vendor berubah: " + "; ".join(notes))
        target = settings["targetFoodCostPct"].get(p["category"], 35) if p else 35
        fc_new = max_food_cost(k, new)
        fc_old = max_food_cost(k, old) if old is not None else None
        msg = f"HPP {k['nama']} {D.rupiah(old or 0)} → {D.rupiah(new)} karena harga vendor berubah ({'; '.join(notes)})"
        if p:
            S.log_activity(p["id"], by, "harga_vendor", note=msg, kandidat_id=kid)
        if p and fc_new is not None and fc_new > target and (fc_old is None or fc_old <= target):
            alerts.append({"projectId": p["id"], "kandidat": k["nama"], "foodCostPct": fc_new})
            WA.send_async(WA.phones(ids=[p.get("picId")]) + WA.phones(["pid_head"]),
                          f"*Food cost di atas target* (PID)\n{p['nama']} · {k['nama']}\n{msg}\n"
                          f"Food cost tertinggi kini {str(fc_new).replace('.', ',')}% (target {target}%).\n\n{WA.link(p['id'])}", "foodCost")
    return {"kandidatUpdated": len(changed), "alerts": alerts}
