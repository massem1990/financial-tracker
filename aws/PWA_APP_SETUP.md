# PWA App Setup

This setup gives your iPhone a web app over the internet:

- Static PWA files in S3.
- CloudFront HTTPS URL in front of S3.
- Read-only API Gateway endpoint backed by Lambda.
- Lambda reads transactions from Aurora PostgreSQL via RDS Data API.

## 1. Deploy The Transactions API Lambda

Package locally:

```sh
cd "/Users/massem/Documents/Financial Tracker/aws"
zip -j lambda_transactions_api.zip lambda_transactions_api.py
```

Create a new Lambda:

```text
Name: financial-tracker-transactions-api
Runtime: Python 3.12
Handler: lambda_transactions_api.handler
Timeout: 30 seconds
Memory: 256 MB
```

Environment variables:

```text
DB_CLUSTER_ARN=arn:aws:rds:eu-central-1:750294925278:cluster:financial-tracker
DB_SECRET_ARN=your-db-secret-arn
DB_NAME=financial_tracker
APP_API_KEY=choose-a-temporary-shared-read-key
CORS_ORIGIN=*
```

The Lambda role needs:

```text
rds-data:ExecuteStatement
secretsmanager:GetSecretValue
```

## 2. Create An HTTP API

In AWS:

1. Open **API Gateway**.
2. Create API.
3. Choose **HTTP API**.
4. Add integration: your `financial-tracker-transactions-api` Lambda.
5. Add routes:

```text
GET /transactions
GET /health
OPTIONS /{proxy+}
```

6. Deploy to default stage.
7. Copy the invoke URL, for example:

```text
https://abc123.execute-api.eu-central-1.amazonaws.com
```

Test:

```sh
curl -H "x-api-key: your-key" "https://abc123.execute-api.eu-central-1.amazonaws.com/transactions?limit=10"
```

## 3. Configure The Frontend

Edit `app-config.js` before upload:

```js
window.FINANCIAL_TRACKER_CONFIG = {
  apiBaseUrl: "https://abc123.execute-api.eu-central-1.amazonaws.com",
  apiKey: "your-key"
};
```

## 4. Upload Static Files To S3

Create a private S3 bucket for the app, for example:

```text
financial-tracker-app-yourname
```

Upload:

```text
index.html
styles.css
app.js
app-config.js
manifest.webmanifest
sw.js
icon.svg
categories.csv
```

Do not upload local secrets.

## 5. Put CloudFront In Front

1. Open **CloudFront**.
2. Create distribution.
3. Origin: the S3 app bucket.
4. Enable Origin Access Control when prompted.
5. Default root object: `index.html`.
6. Viewer protocol policy: Redirect HTTP to HTTPS.
7. Create distribution.

Open the CloudFront URL on your iPhone Safari, then use **Share > Add to Home Screen**.

## Security Note

`APP_API_KEY` in a browser app is only light protection because the key is visible to the app. It is okay for a first private prototype, but the proper next step is Cognito login before exposing sensitive financial data long term.
