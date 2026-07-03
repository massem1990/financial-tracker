# AWS Database Setup

Use **Aurora PostgreSQL Serverless v2 with the RDS Data API** for the first version. This avoids putting Lambda inside a VPC and avoids packaging a PostgreSQL driver.

## 1. Create Aurora PostgreSQL

In the AWS Console:

1. Open **RDS**.
2. Click **Create database**.
3. Choose **Standard create**.
4. Engine: **Aurora PostgreSQL**.
5. Template: **Dev/Test**.
6. Capacity type: **Serverless v2**.
7. DB cluster identifier: `financial-tracker`.
8. Database name: `financial_tracker`.
9. Credentials: choose **Manage master credentials in AWS Secrets Manager**.
10. Enable **RDS Data API** / **Data API**.
11. Create database.

Save these values:

```text
DB_CLUSTER_ARN
DB_SECRET_ARN
DB_NAME=financial_tracker
```

You can find the cluster ARN on the RDS cluster page. The secret ARN is in Secrets Manager.

## 2. Create Tables

Open **RDS > Query editor** or **Query Editor v2**.

Connect with:

- Database: `financial_tracker`
- Secret: the generated master credential secret
- Cluster: `financial-tracker`

Run the SQL in:

```text
aws/schema.sql
```

## 3. Give Lambda Data API Permissions

Open the Lambda execution role and add an inline policy.

Replace the ARNs:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "rds-data:ExecuteStatement",
        "rds-data:BatchExecuteStatement"
      ],
      "Resource": "YOUR_DB_CLUSTER_ARN"
    },
    {
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": "YOUR_DB_SECRET_ARN"
    }
  ]
}
```

Keep the S3 `s3:PutObject` permission from the earlier setup.

## 4. Add Lambda Environment Variables

For database dry-run testing, keep GoCardless dry-run on:

```text
DRY_RUN=true
WRITE_DATABASE=true
DB_CLUSTER_ARN=...
DB_SECRET_ARN=...
DB_NAME=financial_tracker
S3_BUCKET=...
```

Run the Lambda test twice with the same event. The second run should not create duplicate transactions because the table has:

```sql
UNIQUE (provider, provider_transaction_key)
```

and the Lambda uses `ON CONFLICT ... DO UPDATE`.

## 5. Test Duplicate Protection

After two dry-run invocations, run this query:

```sql
SELECT provider, provider_transaction_key, count(*)
FROM transactions
GROUP BY provider, provider_transaction_key
HAVING count(*) > 1;
```

It should return zero rows.

Check total rows:

```sql
SELECT count(*) FROM transactions;
```

Dry run should stay at one transaction even after repeated invocations with the same date range.

## 6. Then Enable Real GoCardless

Only after S3 and database dry-run both work:

```text
DRY_RUN=false
WRITE_DATABASE=true
GOCARDLESS_SECRET_ID=...
GOCARDLESS_SECRET_KEY=...
GOCARDLESS_ACCOUNT_IDS=account-id-1,account-id-2
```

Start with a one-day live date range before enabling the daily schedule.
