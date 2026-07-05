import csv
import hashlib
import io
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone

from categorizer import categorize_transaction


BASE_URL = "https://bankaccountdata.gocardless.com/api/v2"


def handler(event, context):
    event = event or {}
    sync_id = event.get("sync_id") or event.get("syncId") or time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    dry_run = event_bool(event, "dry_run", env_bool("DRY_RUN", default=True))
    write_database = event_bool(event, "write_database", env_bool("WRITE_DATABASE", default=False))

    try:
        date_to = event.get("date_to") or event.get("dateTo") or os.getenv("DATE_TO") or date.today().isoformat()
        account_ids = get_account_ids(event)
        update_sync_status(sync_id, "running", "Planning sync window", account_count=len(account_ids))
        sync_plan = build_sync_plan(event, account_ids, date_to, write_database and not dry_run)
        date_from = sync_plan["dateFrom"]

        if dry_run:
            rows = sample_transactions(date_from, date_to)
            raw_payload = {"mode": "dry_run", "transactions": rows, "syncPlan": sync_plan}
            per_account_stats = [{"accountId": "dry-run-account", "dateFrom": date_from, "dateTo": date_to, "retrieved": len(rows)}]
        else:
            token = get_access_token()
            rows = []
            raw_payload = {"mode": "live", "accounts": {}, "syncPlan": sync_plan}
            per_account_stats = []
            for index, account_id in enumerate(account_ids, start=1):
                update_sync_status(
                    sync_id,
                    "running",
                    f"Fetching account {index} of {len(account_ids)}",
                    account_count=len(account_ids),
                    transaction_count=len(rows),
                    accounts=per_account_stats,
                )
                account_date_from = sync_plan["accounts"].get(account_id, {}).get("dateFrom", date_from)
                payload = fetch_account_transactions(token, account_id, account_date_from, date_to)
                account_rows = normalize_transactions(account_id, payload)
                raw_payload["accounts"][account_id] = {
                    "dateFrom": account_date_from,
                    "dateTo": date_to,
                    "response": payload,
                }
                per_account_stats.append(
                    {
                        "accountId": account_id,
                        "dateFrom": account_date_from,
                        "dateTo": date_to,
                        "retrieved": len(account_rows),
                        "booked": len(payload.get("transactions", {}).get("booked", [])),
                        "pending": len(payload.get("transactions", {}).get("pending", [])),
                    }
                )
                rows.extend(account_rows)

        update_sync_status(
            sync_id,
            "running",
            "Applying categorisation rules",
            account_count=len(account_ids),
            transaction_count=len(rows),
            accounts=per_account_stats,
        )
        rows, categorization_stats = categorize_rows(rows)
        csv_text = transactions_to_csv(rows)
        written = write_outputs(raw_payload, csv_text)
        update_sync_status(
            sync_id,
            "running",
            "Writing synced rows",
            account_count=len(account_ids),
            transaction_count=len(rows),
            categorization=categorization_stats,
            accounts=per_account_stats,
        )
        database_result = upsert_transactions(rows, raw_payload, date_from, date_to) if write_database else None
        metadata = bump_app_state("gocardless-sync") if write_database and rows else None

        result = {
            "ok": True,
            "syncId": sync_id,
            "dryRun": dry_run,
            "writeDatabase": write_database,
            "dateFrom": date_from,
            "dateTo": date_to,
            "accountCount": len(account_ids),
            "transactionCount": len(rows),
            "categorization": categorization_stats,
            "accounts": per_account_stats,
            "written": written,
            "database": database_result,
            "metadata": metadata,
        }
        update_sync_status(sync_id, "complete", "Sync complete", result=result)
        return result
    except Exception as error:
        update_sync_status(sync_id, "failed", str(error), error_type=type(error).__name__)
        raise


def build_sync_plan(event, account_ids, date_to, use_database):
    explicit_date_from = event.get("date_from") or event.get("dateFrom") or os.getenv("DATE_FROM")
    if explicit_date_from:
        return {
            "strategy": "explicit",
            "dateFrom": explicit_date_from,
            "dateTo": date_to,
            "overlapDays": 0,
            "accounts": {account_id: {"dateFrom": explicit_date_from, "dateTo": date_to} for account_id in account_ids},
        }

    overlap_days = int(event.get("overlap_days") or event.get("overlapDays") or os.getenv("SYNC_OVERLAP_DAYS", "14"))
    initial_lookback_days = int(
        event.get("initial_lookback_days") or event.get("initialLookbackDays") or os.getenv("INITIAL_LOOKBACK_DAYS", "90")
    )
    fallback_from = shift_iso_date(date_to, -initial_lookback_days)
    latest_by_account = fetch_latest_dates_by_account() if use_database else {}

    accounts = {}
    for account_id in account_ids:
        latest_date = latest_by_account.get(account_id)
        account_date_from = shift_iso_date(latest_date, -overlap_days) if latest_date else fallback_from
        accounts[account_id] = {
            "dateFrom": account_date_from,
            "dateTo": date_to,
            "latestStoredDate": latest_date,
            "usedFallback": latest_date is None,
        }

    all_dates = [account["dateFrom"] for account in accounts.values()] or [fallback_from]
    return {
        "strategy": "latest-stored-date-with-overlap" if use_database else "fallback-lookback",
        "dateFrom": min(all_dates),
        "dateTo": date_to,
        "overlapDays": overlap_days,
        "initialLookbackDays": initial_lookback_days,
        "accounts": accounts,
    }


def fetch_latest_dates_by_account():
    if not all(os.getenv(name) for name in ["DB_CLUSTER_ARN", "DB_SECRET_ARN", "DB_NAME"]):
        return {}

    import boto3

    client = boto3.client("rds-data")
    result = execute_statement(
        client,
        os.getenv("DB_CLUSTER_ARN"),
        os.getenv("DB_SECRET_ARN"),
        os.getenv("DB_NAME"),
        """
        SELECT account_id, MAX(COALESCE(booking_date, value_date))::text AS latest_date
        FROM transactions
        WHERE provider = 'gocardless'
        GROUP BY account_id
        """,
    )
    latest = {}
    for record in result.get("records", []):
        account_id = read_value(record[0])
        latest_date = read_value(record[1])
        if account_id and latest_date:
            latest[account_id] = latest_date
    return latest


def shift_iso_date(value, days):
    return (date.fromisoformat(value) + timedelta(days=days)).isoformat()


def categorize_rows(rows):
    stats = {"autoCategorized": 0, "shortDescriptions": 0, "travelTags": 0}
    categorized_rows = []
    for row in rows:
        had_category = bool(row.get("proprietaryBankTransactionCode"))
        had_short_description = bool(row.get("shortDescription"))
        had_travel_tag = bool(row.get("travelTag"))
        categorized = categorize_transaction(row, fill_missing_only=True)
        if not had_category and categorized.get("proprietaryBankTransactionCode"):
            stats["autoCategorized"] += 1
        if not had_short_description and categorized.get("shortDescription"):
            stats["shortDescriptions"] += 1
        if not had_travel_tag and categorized.get("travelTag"):
            stats["travelTags"] += 1
        categorized_rows.append(categorized)
    return categorized_rows, stats


def get_account_ids(event):
    if event.get("account_ids"):
        return event["account_ids"]

    raw = os.getenv("GOCARDLESS_ACCOUNT_IDS", "")
    return [item.strip() for item in raw.split(",") if item.strip()]


def sample_transactions(date_from, date_to):
    return [
        {
            "accountId": "dry-run-account",
            "status": "booked",
            "transactionId": f"dry-run-{date_from}-{date_to}",
            "bookingDate": date_to,
            "valueDate": date_to,
            "amount": "-12.34",
            "currency": "EUR",
            "creditorName": "Dry Run Coffee",
            "debtorName": "",
            "description": f"Dry run transaction from {date_from} to {date_to}",
            "bankTransactionCode": "",
            "proprietaryBankTransactionCode": "",
        }
    ]


def get_access_token():
    secret_id = os.getenv("GOCARDLESS_SECRET_ID")
    secret_key = os.getenv("GOCARDLESS_SECRET_KEY")
    if not secret_id or not secret_key:
        raise RuntimeError("GOCARDLESS_SECRET_ID and GOCARDLESS_SECRET_KEY are required when DRY_RUN=false.")

    payload = {"secret_id": secret_id, "secret_key": secret_key}
    response = request_json("POST", "/token/new/", payload=payload)
    return response["access"]


def fetch_account_transactions(token, account_id, date_from, date_to):
    params = urllib.parse.urlencode({"date_from": date_from, "date_to": date_to})
    return request_json("GET", f"/accounts/{account_id}/transactions/?{params}", token=token)


def normalize_transactions(account_id, payload):
    transactions = payload.get("transactions", {})
    rows = []
    for status, items in [("booked", transactions.get("booked", [])), ("pending", transactions.get("pending", []))]:
        for item in items:
            amount = item.get("transactionAmount", {})
            remittance = item.get("remittanceInformationUnstructured") or item.get("remittanceInformationUnstructuredArray") or ""
            if isinstance(remittance, list):
                remittance = " ".join(remittance)

            rows.append(
                {
                    "accountId": account_id,
                    "status": status,
                    "transactionId": item.get("transactionId", ""),
                    "bookingDate": item.get("bookingDate", ""),
                    "valueDate": item.get("valueDate", ""),
                    "amount": amount.get("amount", ""),
                    "currency": amount.get("currency", ""),
                    "creditorName": item.get("creditorName", ""),
                    "debtorName": item.get("debtorName", ""),
                    "description": remittance,
                    "bankTransactionCode": item.get("bankTransactionCode", ""),
                    "proprietaryBankTransactionCode": item.get("proprietaryBankTransactionCode", ""),
                }
            )
    return rows


def transactions_to_csv(rows):
    headers = [
        "accountId",
        "status",
        "transactionId",
        "bookingDate",
        "valueDate",
        "amount",
        "currency",
        "creditorName",
        "debtorName",
        "description",
        "bankTransactionCode",
        "proprietaryBankTransactionCode",
        "shortDescription",
        "overrideMonth",
        "travelTag",
        "accountFriendlyName",
    ]
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=headers, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue()


def upsert_transactions(rows, raw_payload, date_from, date_to):
    if not rows:
        return {"upserted": 0, "syncRunId": None}

    import boto3

    client = boto3.client("rds-data")
    resource_arn = require_env("DB_CLUSTER_ARN")
    secret_arn = require_env("DB_SECRET_ARN")
    database = require_env("DB_NAME")

    sync_run_id = create_sync_run(client, resource_arn, secret_arn, database, date_from, date_to, raw_payload)
    ensure_accounts(client, resource_arn, secret_arn, database, rows)
    upsert_transaction_rows(client, resource_arn, secret_arn, database, rows, sync_run_id)
    complete_sync_run(client, resource_arn, secret_arn, database, sync_run_id, len(rows))

    return {"upserted": len(rows), "syncRunId": sync_run_id}


def create_sync_run(client, resource_arn, secret_arn, database, date_from, date_to, raw_payload):
    result = execute_statement(
        client,
        resource_arn,
        secret_arn,
        database,
        """
        INSERT INTO sync_runs (provider, status, date_from, date_to, raw_summary)
        VALUES ('gocardless', 'running', CAST(:date_from AS date), CAST(:date_to AS date), CAST(:raw_summary AS jsonb))
        RETURNING id
        """,
        [
            string_param("date_from", date_from),
            string_param("date_to", date_to),
            string_param(
                "raw_summary",
                json.dumps(
                    {
                        "mode": raw_payload.get("mode"),
                        "accountCount": len(raw_payload.get("accounts", {})),
                    }
                ),
            ),
        ],
    )
    return result["records"][0][0]["longValue"]


def ensure_accounts(client, resource_arn, secret_arn, database, rows):
    account_ids = sorted({row["accountId"] for row in rows if row.get("accountId")})
    if not account_ids:
        return

    parameter_sets = [
        [
            string_param("provider", "gocardless"),
            string_param("provider_account_id", account_id),
        ]
        for account_id in account_ids
    ]
    batch_execute_statement(
        client,
        resource_arn,
        secret_arn,
        database,
        """
        INSERT INTO accounts (provider, provider_account_id)
        VALUES (:provider, :provider_account_id)
        ON CONFLICT (provider, provider_account_id)
        DO UPDATE SET updated_at = now()
        """,
        parameter_sets,
    )


def upsert_transaction_rows(client, resource_arn, secret_arn, database, rows, sync_run_id):
    parameter_sets = []
    for row in rows:
        parameter_sets.append(
            [
                string_param("provider", "gocardless"),
                string_param("provider_transaction_key", provider_transaction_key(row)),
                string_param("account_id", row.get("accountId", "")),
                string_param("status", row.get("status", "")),
                nullable_string_param("transaction_id", row.get("transactionId")),
                nullable_string_param("booking_date", row.get("bookingDate")),
                nullable_string_param("value_date", row.get("valueDate")),
                nullable_string_param("amount", row.get("amount")),
                nullable_string_param("currency", row.get("currency")),
                nullable_string_param("creditor_name", row.get("creditorName")),
                nullable_string_param("debtor_name", row.get("debtorName")),
                nullable_string_param("description", row.get("description")),
                nullable_string_param("bank_transaction_code", row.get("bankTransactionCode")),
                nullable_string_param("proprietary_bank_transaction_code", row.get("proprietaryBankTransactionCode")),
                nullable_string_param("short_description", row.get("shortDescription")),
                nullable_string_param("override_month", row.get("overrideMonth")),
                nullable_string_param("travel_tag", row.get("travelTag")),
                nullable_string_param("account_friendly_name", row.get("accountFriendlyName")),
                string_param("raw_transaction", json.dumps(row)),
                long_param("sync_run_id", sync_run_id),
            ]
        )

    for chunk in chunks(parameter_sets, 500):
        batch_execute_statement(
            client,
            resource_arn,
            secret_arn,
            database,
            """
            INSERT INTO transactions (
              provider,
              provider_transaction_key,
              account_id,
              status,
              transaction_id,
              booking_date,
              value_date,
              amount,
              currency,
              creditor_name,
              debtor_name,
              description,
              bank_transaction_code,
              proprietary_bank_transaction_code,
              short_description,
              override_month,
              travel_tag,
              account_friendly_name,
              raw_transaction,
              last_sync_run_id
            )
            VALUES (
              :provider,
              :provider_transaction_key,
              :account_id,
              :status,
              :transaction_id,
              CAST(:booking_date AS date),
              CAST(:value_date AS date),
              CAST(:amount AS numeric),
              :currency,
              :creditor_name,
              :debtor_name,
              :description,
              :bank_transaction_code,
              :proprietary_bank_transaction_code,
              :short_description,
              :override_month,
              :travel_tag,
              :account_friendly_name,
              CAST(:raw_transaction AS jsonb),
              :sync_run_id
            )
            ON CONFLICT (provider, provider_transaction_key)
            DO UPDATE SET
              status = EXCLUDED.status,
              booking_date = EXCLUDED.booking_date,
              value_date = EXCLUDED.value_date,
              amount = EXCLUDED.amount,
              currency = EXCLUDED.currency,
              creditor_name = EXCLUDED.creditor_name,
              debtor_name = EXCLUDED.debtor_name,
              description = EXCLUDED.description,
              bank_transaction_code = EXCLUDED.bank_transaction_code,
              proprietary_bank_transaction_code = EXCLUDED.proprietary_bank_transaction_code,
              short_description = COALESCE(transactions.short_description, EXCLUDED.short_description),
              override_month = COALESCE(transactions.override_month, EXCLUDED.override_month),
              travel_tag = COALESCE(transactions.travel_tag, EXCLUDED.travel_tag),
              account_friendly_name = COALESCE(transactions.account_friendly_name, EXCLUDED.account_friendly_name),
              raw_transaction = EXCLUDED.raw_transaction,
              last_sync_run_id = EXCLUDED.last_sync_run_id,
              updated_at = now()
            """,
            chunk,
        )


def complete_sync_run(client, resource_arn, secret_arn, database, sync_run_id, transaction_count):
    execute_statement(
        client,
        resource_arn,
        secret_arn,
        database,
        """
        UPDATE sync_runs
        SET status = 'success', transaction_count = :transaction_count, finished_at = now()
        WHERE id = :id
        """,
        [
            long_param("id", sync_run_id),
            long_param("transaction_count", transaction_count),
        ],
    )


def bump_app_state(reason):
    bucket = os.getenv("APP_STATE_BUCKET")
    key = os.getenv("APP_STATE_KEY", "metadata/app-state.json")
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    metadata = {}

    s3 = None
    if bucket:
        import boto3

        s3 = boto3.client("s3")
        metadata = read_app_state(s3, bucket, key)

    metadata.update(
        {
            "version": now,
            "updatedAt": now,
            "transactionsUpdatedAt": now,
            "reason": reason,
        }
    )

    if reason == "gocardless-sync":
        metadata["gocardlessSyncedAt"] = now

    if not bucket:
        return metadata

    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=json.dumps(metadata).encode("utf-8"),
        ContentType="application/json",
        CacheControl="no-store, no-cache, max-age=0, must-revalidate",
    )
    return metadata


def read_app_state(s3, bucket, key):
    try:
        body = s3.get_object(Bucket=bucket, Key=key)["Body"].read().decode("utf-8")
        return json.loads(body) if body else {}
    except Exception:
        return {}


def update_sync_status(sync_id, status, message, **extra):
    bucket = os.getenv("APP_STATE_BUCKET")
    if not bucket:
        return None

    import boto3

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    payload = {
        "syncId": sync_id,
        "status": status,
        "message": message,
        "updatedAt": now,
        **extra,
    }
    key = f"{os.getenv('SYNC_STATUS_PREFIX', 'metadata/sync-runs').strip('/')}/{sync_id}.json"
    boto3.client("s3").put_object(
        Bucket=bucket,
        Key=key,
        Body=json.dumps(payload).encode("utf-8"),
        ContentType="application/json",
        CacheControl="no-store, no-cache, max-age=0, must-revalidate",
    )
    return payload


def provider_transaction_key(row):
    transaction_id = row.get("transactionId")
    account_id = row.get("accountId", "")
    if transaction_id:
        return f"{account_id}:{transaction_id}"

    fallback = "|".join(
        [
            account_id,
            row.get("bookingDate", ""),
            row.get("valueDate", ""),
            row.get("amount", ""),
            row.get("description", ""),
        ]
    )
    return f"{account_id}:hash:{hashlib.sha256(fallback.encode('utf-8')).hexdigest()}"


def execute_statement(client, resource_arn, secret_arn, database, sql, parameters=None):
    for attempt, delay_seconds in enumerate([0, 2, 4, 8, 12, 16]):
        if delay_seconds:
            time.sleep(delay_seconds)
        try:
            return client.execute_statement(
                resourceArn=resource_arn,
                secretArn=secret_arn,
                database=database,
                sql=sql,
                parameters=parameters or [],
            )
        except Exception as error:
            if attempt == 5 or not is_database_resuming_error(error):
                raise


def batch_execute_statement(client, resource_arn, secret_arn, database, sql, parameter_sets):
    for attempt, delay_seconds in enumerate([0, 2, 4, 8, 12, 16]):
        if delay_seconds:
            time.sleep(delay_seconds)
        try:
            return client.batch_execute_statement(
                resourceArn=resource_arn,
                secretArn=secret_arn,
                database=database,
                sql=sql,
                parameterSets=parameter_sets,
            )
        except Exception as error:
            if attempt == 5 or not is_database_resuming_error(error):
                raise


def is_database_resuming_error(error):
    text = str(error).lower()
    return "databaseresumingexception" in text or "resuming after being auto-paused" in text


def string_param(name, value):
    return {"name": name, "value": {"stringValue": str(value)}}


def nullable_string_param(name, value):
    if value is None or value == "":
        return {"name": name, "value": {"isNull": True}}
    return string_param(name, value)


def long_param(name, value):
    return {"name": name, "value": {"longValue": int(value)}}


def chunks(items, size):
    for index in range(0, len(items), size):
        yield items[index : index + size]


def write_outputs(raw_payload, csv_text):
    today = date.today().isoformat()
    timestamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    local_dir = os.getenv("LOCAL_OUTPUT_DIR")
    bucket = os.getenv("S3_BUCKET")

    raw_key = f"raw/gocardless/{today}/{timestamp}.json"
    csv_key = f"exports/gocardless/{today}/{timestamp}.csv"

    if local_dir:
        from pathlib import Path

        base = Path(local_dir)
        raw_path = base / raw_key
        csv_path = base / csv_key
        raw_path.parent.mkdir(parents=True, exist_ok=True)
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        raw_path.write_text(json.dumps(raw_payload, indent=2), encoding="utf-8")
        csv_path.write_text(csv_text, encoding="utf-8")
        return {"localRaw": str(raw_path), "localCsv": str(csv_path)}

    if not bucket:
        return {"skipped": "Set S3_BUCKET or LOCAL_OUTPUT_DIR to write outputs."}

    import boto3

    s3 = boto3.client("s3")
    s3.put_object(
        Bucket=bucket,
        Key=raw_key,
        Body=json.dumps(raw_payload, indent=2).encode("utf-8"),
        ContentType="application/json",
    )
    s3.put_object(
        Bucket=bucket,
        Key=csv_key,
        Body=csv_text.encode("utf-8"),
        ContentType="text/csv",
    )
    return {"s3Raw": f"s3://{bucket}/{raw_key}", "s3Csv": f"s3://{bucket}/{csv_key}"}


def request_json(method, path, token=None, payload=None):
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"

    request = urllib.request.Request(f"{BASE_URL}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path} failed with {error.code}: {body}") from error


def env_bool(name, default=False):
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "y"}


def event_bool(event, key, default=False):
    if key not in event:
        return default
    value = event.get(key)
    if isinstance(value, bool):
        return value
    return str(value).lower() in {"1", "true", "yes", "y"}


def read_value(field):
    if not field or field.get("isNull"):
        return None
    for key in ("stringValue", "longValue", "doubleValue", "booleanValue"):
        if key in field:
            return field[key]
    return None


def require_env(name):
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"{name} environment variable is required.")
    return value
