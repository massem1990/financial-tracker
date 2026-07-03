# Financial Tracker

A small mobile-first transaction viewer for an iPhone. For now, local `expenses.csv` and `categories.csv` files are the source of truth.

## Run Locally

```sh
python3 -m http.server 5173
```

Open `http://localhost:5173` in a browser.

## Update Transactions

Replace `expenses.csv` with your latest export, then press Refresh in the app. Replace `categories.csv` to update the category list.

You can also use Settings to load a CSV file just in the current browser. That is useful for quick testing before replacing the project file.

Category changes are saved in this browser for now. Use Export to download a categorized CSV.

The app expects a header row. These names work out of the box:

```csv
accountNumber,Transaction Date,Amount,Long Description,Short Description,Un categorized transactions 0/11634
```

It also understands common alternatives such as `Date`, `Description`, `Merchant`, `Payee`, `Value`, `Category`, `Label`, `Account`, `Bank`, and `Wallet`.

## Add To iPhone

Once hosted over HTTPS, open the app in Safari, tap Share, then choose `Add to Home Screen`.

For the AWS-hosted PWA setup, see:

```text
aws/PWA_APP_SETUP.md
```

## Fetch Transactions With GoCardless

Set your GoCardless Bank Account Data secrets:

```sh
export GOCARDLESS_SECRET_ID=...
export GOCARDLESS_SECRET_KEY=...
```

Find the ABN AMRO institution id:

```sh
python3 scripts/gocardless_bank.py institutions --country NL --search "ABN"
```

Create a consent link:

```sh
python3 scripts/gocardless_bank.py init --institution-id INSTITUTION_ID_FROM_ABOVE
```

Open the printed link, approve access, then check linked accounts:

```sh
python3 scripts/gocardless_bank.py status
```

Fetch transactions:

```sh
python3 scripts/gocardless_bank.py fetch --date-from 2026-01-01 --out gocardless-transactions.csv
```
