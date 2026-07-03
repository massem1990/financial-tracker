#!/usr/bin/env python3
import csv
import hashlib
import json
from pathlib import Path


SOURCE_PATH = Path("Latest_Transactions.csv")
ACCOUNT_MAPPING_PATH = Path("account-mapping.json")
OUTPUT_PATH = Path("historical_export_proper_format.csv")

OUTPUT_HEADERS = [
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
    "category",
    "overrideMonth",
    "travelTag",
    "accountFriendlyName",
]


def main():
    account_lookup = build_account_lookup()
    rows_written = 0
    unknown_accounts = {}
    seen_transaction_ids = {}

    with SOURCE_PATH.open(newline="", encoding="utf-8-sig") as source, OUTPUT_PATH.open(
        "w", newline="", encoding="utf-8"
    ) as target:
        reader = csv.DictReader(source)
        writer = csv.DictWriter(target, fieldnames=OUTPUT_HEADERS)
        writer.writeheader()

        for index, row in enumerate(reader):
            account_number = value(row, "accountNumber")
            account_friendly_name = value(row, "Account Friendly Name")
            account_id = account_lookup.get(account_number) or account_friendly_name or account_number
            if account_number and account_number not in account_lookup:
                unknown_accounts[account_number] = account_id

            category = value(row, "Category")
            transaction_id = build_transaction_id(row)
            seen_transaction_ids[transaction_id] = seen_transaction_ids.get(transaction_id, 0) + 1
            if seen_transaction_ids[transaction_id] > 1:
                transaction_id = f"{transaction_id}-{seen_transaction_ids[transaction_id]}"
            writer.writerow(
                {
                    "accountId": account_id,
                    "status": "booked",
                    "transactionId": transaction_id,
                    "bookingDate": normalize_date(value(row, "Transaction Date")),
                    "valueDate": normalize_date(value(row, "valuedate")),
                    "amount": value(row, "Amount"),
                    "currency": value(row, "mutationcode") or "EUR",
                    "creditorName": value(row, "Short Description"),
                    "debtorName": "",
                    "description": value(row, "Long Description") or value(row, "Short Description"),
                    "bankTransactionCode": "",
                    "proprietaryBankTransactionCode": category,
                    "shortDescription": value(row, "Short Description"),
                    "category": category,
                    "overrideMonth": normalize_override_month(value(row, "Override Month")),
                    "travelTag": value(row, "Travel Tag"),
                    "accountFriendlyName": account_friendly_name or account_id,
                }
            )
            rows_written += 1

    print(f"Wrote {rows_written} rows to {OUTPUT_PATH}")
    if unknown_accounts:
        print("Accounts without UUID mapping; using friendly name fallback:")
        for source_account, fallback in sorted(unknown_accounts.items()):
            print(f"  {source_account} -> {fallback}")


def build_account_lookup():
    mapping = json.loads(ACCOUNT_MAPPING_PATH.read_text(encoding="utf-8"))
    lookup = {}
    for account_id, details in mapping.items():
        digits = "".join(character for character in details["iban"] if character.isdigit())
        lookup[digits[-9:]] = account_id
    return lookup


def value(row, key):
    return (row.get(key) or "").strip()


def normalize_date(raw):
    if len(raw) == 8 and raw.isdigit():
        return f"{raw[:4]}-{raw[4:6]}-{raw[6:8]}"
    return raw


def normalize_override_month(raw):
    if len(raw) == 7 and raw[4] in {"/", "-"}:
        return f"{raw[:4]}-{raw[5:7]}"
    return raw


def build_transaction_id(row):
    source = "|".join(
        [
            value(row, "accountNumber"),
            value(row, "Transaction Date"),
            value(row, "valuedate"),
            value(row, "startsaldo"),
            value(row, "endsaldo"),
            value(row, "Amount"),
            value(row, "Long Description"),
            value(row, "Short Description"),
        ]
    )
    digest = hashlib.sha1(source.encode("utf-8")).hexdigest()[:16]
    return f"old-expense-{digest}"


if __name__ == "__main__":
    main()
