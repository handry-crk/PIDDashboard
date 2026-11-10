"""File storage: S3-compatible object storage when S3_* env vars are set, otherwise the local volume."""
import os

from . import config

_client = None


def s3_enabled():
    return bool(config.S3_BUCKET and config.S3_KEY and config.S3_SECRET)


def s3():
    global _client
    if _client is None:
        import boto3
        _client = boto3.client("s3", endpoint_url=config.S3_ENDPOINT or None, aws_access_key_id=config.S3_KEY,
                               aws_secret_access_key=config.S3_SECRET, region_name=config.S3_REGION or "auto")
    return _client


def reset():
    global _client
    _client = None


def save(name, data, content_type, prefix="uploads"):
    """Store bytes; returns metadata to keep on the file record."""
    if s3_enabled():
        key = f"{prefix}/{name}"
        s3().put_object(Bucket=config.S3_BUCKET, Key=key, Body=data, ContentType=content_type)
        return {"storage": "s3", "key": key}
    base = config.UPLOAD_DIR if prefix == "uploads" else config.BACKUP_DIR
    os.makedirs(base, exist_ok=True)
    path = os.path.join(base, name)
    with open(path, "wb") as f:
        f.write(data)
    return {"storage": "disk", "path": path}


def url_for(meta, expires=3600):
    """Presigned URL for S3 objects (None for local files)."""
    if meta.get("storage") == "s3":
        return s3().generate_presigned_url("get_object", Params={"Bucket": config.S3_BUCKET, "Key": meta["key"]}, ExpiresIn=expires)
    return None


def delete(meta):
    try:
        if meta.get("storage") == "s3":
            s3().delete_object(Bucket=config.S3_BUCKET, Key=meta["key"])
        elif meta.get("path"):
            os.remove(meta["path"])
    except Exception:
        pass


def list_backups():
    if s3_enabled():
        r = s3().list_objects_v2(Bucket=config.S3_BUCKET, Prefix="backups/")
        return sorted(o["Key"] for o in r.get("Contents", []))
    if not os.path.isdir(config.BACKUP_DIR):
        return []
    return sorted(os.path.join(config.BACKUP_DIR, x) for x in os.listdir(config.BACKUP_DIR) if x.startswith("pid-backup-"))


def prune_backups(keep=8):
    items = list_backups()
    for old in items[:-keep]:
        if s3_enabled():
            s3().delete_object(Bucket=config.S3_BUCKET, Key=old)
        else:
            os.remove(old)
