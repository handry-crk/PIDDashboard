import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Header, HTTPException

from . import config
from .db import get_db, clean


def hash_pin(pin: str, salt: str = None) -> str:
    salt = salt or secrets.token_hex(8)
    h = hashlib.pbkdf2_hmac("sha256", (pin + config.SECRET_KEY).encode(), salt.encode(), 100_000).hex()
    return f"{salt}${h}"


def verify_pin(pin: str, stored: str) -> bool:
    if not stored or "$" not in stored:
        return False
    salt, _ = stored.split("$", 1)
    return hmac.compare_digest(hash_pin(pin, salt), stored)


def new_session(member_id: str) -> str:
    token = secrets.token_urlsafe(32)
    get_db().sessions.insert_one({"token": token, "memberId": member_id, "createdAt": datetime.now(timezone.utc).isoformat()})
    return token


def current_member(authorization: str = Header(default="")):
    token = authorization.replace("Bearer", "").strip()
    if not token:
        raise HTTPException(401, "Silakan login terlebih dahulu")
    s = get_db().sessions.find_one({"token": token})
    if not s:
        raise HTTPException(401, "Sesi berakhir, silakan login ulang")
    m = get_db().members.find_one({"id": s["memberId"]})
    if not m or not m.get("active", True):
        raise HTTPException(401, "Akun tidak aktif, hubungi Admin")
    return clean(m)


def is_head(m):
    return m.get("role") == "pid_head" or m.get("isAdmin")


def is_editor(m):
    return m.get("role") in ("pid_head", "pid_supervisor") or m.get("isAdmin")


def require(cond: bool, msg="Role Anda tidak memiliki akses untuk tindakan ini"):
    if not cond:
        raise HTTPException(403, msg)


def lock_check(m):
    lu = m.get("lockedUntil")
    if lu and datetime.fromisoformat(lu) > datetime.now(timezone.utc):
        mins = int((datetime.fromisoformat(lu) - datetime.now(timezone.utc)).total_seconds() // 60) + 1
        raise HTTPException(423, f"Akun terkunci karena 5x salah PIN. Coba lagi dalam {mins} menit atau minta Admin reset PIN")


def register_fail(m):
    db = get_db()
    n = (m.get("failedPins") or 0) + 1
    upd = {"failedPins": n}
    if n >= 5:
        upd["lockedUntil"] = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
        upd["failedPins"] = 0
    db.members.update_one({"id": m["id"]}, {"$set": upd})
