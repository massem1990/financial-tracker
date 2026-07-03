#!/usr/bin/env python3
import csv
import hashlib
import json
from pathlib import Path


EXPENSES_PATH = Path("expenses.csv")
ACCOUNT_MAPPING_PATH = Path("account-mapping.json")
OUTPUT_PATH = Path("old_expenses_in_gocardless_format.csv")

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
]


def main():
    account_lookup = build_account_lookup()
    unknown_accounts = set()
    rows_written = 0

    with EXPENSES_PATH.open(newline="", encoding="utf-8") as source, OUTPUT_PATH.open(
        "w", newline="", encoding="utf-8"
    ) as target:
        reader = csv.DictReader(source)
        writer = csv.DictWriter(target, fieldnames=OUTPUT_HEADERS)
        writer.writeheader()

        for index, row in enumerate(reader):
            account_number = row.get("accountNumber", "").strip()
            account_id = account_lookup.get(account_number, "")
            if not account_id and account_number:
                unknown_accounts.add(account_number)

            writer.writerow(
                {
                    "accountId": account_id,
                    "status": "booked",
                    "transactionId": build_transaction_id(row, index),
                    "bookingDate": normalize_date(row.get("Transaction Date", "")),
                    "valueDate": normalize_date(row.get("valuedate", "")),
                    "amount": row.get("Amount", "").strip(),
                    "currency": row.get("mutationcode", "").strip() or "EUR",
                    "creditorName": row.get("Short Description", "").strip(),
                    "debtorName": "",
                    "description": row.get("Long Description", "").strip()
                    or row.get("Short Description", "").strip(),
                    "bankTransactionCode": "",
                    "proprietaryBankTransactionCode": get_category(row),
                }
            )
            rows_written += 1

    print(f"Wrote {rows_written} rows to {OUTPUT_PATH}")
    if unknown_accounts:
        print("Unknown accountNumber values:")
        for account_number in sorted(unknown_accounts):
            print(f"  {account_number}")


def build_account_lookup():
    mapping = json.loads(ACCOUNT_MAPPING_PATH.read_text(encoding="utf-8"))
    lookup = {}
    for account_id, details in mapping.items():
        digits = "".join(character for character in details["iban"] if character.isdigit())
        lookup[digits[-9:]] = account_id
    return lookup


def normalize_date(value):
    value = value.strip()
    if len(value) == 8 and value.isdigit():
        return f"{value[:4]}-{value[4:6]}-{value[6:8]}"
    return value


def get_category(row):
    for key, value in row.items():
        if key.lower().startswith("un categorized transactions"):
            return value.strip()
    return row.get("Sheet Name", "").strip()


def build_transaction_id(row, index):
    source = "|".join(
        [
            row.get("accountNumber", "").strip(),
            row.get("Transaction Date", "").strip(),
            row.get("valuedate", "").strip(),
            row.get("Amount", "").strip(),
            row.get("Long Description", "").strip(),
            str(index),
        ]
    )
    digest = hashlib.sha1(source.encode("utf-8")).hexdigest()[:16]
    return f"old-expense-{digest}"


if __name__ == "__main__":
    main()
