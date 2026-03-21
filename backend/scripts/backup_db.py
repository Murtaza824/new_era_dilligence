#!/usr/bin/env python3
"""
Database backup script — dumps PostgreSQL, compresses, and uploads to S3.

Usage:
    python scripts/backup_db.py

Environment variables required:
    DATABASE_URL          — PostgreSQL connection string
    BACKUP_S3_BUCKET      — S3 bucket name
    BACKUP_S3_PREFIX      — Key prefix (default: jarvis-backups)
    AWS_ACCESS_KEY_ID     — AWS credentials
    AWS_SECRET_ACCESS_KEY — AWS credentials
    AWS_REGION            — AWS region (default: us-east-1)
"""
import gzip
import logging
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# Load .env from the backend directory
env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(env_path)

DATABASE_URL = os.getenv("DATABASE_URL", "")
S3_BUCKET = os.getenv("BACKUP_S3_BUCKET", "")
S3_PREFIX = os.getenv("BACKUP_S3_PREFIX", "jarvis-backups")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")


def run_backup():
    if not DATABASE_URL or "postgresql" not in DATABASE_URL:
        logger.error("DATABASE_URL must be a PostgreSQL URL")
        sys.exit(1)

    if not S3_BUCKET:
        logger.error("BACKUP_S3_BUCKET is not set")
        sys.exit(1)

    parsed = urlparse(DATABASE_URL)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"jarvis_backup_{timestamp}.sql.gz"
    s3_key = f"{S3_PREFIX}/{filename}"

    with tempfile.TemporaryDirectory() as tmpdir:
        sql_path = os.path.join(tmpdir, "dump.sql")
        gz_path = os.path.join(tmpdir, filename)

        logger.info("Starting pg_dump…")
        env = os.environ.copy()
        env["PGPASSWORD"] = parsed.password or ""
        port = str(parsed.port or 5432)
        db_name = parsed.path.lstrip("/")

        result = subprocess.run(
            [
                "pg_dump",
                "-h", parsed.hostname or "localhost",
                "-p", port,
                "-U", parsed.username or "postgres",
                "-d", db_name,
                "--no-owner",
                "--no-acl",
                "-f", sql_path,
            ],
            env=env,
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            logger.error("pg_dump failed: %s", result.stderr)
            sys.exit(1)

        sql_size = os.path.getsize(sql_path)
        logger.info("pg_dump complete — %s bytes", sql_size)

        logger.info("Compressing…")
        with open(sql_path, "rb") as f_in, gzip.open(gz_path, "wb") as f_out:
            f_out.writelines(f_in)
        gz_size = os.path.getsize(gz_path)
        logger.info("Compressed to %s bytes (%.1f%% of original)", gz_size, gz_size / sql_size * 100 if sql_size else 0)

        logger.info("Uploading to s3://%s/%s …", S3_BUCKET, s3_key)
        import boto3
        s3 = boto3.client("s3", region_name=AWS_REGION)
        s3.upload_file(
            gz_path,
            S3_BUCKET,
            s3_key,
            ExtraArgs={"ServerSideEncryption": "AES256"},
        )
        logger.info("Upload complete.")

        # Record timestamp in a metadata file for the health check
        s3.put_object(
            Bucket=S3_BUCKET,
            Key=f"{S3_PREFIX}/latest.txt",
            Body=f"{timestamp}\n{s3_key}\n{gz_size}",
            ServerSideEncryption="AES256",
        )

    logger.info("Backup complete: %s", s3_key)


if __name__ == "__main__":
    run_backup()
