# AWS GoCardless Sync Setup

This is the smallest AWS setup for a daily GoCardless transaction sync:

- Lambda runs the sync code.
- EventBridge Scheduler invokes Lambda daily.
- S3 stores raw JSON and normalized CSV outputs.

Start with `DRY_RUN=true`. Dry run does not call GoCardless, so it does not touch rate limits.

## 1. Create An S3 Bucket

In the AWS Console:

1. Open **S3**.
2. Create a bucket, for example `financial-tracker-sync-yourname`.
3. Keep **Block all public access** enabled.
4. Leave versioning off for now unless you want it.

## 2. Create The Lambda Function

In the AWS Console:

1. Open **Lambda**.
2. Create function.
3. Choose **Author from scratch**.
4. Function name: `financial-tracker-gocardless-sync`.
5. Runtime: **Python 3.12**.
6. Architecture: `x86_64`.
7. Create the function.

## 3. Upload The Lambda Code

From the project root:

```sh
cd "/Users/massem/Documents/Financial Tracker"
cd aws
zip lambda_gocardless_sync.zip lambda_gocardless_sync.py
```

In Lambda:

1. Open **Code**.
2. Choose **Upload from > .zip file**.
3. Upload `aws/lambda_gocardless_sync.zip`.
4. Set handler to:

```text
lambda_gocardless_sync.handler
```

## 4. Set Lambda Environment Variables

In Lambda **Configuration > Environment variables**, add:

```text
DRY_RUN=true
S3_BUCKET=financial-tracker-sync-yourname
```

Do not add GoCardless secrets yet.

## 5. Give Lambda Permission To Write S3

In Lambda **Configuration > Permissions**:

1. Click the execution role.
2. Add an inline policy.
3. Use this policy, replacing the bucket name:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": "arn:aws:s3:::financial-tracker-sync-yourname/*"
    }
  ]
}
```

## 6. Test Dry Run

In Lambda **Test**:

1. Create a test event.
2. Use `aws/test_event_dry_run.json`.
3. Run the test.

Expected result:

```json
{
  "ok": true,
  "dryRun": true,
  "transactionCount": 1
}
```

Then check S3. You should see:

```text
raw/gocardless/YYYY-MM-DD/...
exports/gocardless/YYYY-MM-DD/...
```

## 7. Only After Dry Run Works: Enable GoCardless

Add Lambda environment variables:

```text
DRY_RUN=false
GOCARDLESS_SECRET_ID=...
GOCARDLESS_SECRET_KEY=...
GOCARDLESS_ACCOUNT_IDS=account-id-1,account-id-2
```

Use account IDs from your local script:

```sh
python3 scripts/gocardless_bank.py status
```

Run a very small live test first:

```json
{
  "date_from": "2026-01-01",
  "date_to": "2026-01-02"
}
```

## 8. Create Daily EventBridge Schedule

In the AWS Console:

1. Open **Amazon EventBridge**.
2. Go to **Scheduler**.
3. Create schedule.
4. Recurring schedule.
5. Rate: `1 day`.
6. Target: your Lambda function.
7. Input JSON:

```json
{}
```

For live use, the Lambda defaults to the last 7 days, so reruns safely catch late-posted transactions.

## 9. Monitor

Check:

- Lambda **Monitor > CloudWatch logs**
- S3 object creation
- Lambda test output

Keep `DRY_RUN=true` until S3 writes work.

## 10. Add Database Writes

After the S3 dry-run works, follow:

```text
aws/AWS_DATABASE_SETUP.md
```
