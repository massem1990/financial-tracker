#!/usr/bin/env python3
import csv
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path


CSV_PATH = Path("historical_export_proper_format.csv")
REGION = "eu-central-1"
RESOURCE_ARN = "arn:aws:rds:eu-central-1:750294925278:cluster:financial-tracker"
SECRET_ARN = "arn:aws:secretsmanager:eu-central-1:750294925278:secret:financial-tracker-db-credentials-NDnprI"
DATABASE = "financial_tracker"
PROVIDER = "gocardless"
CHUNK_SIZE = 250


def main():
    rows = read_rows()
    if not rows:
      print("No historical rows found.")
      return

    before = count_historical_rows()
    sync_run_id = create_sync_run(rows)
    ensure_accounts(rows)
    upsert_transactions(rows, sync_run_id)
    complete_sync_run(sync_run_id, len(rows))
    after = count_historical_rows()

    print(json.dumps({
        "csvRows": len(rows),
        "historicalRowsBefore": before,
        "historicalRowsAfter": after,
        "netNewHistoricalRows": after - before,
        "syncRunId": sync_run_id,
    }, indent=2))


def read_rows():
    with CSV_PATH.open(newline="", encoding="utf-8") as file:
        return list(csv.DictReader(file))


def count_historical_rows():
    result = execute_statement(
        """
        SELECT COUNT(*)
        FROM transactions
        WHERE provider = 'gocardless'
          AND transaction_id LIKE 'old-expense-%'
        """,
        [],
    )
    return int(read_field(result["records"][0][0]) or 0)


def create_sync_run(rows):
    dates = [safe_date(row.get("bookingDate")) or safe_date(row.get("valueDate")) for row in rows]
    dates = [date for date in dates if date]
    result = execute_statement(
        """
        INSERT INTO sync_runs (provider, status, date_from, date_to, raw_summary)
        VALUES (
          'gocardless',
          'running',
          CAST(:date_from AS date),
          CAST(:date_to AS date),
          CAST(:raw_summary AS jsonb)
        )
        RETURNING id
        """,
        [
            string_param("date_from", min(dates) if dates else ""),
            string_param("date_to", max(dates) if dates else ""),
            string_param("raw_summary", json.dumps({"mode": "historical_csv_import", "file": str(CSV_PATH), "rows": len(rows)})),
        ],
    )
    return int(read_field(result["records"][0][0]))


def ensure_accounts(rows):
    account_ids = sorted({row.get("accountId", "") for row in rows if row.get("accountId")})
    parameter_sets = [
        [
            string_param("provider", PROVIDER),
            string_param("provider_account_id", account_id),
        ]
        for account_id in account_ids
    ]
    batch_execute_statement(
        """
        INSERT INTO accounts (provider, provider_account_id)
        VALUES (:provider, :provider_account_id)
        ON CONFLICT (provider, provider_account_id)
        DO UPDATE SET updated_at = now()
        """,
        parameter_sets,
    )


def upsert_transactions(rows, sync_run_id):
    sql = """
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
      account_id = EXCLUDED.account_id,
      status = EXCLUDED.status,
      transaction_id = EXCLUDED.transaction_id,
      booking_date = EXCLUDED.booking_date,
      value_date = EXCLUDED.value_date,
      amount = EXCLUDED.amount,
      currency = EXCLUDED.currency,
      creditor_name = EXCLUDED.creditor_name,
      debtor_name = EXCLUDED.debtor_name,
      description = EXCLUDED.description,
      bank_transaction_code = EXCLUDED.bank_transaction_code,
      proprietary_bank_transaction_code = EXCLUDED.proprietary_bank_transaction_code,
      short_description = EXCLUDED.short_description,
      override_month = EXCLUDED.override_month,
      travel_tag = EXCLUDED.travel_tag,
      account_friendly_name = EXCLUDED.account_friendly_name,
      raw_transaction = EXCLUDED.raw_transaction,
      last_sync_run_id = EXCLUDED.last_sync_run_id,
      updated_at = now()
    """
    parameter_sets = [transaction_params(row, sync_run_id) for row in rows]
    batch_execute_statement(sql, parameter_sets)


def transaction_params(row, sync_run_id):
    return [
        string_param("provider", PROVIDER),
        string_param("provider_transaction_key", provider_transaction_key(row)),
        string_param("account_id", row.get("accountId", "")),
        string_param("status", row.get("status", "")),
        nullable_string_param("transaction_id", row.get("transactionId")),
        nullable_string_param("booking_date", safe_date(row.get("bookingDate")) or safe_date(row.get("valueDate"))),
        nullable_string_param("value_date", safe_date(row.get("valueDate")) or safe_date(row.get("bookingDate"))),
        nullable_string_param("amount", row.get("amount")),
        nullable_string_param("currency", row.get("currency")),
        nullable_string_param("creditor_name", row.get("creditorName")),
        nullable_string_param("debtor_name", row.get("debtorName")),
        nullable_string_param("description", row.get("description")),
        nullable_string_param("bank_transaction_code", row.get("bankTransactionCode")),
        nullable_string_param("proprietary_bank_transaction_code", row.get("category") or row.get("proprietaryBankTransactionCode")),
        nullable_string_param("short_description", row.get("shortDescription") or row.get("Short Description")),
        nullable_string_param("override_month", normalize_override_month(row.get("overrideMonth") or row.get("Override Month"))),
        nullable_string_param("travel_tag", row.get("travelTag") or row.get("Travel Tag")),
        nullable_string_param("account_friendly_name", row.get("accountFriendlyName") or row.get("Account Friendly Name")),
        string_param("raw_transaction", json.dumps(row)),
        long_param("sync_run_id", sync_run_id),
    ]


def complete_sync_run(sync_run_id, transaction_count):
    execute_statement(
        """
        UPDATE sync_runs
        SET status = 'success',
            transaction_count = :transaction_count,
            finished_at = now()
        WHERE id = :id
        """,
        [long_param("id", sync_run_id), long_param("transaction_count", transaction_count)],
    )


def provider_transaction_key(row):
    account_id = row.get("accountId", "")
    transaction_id = row.get("transactionId")
    if transaction_id:
        return f"{account_id}:{transaction_id}"

    fallback = "|".join([
        account_id,
        row.get("bookingDate", ""),
        row.get("valueDate", ""),
        row.get("amount", ""),
        row.get("description", ""),
    ])
    return f"{account_id}:hash:{hashlib.sha256(fallback.encode('utf-8')).hexdigest()}"


def safe_date(value):
    if value and re.match(r"^\d{4}-\d{2}-\d{2}$", value):
        return value
    return ""


def normalize_override_month(value):
    if not value:
        return ""
    if re.match(r"^\d{4}-\d{2}$", value):
        return value
    if re.match(r"^\d{4}/\d{2}$", value):
        return value.replace("/", "-")
    return value


def execute_statement(sql, parameters):
    args = [
        "aws",
        "rds-data",
        "execute-statement",
        "--region",
        REGION,
        "--resource-arn",
        RESOURCE_ARN,
        "--secret-arn",
        SECRET_ARN,
        "--database",
        DATABASE,
        "--sql",
        sql,
        "--output",
        "json",
    ]
    if parameters:
        args.extend(["--parameters", json_arg(parameters)])
    return json.loads(run(args).stdout)


def batch_execute_statement(sql, parameter_sets):
    for index in range(0, len(parameter_sets), CHUNK_SIZE):
        chunk = parameter_sets[index:index + CHUNK_SIZE]
        args = [
            "aws",
            "rds-data",
            "batch-execute-statement",
            "--region",
            REGION,
            "--resource-arn",
            RESOURCE_ARN,
            "--secret-arn",
            SECRET_ARN,
            "--database",
            DATABASE,
            "--sql",
            sql,
            "--parameter-sets",
            json_arg(chunk),
            "--output",
            "json",
        ]
        run(args)
        print(f"Imported {min(index + CHUNK_SIZE, len(parameter_sets))}/{len(parameter_sets)}")


def json_arg(value):
    temp = tempfile.NamedTemporaryFile("w", delete=False, encoding="utf-8")
    with temp:
        json.dump(value, temp)
    return f"file://{temp.name}"


def run(args):
    result = subprocess.run(args, text=True, capture_output=True)
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr)
        result.check_returncode()
    return result


def string_param(name, value):
    return {"name": name, "value": {"stringValue": str(value)}}


def nullable_string_param(name, value):
    if value is None or value == "":
        return {"name": name, "value": {"isNull": True}}
    return string_param(name, value)


def long_param(name, value):
    return {"name": name, "value": {"longValue": int(value)}}


def read_field(field):
    if field.get("isNull"):
        return None
    for key in ("stringValue", "longValue", "doubleValue", "booleanValue"):
        if key in field:
            return field[key]
    return None


if __name__ == "__main__":
    main()
