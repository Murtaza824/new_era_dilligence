# Database Restore Procedure

## Overview

Production database backups are stored in S3 as compressed SQL dumps (`*.sql.gz`). Backups run daily and are retained for 30 days.

## Prerequisites

- AWS CLI configured with access to the backup S3 bucket
- `pg_dump` / `psql` installed locally
- Access to the production PostgreSQL connection string

## 1. List Available Backups

```bash
aws s3 ls s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/ --region $AWS_REGION
```

## 2. Download a Backup

```bash
# Latest backup
LATEST=$(aws s3 cp s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/latest.txt - | head -2 | tail -1)
aws s3 cp s3://$BACKUP_S3_BUCKET/$LATEST ./backup.sql.gz

# Or specific backup by timestamp
aws s3 cp s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/jarvis_backup_20260101_030000.sql.gz ./backup.sql.gz
```

## 3. Decompress

```bash
gunzip backup.sql.gz
```

## 4. Restore to a Target Database

### Option A: Restore to a Fresh Database (Recommended for Testing)

```bash
# Create a new database
createdb -h $HOST -p $PORT -U $USER jarvis_restore

# Restore
psql -h $HOST -p $PORT -U $USER -d jarvis_restore < backup.sql
```

### Option B: Restore to Production (Destructive)

```bash
# Stop the application first to prevent writes
# Then drop and recreate the database
dropdb -h $HOST -p $PORT -U $USER jarvis
createdb -h $HOST -p $PORT -U $USER jarvis
psql -h $HOST -p $PORT -U $USER -d jarvis < backup.sql

# Restart the application
```

## 5. Verify

```bash
psql -h $HOST -p $PORT -U $USER -d jarvis_restore -c "SELECT COUNT(*) FROM companies;"
psql -h $HOST -p $PORT -U $USER -d jarvis_restore -c "SELECT COUNT(*) FROM dealflow_entries;"
```

## Monitoring

Check backup status via the API:

```bash
curl https://your-api-url/admin/backup-status
```

Response:
```json
{
  "status": "ok",
  "last_backup_timestamp": "20260227_030000",
  "last_backup_key": "jarvis-backups/jarvis_backup_20260227_030000.sql.gz",
  "last_backup_size": "1234567"
}
```

## S3 Lifecycle Policy

Configure a 30-day expiration rule on the bucket prefix:

```json
{
  "Rules": [
    {
      "ID": "ExpireOldBackups",
      "Filter": { "Prefix": "jarvis-backups/" },
      "Status": "Enabled",
      "Expiration": { "Days": 30 }
    }
  ]
}
```

Apply with:
```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket $BACKUP_S3_BUCKET \
  --lifecycle-configuration file://lifecycle.json
```

## Cron Setup (Railway)

Add a cron service in Railway that runs daily:

```
Schedule: 0 3 * * *
Command: cd backend && python scripts/backup_db.py
```

Or use an external scheduler that hits a webhook endpoint.
