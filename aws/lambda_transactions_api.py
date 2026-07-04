import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote
from uuid import uuid4


DEFAULT_LIMIT = 300
MAX_LIMIT = 1000


def handler(event, context):
    try:
        method = event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod", "GET")
        path = event.get("rawPath") or event.get("path", "/transactions")

        if method == "OPTIONS":
            return response(204, {})

        if not is_authorized(event):
            return response(401, {"error": "Unauthorized"})

        if path.endswith("/health"):
            return response(200, {"ok": True, "service": "financial-tracker-api"})

        if path.endswith("/categorization-rules") and method == "GET":
            return response(200, {"rules": fetch_categorization_rules()})

        if path.endswith("/categorization-rules") and method == "PUT":
            rules = save_categorization_rules(read_json_body(event))
            return response(200, {"rules": rules, "metadata": bump_app_state("categorization-rules-updated")})

        if path.endswith("/transactions") or path == "/":
            params = event.get("queryStringParameters") or {}
            transactions, next_offset = fetch_transactions(params)
            return response(200, {"transactions": transactions, "nextOffset": next_offset})

        if path.endswith("/sync/gocardless") and method == "POST":
            result = run_gocardless_sync(read_json_body(event))
            return response(200, result)

        sync_status_id = path_param_after(path, "/sync/gocardless/")
        if sync_status_id and method == "GET":
            return response(200, fetch_sync_status(sync_status_id))

        if path.endswith("/categories") and method == "GET":
            return response(200, {"categories": fetch_categories()})

        if path.endswith("/categories") and method == "POST":
            category = create_category(read_json_body(event))
            return response(201, {"category": category, "metadata": bump_app_state("category-created")})

        category_name = path_param_after(path, "/categories/")
        if category_name and method == "PUT":
            category = update_category(category_name, read_json_body(event))
            return response(200, {"category": category, "metadata": bump_app_state("category-updated")})

        if category_name and method == "DELETE":
            delete_category(category_name)
            return response(200, {"ok": True, "metadata": bump_app_state("category-deleted")})

        transaction_category_id = transaction_category_path_id(path)
        if transaction_category_id and method == "PUT":
            transaction = update_transaction_category(transaction_category_id, read_json_body(event))
            return response(200, {"transaction": transaction, "metadata": bump_app_state("transaction-category-updated")})

        if transaction_category_id and method == "DELETE":
            clear_transaction_category(transaction_category_id)
            return response(200, {"ok": True, "metadata": bump_app_state("transaction-category-cleared")})

        transaction_details_id = transaction_details_path_id(path)
        if transaction_details_id and method == "PUT":
            transaction = update_transaction_details(transaction_details_id, read_json_body(event))
            return response(200, {"transaction": transaction, "metadata": bump_app_state("transaction-details-updated")})

        return response(404, {"error": "Not found", "path": path})
    except Exception as error:
        return response(500, {"error": str(error), "type": type(error).__name__})


def is_authorized(event):
    expected = os.getenv("APP_API_KEY", "")
    if not expected:
        return True

    headers = normalize_headers(event.get("headers") or {})
    return headers.get("x-api-key") == expected


def normalize_headers(headers):
    return {key.lower(): value for key, value in headers.items()}


def fetch_transactions(params):
    import boto3

    limit = clamp_int(params.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT)
    offset = clamp_int(params.get("offset"), 0, 0, 1_000_000)
    search = (params.get("search") or "").strip()
    account_id = (params.get("account_id") or "").strip()

    where = []
    parameters = [long_param("limit", limit), long_param("offset", offset)]

    if search:
        where.append(
            "(description ILIKE :search OR short_description ILIKE :search OR creditor_name ILIKE :search OR debtor_name ILIKE :search OR account_id ILIKE :search OR account_friendly_name ILIKE :search)"
        )
        parameters.append(string_param("search", f"%{search}%"))

    if account_id:
        where.append("account_id = :account_id")
        parameters.append(string_param("account_id", account_id))

    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    sql = f"""
        SELECT
          transactions.id,
          transactions.account_id,
          transactions.status,
          transactions.transaction_id,
          transactions.booking_date,
          transactions.value_date,
          transactions.amount,
          transactions.currency,
          transactions.creditor_name,
          transactions.debtor_name,
          transactions.description,
          transactions.bank_transaction_code,
          transactions.proprietary_bank_transaction_code,
          transactions.short_description,
          transactions.override_month,
          transactions.travel_tag,
          transactions.account_friendly_name,
          category_override.category_name
        FROM transactions
        LEFT JOIN transaction_category_overrides category_override
          ON category_override.transaction_id = transactions.id
        {where_sql}
        ORDER BY booking_date DESC NULLS LAST, id DESC
        LIMIT :limit
        OFFSET :offset
    """

    client = boto3.client("rds-data")
    result = client.execute_statement(
        resourceArn=require_env("DB_CLUSTER_ARN"),
        secretArn=require_env("DB_SECRET_ARN"),
        database=require_env("DB_NAME"),
        sql=sql,
        parameters=parameters,
    )
    transactions = [record_to_transaction(record) for record in result.get("records", [])]
    next_offset = offset + limit if len(transactions) == limit else None
    return transactions, next_offset


def run_gocardless_sync(payload):
    import boto3

    function_name = os.getenv("GOCARDLESS_SYNC_FUNCTION", "financial-tracker-gocardless-sync")
    sync_id = payload.get("syncId") or payload.get("sync_id") or f"sync-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid4().hex[:8]}"
    sync_payload = {
        "sync_id": sync_id,
        "dry_run": request_bool(payload.get("dryRun", payload.get("dry_run"))) if has_any(payload, ["dryRun", "dry_run"]) else False,
        "write_database": request_bool(payload.get("writeDatabase", payload.get("write_database")))
        if has_any(payload, ["writeDatabase", "write_database"])
        else True,
    }

    for source, target in [
        ("dateFrom", "date_from"),
        ("date_from", "date_from"),
        ("dateTo", "date_to"),
        ("date_to", "date_to"),
        ("overlapDays", "overlap_days"),
        ("overlap_days", "overlap_days"),
        ("initialLookbackDays", "initial_lookback_days"),
        ("initial_lookback_days", "initial_lookback_days"),
    ]:
        if source in payload and payload[source] not in (None, ""):
            sync_payload[target] = payload[source]

    lambda_client = boto3.client("lambda")
    if not request_bool(payload.get("wait")):
        status = {"syncId": sync_id, "status": "started", "message": "Sync job started"}
        write_sync_status(status)
        lambda_client.invoke(
            FunctionName=function_name,
            InvocationType="Event",
            Payload=json.dumps(sync_payload).encode("utf-8"),
        )
        return {"ok": True, "syncId": sync_id, "sync": status, "metadata": fetch_app_state_safely()}

    result = lambda_client.invoke(
        FunctionName=function_name,
        InvocationType="RequestResponse",
        Payload=json.dumps(sync_payload).encode("utf-8"),
    )
    body = json.loads(result["Payload"].read().decode("utf-8") or "{}")
    if "FunctionError" in result:
        raise RuntimeError(body.get("errorMessage") or json.dumps(body))

    metadata = body.get("metadata") or fetch_app_state_safely()
    return {"ok": True, "sync": body, "metadata": metadata}


def has_any(payload, keys):
    return any(key in payload for key in keys)


def request_bool(value):
    if isinstance(value, bool):
        return value
    return str(value).lower() in {"1", "true", "yes", "y"}


def fetch_app_state_safely():
    bucket = os.getenv("APP_STATE_BUCKET")
    key = os.getenv("APP_STATE_KEY", "metadata/app-state.json")
    if not bucket:
        return None

    import boto3

    try:
        item = boto3.client("s3").get_object(Bucket=bucket, Key=key)
        return json.loads(item["Body"].read().decode("utf-8"))
    except Exception:
        return None


def fetch_categorization_rules():
    bucket = os.getenv("CATEGORIZATION_RULES_BUCKET") or os.getenv("APP_STATE_BUCKET")
    key = os.getenv("CATEGORIZATION_RULES_KEY", "metadata/category-rules.json")
    if bucket:
        import boto3

        try:
            item = boto3.client("s3").get_object(Bucket=bucket, Key=key)
            return sanitize_rules(json.loads(item["Body"].read().decode("utf-8")))
        except Exception as error:
            if getattr(error, "response", {}).get("Error", {}).get("Code") not in {"NoSuchKey", "404", "NoSuchBucket"}:
                raise

    local_path = Path(__file__).with_name("category_rules.json")
    return sanitize_rules(json.loads(local_path.read_text(encoding="utf-8")))


def save_categorization_rules(payload):
    rules = sanitize_rules(payload.get("rules") if isinstance(payload, dict) and "rules" in payload else payload)
    bucket = os.getenv("CATEGORIZATION_RULES_BUCKET") or os.getenv("APP_STATE_BUCKET")
    key = os.getenv("CATEGORIZATION_RULES_KEY", "metadata/category-rules.json")
    if not bucket:
        raise RuntimeError("APP_STATE_BUCKET or CATEGORIZATION_RULES_BUCKET is required.")

    import boto3

    boto3.client("s3").put_object(
        Bucket=bucket,
        Key=key,
        Body=json.dumps(rules, indent=2, sort_keys=True).encode("utf-8"),
        ContentType="application/json",
        CacheControl="no-store, no-cache, max-age=0, must-revalidate",
    )
    return rules


def sanitize_rules(rules):
    rules = rules if isinstance(rules, dict) else {}
    sanitized = {
        "keywords": clean_rule_map(rules.get("keywords")),
        "shortDescriptions": clean_rule_map(rules.get("shortDescriptions")),
        "transferAccounts": clean_rule_map(rules.get("transferAccounts"), uppercase_keys=True),
        "travelCategories": clean_rule_map(rules.get("travelCategories"), uppercase_keys=True),
        "amountOverrides": {},
        "tempAmountOverrideCategory": clean_text(rules.get("tempAmountOverrideCategory")) or "Online Subscriptions",
    }

    amount_overrides = rules.get("amountOverrides") if isinstance(rules.get("amountOverrides"), dict) else {}
    for category, overrides in amount_overrides.items():
        category_name = clean_text(category)
        if not category_name or not isinstance(overrides, dict):
            continue
        cleaned = clean_rule_map(overrides)
        if cleaned:
            sanitized["amountOverrides"][category_name] = cleaned

    return sanitized


def clean_rule_map(value, uppercase_keys=False):
    if not isinstance(value, dict):
        return {}
    cleaned = {}
    for key, item in value.items():
        clean_key = clean_text(key)
        clean_value = clean_text(item)
        if clean_key and clean_value:
            cleaned[clean_key.upper() if uppercase_keys else clean_key.lower()] = clean_value
    return dict(sorted(cleaned.items()))


def fetch_sync_status(sync_id):
    bucket = os.getenv("APP_STATE_BUCKET")
    if not bucket:
        raise RuntimeError("APP_STATE_BUCKET is required for sync status.")

    import boto3

    key = sync_status_key(sync_id)
    try:
        item = boto3.client("s3").get_object(Bucket=bucket, Key=key)
        return json.loads(item["Body"].read().decode("utf-8"))
    except Exception as error:
        if getattr(error, "response", {}).get("Error", {}).get("Code") in {"NoSuchKey", "404"}:
            return {"syncId": sync_id, "status": "started", "message": "Waiting for sync job to report progress"}
        raise


def write_sync_status(payload):
    bucket = os.getenv("APP_STATE_BUCKET")
    if not bucket:
        return

    import boto3

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    payload = {**payload, "updatedAt": payload.get("updatedAt") or now}
    boto3.client("s3").put_object(
        Bucket=bucket,
        Key=sync_status_key(payload["syncId"]),
        Body=json.dumps(payload).encode("utf-8"),
        ContentType="application/json",
        CacheControl="no-store, no-cache, max-age=0, must-revalidate",
    )


def sync_status_key(sync_id):
    return f"{os.getenv('SYNC_STATUS_PREFIX', 'metadata/sync-runs').strip('/')}/{sync_id}.json"


def record_to_transaction(record):
    original_category = read_value(record[12]) or "Uncategorized"
    category_override = read_value(record[17])
    return {
        "id": read_value(record[0]),
        "account": read_value(record[1]),
        "status": read_value(record[2]),
        "transactionId": read_value(record[3]),
        "date": read_value(record[4]),
        "valueDate": read_value(record[5]),
        "amount": float(read_value(record[6]) or 0),
        "currency": read_value(record[7]) or "EUR",
        "creditorName": read_value(record[8]),
        "debtorName": read_value(record[9]),
        "description": read_value(record[10]) or read_value(record[8]) or read_value(record[9]) or "Untitled transaction",
        "category": category_override or original_category,
        "originalCategory": original_category,
        "categoryOverride": category_override,
        "bankTransactionCode": read_value(record[11]),
        "shortDescription": read_value(record[13]),
        "overrideMonth": read_value(record[14]),
        "travelTag": read_value(record[15]),
        "accountFriendlyName": read_value(record[16]),
    }


def fetch_categories():
    result = execute_statement(
        """
        SELECT id, name, bucket, type, actual_expense, regular_expense, frequency, monthly_budget
        FROM categories
        ORDER BY bucket ASC, name ASC
        """,
        [],
    )
    return [record_to_category(record) for record in result.get("records", [])]


def create_category(payload):
    category = sanitize_category_payload(payload)
    result = execute_statement(
        """
        INSERT INTO categories (name, bucket, type, actual_expense, regular_expense, frequency, monthly_budget)
        VALUES (:name, :bucket, :type, :actual_expense, :regular_expense, :frequency, :monthly_budget)
        RETURNING id, name, bucket, type, actual_expense, regular_expense, frequency, monthly_budget
        """,
        category_params(category),
    )
    return record_to_category(result["records"][0])


def update_category(category_name, payload):
    category = sanitize_category_payload(payload)
    category["original_name"] = category_name
    result = execute_statement(
        """
        UPDATE categories
        SET name = :name,
            bucket = :bucket,
            type = :type,
            actual_expense = :actual_expense,
            regular_expense = :regular_expense,
            frequency = :frequency,
            monthly_budget = :monthly_budget,
            updated_at = now()
        WHERE name = :original_name
        RETURNING id, name, bucket, type, actual_expense, regular_expense, frequency, monthly_budget
        """,
        [*category_params(category), string_param("original_name", category["original_name"])],
    )
    if not result.get("records"):
        raise ValueError(f"Category not found: {category_name}")

    if category_name != category["name"]:
        execute_statement(
            """
            UPDATE transaction_category_overrides
            SET category_name = :name,
                updated_at = now()
            WHERE category_name = :original_name
            """,
            [string_param("name", category["name"]), string_param("original_name", category_name)],
        )

    return record_to_category(result["records"][0])


def delete_category(category_name):
    execute_statement(
        "DELETE FROM transaction_category_overrides WHERE category_name = :name",
        [string_param("name", category_name)],
    )
    execute_statement("DELETE FROM categories WHERE name = :name", [string_param("name", category_name)])


def update_transaction_category(transaction_id, payload):
    category = (payload.get("category") or "").strip()
    if not category:
        raise ValueError("category is required.")

    execute_statement(
        """
        INSERT INTO transaction_category_overrides (transaction_id, category_name)
        VALUES (:transaction_id, :category)
        ON CONFLICT (transaction_id)
        DO UPDATE SET category_name = EXCLUDED.category_name,
                      updated_at = now()
        """,
        [long_param("transaction_id", transaction_id), string_param("category", category)],
    )
    return {"id": transaction_id, "category": category}


def clear_transaction_category(transaction_id):
    execute_statement(
        "DELETE FROM transaction_category_overrides WHERE transaction_id = :transaction_id",
        [long_param("transaction_id", transaction_id)],
    )


def update_transaction_details(transaction_id, payload):
    execute_statement(
        """
        UPDATE transactions
        SET short_description = :short_description,
            override_month = :override_month,
            travel_tag = :travel_tag,
            account_friendly_name = :account_friendly_name,
            updated_at = now()
        WHERE id = :transaction_id
        """,
        [
            long_param("transaction_id", transaction_id),
            nullable_string_param("short_description", clean_text(payload.get("shortDescription"))),
            nullable_string_param("override_month", normalize_override_month(payload.get("overrideMonth"))),
            nullable_string_param("travel_tag", clean_text(payload.get("travelTag"))),
            nullable_string_param("account_friendly_name", clean_text(payload.get("accountFriendlyName"))),
        ],
    )

    if "category" in payload:
        category = clean_text(payload.get("category"))
        original_category = clean_text(payload.get("originalCategory"))
        if not category or category == "Uncategorized" or category == original_category:
            clear_transaction_category(transaction_id)
        else:
            update_transaction_category(transaction_id, {"category": category})

    return {"id": transaction_id}


def bump_app_state(reason):
    bucket = os.getenv("APP_STATE_BUCKET")
    key = os.getenv("APP_STATE_KEY", "metadata/app-state.json")
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    metadata = {
        "version": now,
        "updatedAt": now,
        "reason": reason,
    }

    if reason.startswith("category"):
        metadata["categoriesUpdatedAt"] = now
    else:
        metadata["transactionsUpdatedAt"] = now

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


def record_to_category(record):
    return {
        "id": read_value(record[0]),
        "name": read_value(record[1]),
        "bucket": read_value(record[2]) or "Other",
        "type": read_value(record[3]) or "N/A",
        "actualExpense": read_value(record[4]) or "Yes",
        "regularExpense": read_value(record[5]) or "Yes",
        "frequency": read_value(record[6]) or "Everyday Expense",
        "monthlyBudget": float(read_value(record[7]) or 0),
    }


def read_value(field):
    if not field or field.get("isNull"):
        return None
    for key in ("stringValue", "longValue", "doubleValue", "booleanValue"):
        if key in field:
            return field[key]
    return None


def read_json_body(event):
    body = event.get("body") or "{}"
    return json.loads(body)


def path_param_after(path, prefix):
    if prefix not in path:
        return ""
    value = path.split(prefix, 1)[1].strip("/")
    if not value or "/" in value:
        return ""
    return unquote(value)


def transaction_category_path_id(path):
    marker = "/transactions/"
    suffix = "/category"
    if marker not in path or not path.endswith(suffix):
        return 0

    value = path.split(marker, 1)[1][: -len(suffix)].strip("/")
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def transaction_details_path_id(path):
    marker = "/transactions/"
    suffix = "/details"
    if marker not in path or not path.endswith(suffix):
        return 0

    value = path.split(marker, 1)[1][: -len(suffix)].strip("/")
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def clean_text(value):
    return (value or "").strip()


def normalize_override_month(value):
    value = clean_text(value)
    if len(value) == 7 and value[4] == "/":
        return value.replace("/", "-")
    return value


def sanitize_category_payload(payload):
    name = (payload.get("name") or "").strip()
    if not name:
        raise ValueError("name is required.")

    return {
        "name": name,
        "bucket": (payload.get("bucket") or "Other").strip() or "Other",
        "type": (payload.get("type") or "N/A").strip() or "N/A",
        "actual_expense": (payload.get("actualExpense") or "Yes").strip() or "Yes",
        "regular_expense": (payload.get("regularExpense") or "Yes").strip() or "Yes",
        "frequency": (payload.get("frequency") or "Everyday Expense").strip() or "Everyday Expense",
        "monthly_budget": float(payload.get("monthlyBudget") or 0),
    }


def category_params(category):
    return [
        string_param("name", category["name"]),
        string_param("bucket", category["bucket"]),
        string_param("type", category["type"]),
        string_param("actual_expense", category["actual_expense"]),
        string_param("regular_expense", category["regular_expense"]),
        string_param("frequency", category["frequency"]),
        double_param("monthly_budget", category["monthly_budget"]),
    ]


def execute_statement(sql, parameters):
    import boto3

    client = boto3.client("rds-data")
    return client.execute_statement(
        resourceArn=require_env("DB_CLUSTER_ARN"),
        secretArn=require_env("DB_SECRET_ARN"),
        database=require_env("DB_NAME"),
        sql=sql,
        parameters=parameters,
    )


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": os.getenv("CORS_ORIGIN", "*"),
            "Access-Control-Allow-Headers": "Content-Type,x-api-key",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        },
        "body": json.dumps(body),
    }


def clamp_int(value, default, minimum, maximum):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, parsed))


def string_param(name, value):
    return {"name": name, "value": {"stringValue": str(value)}}


def long_param(name, value):
    return {"name": name, "value": {"longValue": int(value)}}


def double_param(name, value):
    return {"name": name, "value": {"doubleValue": float(value)}}


def nullable_string_param(name, value):
    if value is None or value == "":
        return {"name": name, "value": {"isNull": True}}
    return string_param(name, value)


def require_env(name):
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"{name} environment variable is required.")
    return value
