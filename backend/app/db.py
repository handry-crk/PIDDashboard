from . import config

_db = None


def get_db():
    global _db
    if _db is None:
        if config.USE_MOCK_DB:
            import mongomock
            _db = mongomock.MongoClient()[config.DB_NAME]
        else:
            from pymongo import MongoClient
            _db = MongoClient(config.MONGO_URL, serverSelectionTimeoutMS=5000)[config.DB_NAME]
        _ensure_indexes(_db)
    return _db


def reset_mock_db():
    """Testing helper."""
    global _db
    _db = None


def _ensure_indexes(db):
    try:
        db.members.create_index("id", unique=True)
        db.sessions.create_index("token", unique=True)
        db.projects.create_index("id", unique=True)
        db.projects.create_index("kode", unique=True)
        db.kandidat.create_index("projectId")
        db.bom.create_index("kandidatId")
        db.vendors.create_index("id", unique=True)
        db.slots.create_index([("category", 1), ("period", 1)])
        db.activity.create_index("projectId")
        db.comments.create_index("projectId")
    except Exception:  # pragma: no cover
        pass


def ping():
    try:
        db = get_db()
        if config.USE_MOCK_DB:
            return "mock"
        db.client.admin.command("ping")
        return "mongo"
    except Exception as e:  # pragma: no cover
        return f"error: {e}"


def clean(doc):
    if doc is None:
        return None
    doc = dict(doc)
    doc.pop("_id", None)
    return doc


def clean_all(cursor):
    return [clean(d) for d in cursor]
