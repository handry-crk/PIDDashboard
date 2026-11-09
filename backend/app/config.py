import os
import logging
from zoneinfo import ZoneInfo

log = logging.getLogger("pid")

TZ = ZoneInfo("Asia/Jakarta")

MONGO_URL = os.getenv("MONGO_URL", "")
DB_NAME = os.getenv("DB_NAME", "crk_pid")
USE_MOCK_DB = os.getenv("USE_MOCK_DB", "true" if not MONGO_URL else "false").lower() == "true"
SECRET_KEY = os.getenv("SECRET_KEY", "change-me")
DEFAULT_ADMIN_PIN = os.getenv("DEFAULT_ADMIN_PIN", "1234")
METRICS_API_KEY = os.getenv("METRICS_API_KEY", "change-me-metrics")
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "/data/uploads")
BACKUP_DIR = os.getenv("BACKUP_DIR", os.path.join(os.path.dirname(UPLOAD_DIR.rstrip("/")) or "/data", "backups"))
STATIC_DIR = os.getenv("STATIC_DIR", os.path.join(os.path.dirname(__file__), "..", "static"))
ENABLE_SCHEDULER = os.getenv("ENABLE_SCHEDULER", "true").lower() == "true"

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER or "pid@crk.local")
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")

S3_ENDPOINT = os.getenv("S3_ENDPOINT", "")
S3_BUCKET = os.getenv("S3_BUCKET", "")
S3_KEY = os.getenv("S3_KEY", "")
S3_SECRET = os.getenv("S3_SECRET", "")


def warn_defaults():
    if SECRET_KEY == "change-me":
        log.warning("SECRET_KEY masih memakai nilai bawaan")
    if DEFAULT_ADMIN_PIN == "1234":
        log.warning("DEFAULT_ADMIN_PIN masih memakai nilai bawaan (1234)")
    if METRICS_API_KEY == "change-me-metrics":
        log.warning("METRICS_API_KEY masih memakai nilai bawaan")
    if USE_MOCK_DB:
        log.warning("USE_MOCK_DB=true: data disimpan di memori dan hilang saat restart")
