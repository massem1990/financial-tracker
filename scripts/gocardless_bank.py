#!/usr/bin/env python3
import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


BASE_URL = "https://bankaccountdata.gocardless.com/api/v2"
STATE_DIR = Path(".gocardless")
STATE_FILE = STATE_DIR / "state.json"
DEFAULT_REDIRECT = "http://localhost:5173/"


def main():
    parser = argparse.ArgumentParser(description="Local GoCardless Bank Account Data helper.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    institutions = subparsers.add_parser("institutions", help="List institutions for a country.")
    institutions.add_argument("--country", default="NL", help="ISO country code. Defaults to NL.")
    institutions.add_argument("--search", default="ABN", help="Filter institution names. Defaults to ABN.")

    init = subparsers.add_parser("init", help="Create a requisition and print the bank consent link.")
    init.add_argument("--institution-id", required=True, help="Institution id from the institutions command.")
    init.add_argument("--redirect", default=DEFAULT_REDIRECT, help="Redirect URL after bank consent.")

    status = subparsers.add_parser("status", help="Show requisition and linked account status.")
    status.add_argument("--requisition-id", help="Defaults to the saved requisition id.")

    fetch = subparsers.add_parser("fetch", help="Fetch transactions for linked accounts.")
    fetch.add_argument("--requisition-id", help="Defaults to the saved requisition id.")
    fetch.add_argument("--account-id", action="append", help="Fetch one account id. Can be repeated.")
    fetch.add_argument("--date-from", help="YYYY-MM-DD")
    fetch.add_argument("--date-to", help="YYYY-MM-DD")
    fetch.add_argument("--out", default="gocardless-transactions.csv", help="Output CSV path.")

    args = parser.parse_args()

    if args.command == "institutions":
      list_institutions(args.country, args.search)
    elif args.command == "init":
      create_requisition(args.institution_id, args.redirect)
    elif args.command == "status":
      show_status(args.requisition_id)
    elif args.command == "fetch":
      fetch_transactions(args.requisition_id, args.account_id, args.date_from, args.date_to, args.out)


def list_institutions(country, search):
    token = get_access_token()
    institutions = request_json("GET", f"/institutions/?country={urllib.parse.quote(country)}", token=token)
    search_lower = search.lower()
    matches = [item for item in institutions if search_lower in item.get("name", "").lower()]

    for item in matches:
        print(f"{item['id']}\t{item['name']}")

    if not matches:
        print(f"No institutions matched {search!r} in {country}.", file=sys.stderr)


def create_requisition(institution_id, redirect):
    token = get_access_token()
    reference = f"financial-tracker-{int(time.time())}"
    payload = {
        "redirect": redirect,
        "institution_id": institution_id,
        "reference": reference,
        "user_language": "EN",
    }
    requisition = request_json("POST", "/requisitions/", token=token, payload=payload)
    state = load_state()
    upsert_requisition(
        state,
        {
            "id": requisition["id"],
            "reference": reference,
            "institution_id": institution_id,
            "status": requisition.get("status", ""),
            "accounts": requisition.get("accounts", []),
        },
    )
    save_state(state)

    print("Open this link and approve bank access:")
    print(requisition["link"])
    print()
    print(f"Saved requisition id: {requisition['id']}")
    print("After approving, run:")
    print("  python3 scripts/gocardless_bank.py status")


def show_status(requisition_id=None):
    token = get_access_token()
    state = load_state()
    requisition_ids = [requisition_id] if requisition_id else get_saved_requisition_ids(state)
    if not requisition_ids:
        raise SystemExit("No requisition id found. Run init first.")

    all_accounts = []
    for current_requisition_id in requisition_ids:
        requisition = request_json("GET", f"/requisitions/{current_requisition_id}/", token=token)
        accounts = requisition.get("accounts", [])
        all_accounts.extend(accounts)
        upsert_requisition(
            state,
            {
                "id": current_requisition_id,
                "reference": requisition.get("reference", ""),
                "institution_id": requisition.get("institution_id", ""),
                "status": requisition.get("status", ""),
                "accounts": accounts,
            },
        )

        print(f"Requisition: {current_requisition_id}")
        print(f"Status: {requisition.get('status')}")
        print(f"Accounts: {len(accounts)}")
        for account_id in accounts:
            print(f"  {account_id}")
        print()

    state["accounts"] = sorted(set(all_accounts))
    save_state(state)

    print(f"Total unique accounts: {len(state['accounts'])}")
    for account_id in state["accounts"]:
        print(f"  {account_id}")


def fetch_transactions(requisition_id=None, account_ids=None, date_from=None, date_to=None, out_path="gocardless-transactions.csv"):
    token = get_access_token()
    state = load_state()
    if not account_ids:
        if requisition_id:
            requisition = request_json("GET", f"/requisitions/{requisition_id}/", token=token)
            account_ids = requisition.get("accounts", [])
        else:
            account_ids = state.get("accounts")

    if not account_ids:
        requisition_ids = get_saved_requisition_ids(state)
        if not requisition_ids:
            raise SystemExit("No account ids or requisition id found. Run init/status first.")
        account_ids = []
        for current_requisition_id in requisition_ids:
            requisition = request_json("GET", f"/requisitions/{current_requisition_id}/", token=token)
            account_ids.extend(requisition.get("accounts", []))
        account_ids = sorted(set(account_ids))

    if not account_ids:
        raise SystemExit("No linked accounts found. Approve the consent link, then run status.")

    all_rows = []
    for account_id in account_ids:
        all_rows.extend(fetch_account_transactions(token, account_id, date_from, date_to))

    write_transactions_csv(out_path, all_rows)
    print(f"Wrote {len(all_rows)} transactions to {out_path}")


def fetch_account_transactions(token, account_id, date_from=None, date_to=None):
    params = {}
    if date_from:
        params["date_from"] = date_from
    if date_to:
        params["date_to"] = date_to

    query = f"?{urllib.parse.urlencode(params)}" if params else ""
    payload = request_json("GET", f"/accounts/{account_id}/transactions/{query}", token=token)
    transactions = payload.get("transactions", {})
    booked = transactions.get("booked", [])
    pending = transactions.get("pending", [])

    rows = []
    for status, items in [("booked", booked), ("pending", pending)]:
        for item in items:
            rows.append(normalize_transaction(account_id, status, item))
    return rows


def normalize_transaction(account_id, status, item):
    amount = item.get("transactionAmount", {})
    remittance = item.get("remittanceInformationUnstructured") or item.get("remittanceInformationUnstructuredArray") or ""
    if isinstance(remittance, list):
        remittance = " ".join(remittance)

    return {
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


def write_transactions_csv(path, rows):
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
    with Path(path).open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)


def get_access_token():
    state = load_state()
    token = state.get("access_token")
    expires_at = state.get("access_expires_at", 0)
    if token and time.time() < expires_at - 60:
        return token

    secret_id = os.getenv("GOCARDLESS_SECRET_ID")
    secret_key = os.getenv("GOCARDLESS_SECRET_KEY")
    if not secret_id or not secret_key:
        raise SystemExit("Set GOCARDLESS_SECRET_ID and GOCARDLESS_SECRET_KEY first.")

    payload = {
        "secret_id": secret_id,
        "secret_key": secret_key,
    }
    response = request_json("POST", "/token/new/", payload=payload)
    state["access_token"] = response["access"]
    state["refresh_token"] = response.get("refresh")
    state["access_expires_at"] = time.time() + int(response.get("access_expires", 86400))
    save_state(state)
    return state["access_token"]


def get_saved_requisition_ids(state):
    requisitions = state.get("requisitions", [])
    requisition_ids = [item["id"] for item in requisitions if item.get("id")]
    if state.get("requisition_id") and state["requisition_id"] not in requisition_ids:
        requisition_ids.append(state["requisition_id"])
    return requisition_ids


def upsert_requisition(state, requisition):
    requisitions = state.setdefault("requisitions", [])
    for index, item in enumerate(requisitions):
        if item.get("id") == requisition["id"]:
            requisitions[index] = {**item, **requisition}
            break
    else:
        requisitions.append(requisition)

    state["requisition_id"] = requisition["id"]
    state["accounts"] = sorted(
        set(
            account_id
            for item in requisitions
            for account_id in item.get("accounts", [])
        )
    )


def request_json(method, path, token=None, payload=None):
    data = None
    headers = {
        "Accept": "application/json",
    }
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
        raise SystemExit(f"{method} {path} failed with {error.code}: {body}") from error


def load_state():
    if not STATE_FILE.exists():
        return {}
    return json.loads(STATE_FILE.read_text(encoding="utf-8"))


def save_state(state):
    STATE_DIR.mkdir(exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
