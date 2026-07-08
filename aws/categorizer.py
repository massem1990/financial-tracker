import json
import os
import time
from decimal import Decimal, InvalidOperation
from pathlib import Path


RULES_PATH = Path(__file__).with_name("category_rules.json")
ACCOUNT_NAMES = {
    "9fec222d-41aa-4e8a-a10e-f0e18087b956": "Monthly Payments",
    "abd3956b-20ed-4b80-89f3-11a4c231167d": "Mahmoud Personal",
    "57c1345d-e265-46f0-bb15-176cf6aa6d4b": "Shopping Needs",
    "1a8ad7e2-6267-47c1-855a-b76300b36b99": "Shopping Wants",
    "4a6baa7b-cbd4-43b4-94ef-c10db0c29fc5": "Alice Personal",
    "6b6dce78-7562-457b-9083-f49600814485": "Mahmoud Revolut EUR",
    "a376e0f1-1484-476a-b37a-7b95b42273cf": "Alice Revolut RON",
    "c7586325-594a-4019-b363-2d58a592434c": "Alice Revolut EUR",
    "ceb237a4-362c-456d-8e16-4d2a5d321466": "Mahmoud Revolut RON",
}


def categorize_transaction(row, fill_missing_only=True):
    """Apply the old Google Sheet keyword categorisation rules to one row."""
    result = dict(row)
    rules = load_rules()
    amount_text = amount_key(result.get("amount", ""))
    description = str(result.get("description") or "").lower()

    last_category = None
    pending_short = None
    pending_travel = None

    for keyword, category in rules["keywords"].items():
        if keyword not in description:
            continue

        value = category
        amount_overrides = rules.get("amountOverrides", {}).get(value)
        if amount_overrides and amount_text in amount_overrides:
            value = rules["tempAmountOverrideCategory"]
            pending_short = amount_overrides[amount_text]
        elif value == "Transfers":
            account_name = rules.get("transferAccounts", {}).get(keyword.upper(), "")
            if account_name:
                direction = "To" if decimal_amount(result.get("amount")) < 0 else "From"
                pending_short = f'{direction} "{account_name}" Account'
        elif value == "Travel":
            travel_tag = rules.get("travelCategories", {}).get(keyword.upper(), "")
            if travel_tag:
                pending_travel = travel_tag

        explicit_short = rules.get("shortDescriptions", {}).get(keyword)
        if explicit_short is not None:
            pending_short = explicit_short

        last_category = value

    for keyword, amount_categories in rules.get("keywordAmountCategories", {}).items():
        if keyword in description and amount_text in amount_categories:
            last_category = amount_categories[amount_text]

    if last_category:
        result["proprietaryBankTransactionCode"] = last_category
        result["category"] = last_category
    if pending_short and should_fill(result.get("shortDescription"), fill_missing_only):
        result["shortDescription"] = pending_short
    if pending_travel and should_fill(result.get("travelTag"), fill_missing_only):
        result["travelTag"] = pending_travel

    account_name = ACCOUNT_NAMES.get(result.get("accountId", ""))
    if account_name and should_fill(result.get("accountFriendlyName"), fill_missing_only):
        result["accountFriendlyName"] = account_name

    return result


def load_rules():
    bucket = os.getenv("CATEGORIZATION_RULES_BUCKET")
    key = os.getenv("CATEGORIZATION_RULES_KEY", "metadata/category-rules.json")
    if bucket:
        now = time.time()
        cached_at = getattr(load_rules, "_cache_loaded_at", 0)
        if not hasattr(load_rules, "_cache") or now - cached_at > 30:
            import boto3

            try:
                item = boto3.client("s3").get_object(Bucket=bucket, Key=key)
                load_rules._cache = json.loads(item["Body"].read().decode("utf-8"))
            except Exception:
                load_rules._cache = json.loads(RULES_PATH.read_text(encoding="utf-8"))
            load_rules._cache_loaded_at = now
        return load_rules._cache

    if not hasattr(load_rules, "_cache"):
        load_rules._cache = json.loads(RULES_PATH.read_text(encoding="utf-8"))
    return load_rules._cache


def clean(value):
    return str(value or "").strip()


def should_fill(current_value, fill_missing_only):
    return not fill_missing_only or not clean(current_value)


def amount_key(value):
    text = clean(value)
    if not text:
        return ""
    try:
        number = Decimal(text.replace(",", "."))
    except InvalidOperation:
        return text
    normalized = format(number.normalize(), "f")
    if "." in normalized:
        normalized = normalized.rstrip("0").rstrip(".")
    return normalized


def decimal_amount(value):
    try:
        return Decimal(clean(value).replace(",", ".") or "0")
    except InvalidOperation:
        return Decimal("0")
