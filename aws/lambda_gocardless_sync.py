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


BASE_URL = "https://bankaccountdata.gocardless.com/api/v2"


def handler(event, context):
    dry_run = env_bool("DRY_RUN", default=True)
    write_database = env_bool("WRITE_DATABASE", default=False)
    date_to = event.get("date_to") or os.getenv("DATE_TO") or date.today().isoformat()
    date_from = event.get("date_from") or os.getenv("DATE_FROM") or (date.today() - timedelta(days=7)).isoformat()
    account_ids = get_account_ids(event)

    if dry_run:
        rows = sample_transactions(date_from, date_to)
        raw_payload = {"mode": "dry_run", "transactions": rows}
    else:
        token = get_access_token()
        rows = []
        raw_payload = {"mode": "live", "accounts": {}}
        for account_id in account_ids:
            payload = fetch_account_transactions(token, account_id, date_from, date_to)
            raw_payload["accounts"][account_id] = payload
            rows.extend(normalize_transactions(account_id, payload))

    csv_text = transactions_to_csv(rows)
    written = write_outputs(raw_payload, csv_text)
    database_result = upsert_transactions(rows, raw_payload, date_from, date_to) if write_database else None
    metadata = bump_app_state("gocardless-sync") if write_database and rows else None

    return {
        "ok": True,
        "dryRun": dry_run,
        "writeDatabase": write_database,
        "dateFrom": date_from,
        "dateTo": date_to,
        "accountCount": len(account_ids),
        "transactionCount": len(rows),
        "written": written,
        "database": database_result,
        "metadata": metadata,
    }


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
    ]
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=headers)
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
    metadata = {
        "version": now,
        "updatedAt": now,
        "transactionsUpdatedAt": now,
        "reason": reason,
    }

    if not bucket:
        return metadata

    import boto3

    boto3.client("s3").put_object(
        Bucket=bucket,
        Key=key,
        Body=json.dumps(metadata).encode("utf-8"),
        ContentType="application/json",
        CacheControl="no-store, no-cache, max-age=0, must-revalidate",
    )
    return metadata


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
    return client.execute_statement(
        resourceArn=resource_arn,
        secretArn=secret_arn,
        database=database,
        sql=sql,
        parameters=parameters or [],
    )


def batch_execute_statement(client, resource_arn, secret_arn, database, sql, parameter_sets):
    return client.batch_execute_statement(
        resourceArn=resource_arn,
        secretArn=secret_arn,
        database=database,
        sql=sql,
        parameterSets=parameter_sets,
    )


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


def require_env(name):
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"{name} environment variable is required.")
    return value
