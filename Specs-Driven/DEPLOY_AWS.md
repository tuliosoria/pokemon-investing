# Deploying PokéInvest to AWS Amplify

## Prerequisites
- AWS Account (ID: 825081952316)
- GitHub repo: `tuliosoria/pokemon-investing`
- AWS CLI is installed and configured with IAM user `amplify-deploy`

## Standard verification flow before `main`

This repo now uses one shared verification contract:

```bash
cd ~/Desktop/pokemon-investing
npm ci
npm run verify
```

What it covers today:
- `npm run lint`
- `npm run build`
- syntax validation for the committed Node/Python operational scripts

How that maps to automation:
- Install the repo-managed pre-push hook once per clone with `npm run hooks:install`.
- After hook install, git pushes will run `npm run verify` before leaving your machine.
- Amplify should run `npm run verify:app` during its build so deploys use the same lint/build contract that developers see locally.

If you change deployment, environment, hook, or infra files, update this runbook in the same change so the repo instructions and release path stay aligned.

---

## ⚠️ REQUIRED FIRST: Attach Permissions to IAM User

The `amplify-deploy` IAM user needs permissions before deployment will work.

1. Sign in to **https://825081952316.signin.aws.amazon.com/console** with your **root account** (not the amplify-deploy user)
2. Go to **https://console.aws.amazon.com/iam/** → **Users** → **amplify-deploy**
3. Click **Permissions** tab → **Add permissions** → **Attach policies directly**
4. Search and check **AdministratorAccess-Amplify**
5. Also search and check **AdministratorAccess** (Amplify needs to create IAM roles)
6. Click **Next** → **Add permissions**

Once done, either deploy via Console (Option A) or run this in terminal:
```bash
cd ~/Desktop/pokemon-investing
aws amplify create-app --name "pokemon-investing" --platform WEB_COMPUTE --region us-east-1
```

---

## Option A — Deploy via AWS Console (Easiest)

### Step 1: Open AWS Amplify
1. Go to **https://console.aws.amazon.com/amplify/**
2. Make sure you're in your preferred region (e.g. `us-east-1`)
3. Click **"Create new app"**

### Step 2: Connect GitHub
1. Select **GitHub** as the source provider
2. Click **"Authorize AWS Amplify"** when prompted
3. Select the repository **`tuliosoria/pokemon-investing`**
4. Select branch **`main`**
5. Click **Next**

### Step 3: Build Settings
Amplify will auto-detect the `amplify.yml` in the repo. Verify it shows:
- Framework: **Next.js**
- Build command: `npm run verify:app`
- Output directory: `.next`

Click **Next**

### Step 4: Review & Deploy
1. Review the settings
2. Click **"Save and deploy"**
3. Wait 2-3 minutes for the build to complete
4. You'll get a live URL like: `https://main.d1234abcdef.amplifyapp.com`

---

## Option B — Deploy via AWS CLI (Terminal)

### Step 1: Configure AWS Credentials
```bash
aws configure
```
Enter:
- **Access Key ID**: (from IAM)
- **Secret Access Key**: (from IAM)
- **Default region**: `us-east-1`
- **Output format**: `json`

If you don't have an access key:
1. Go to https://console.aws.amazon.com/iam/
2. Click **Users** → **Create user** (name: `amplify-deploy`)
3. Attach policy: **AdministratorAccess-Amplify**
4. **Security credentials** tab → **Create access key** → **CLI**
5. Copy the key pair

### Step 2: Create the Amplify App
```bash
cd ~/Desktop/pokemon-investing

aws amplify create-app \
  --name "pokemon-investing" \
  --repository "https://github.com/tuliosoria/pokemon-investing" \
  --platform WEB_COMPUTE \
  --region us-east-1
```

> Note: This requires a GitHub access token. Amplify will prompt for it, or you can generate one at https://github.com/settings/tokens with `repo` scope and pass it via `--access-token`.

### Step 3: Create the Branch
```bash
aws amplify create-branch \
  --app-id <APP_ID_FROM_STEP_2> \
  --branch-name main \
  --region us-east-1
```

### Step 4: Start the Deployment
```bash
aws amplify start-job \
  --app-id <APP_ID_FROM_STEP_2> \
  --branch-name main \
  --job-type RELEASE \
  --region us-east-1
```

### Step 5: Check Status
```bash
aws amplify get-branch \
  --app-id <APP_ID_FROM_STEP_2> \
  --branch-name main \
  --region us-east-1
```

---

## After Deployment

### Custom Domain (Optional)
1. In Amplify Console → **Domain management**
2. Click **"Add domain"**
3. Enter your domain name
4. Follow the DNS verification steps (add CNAME records)
5. SSL certificate is provisioned automatically

### Auto-Deploy on Push
Amplify automatically redeploys when you push to `main` — no extra setup needed.

Recommended release path:

1. Run `npm ci && npm run hooks:install` once per clone.
2. Run `npm run verify` locally for manual checks, or let the pre-push hook run it automatically on push.
3. Push to `main`.
4. Let Amplify rebuild from the merged branch using `npm run verify:app`.

### Environment Variables
Amplify now writes the server-side env file from a small allowlist during each build.
Use `.env.example` as the source of truth, then configure the same values in the
Amplify Console → **Environment variables**.

Recommended production values:

| Variable | Where used | Notes |
| --- | --- | --- |
| `AWS_REGION` | Amplify SSR + retrainer Lambda | Keep this aligned with DynamoDB and ECR. |
| `DYNAMODB_TABLE` | Amplify SSR + sync/retraining jobs | Enables cached pricing, lookup capture, and published model reads. |
| `POKEDATA_API_KEY` | Optional backfill/admin jobs | Only needed for one-time PokeData harvests or optional live population enrichment. |
| `PRICECHARTING_API_TOKEN` | Sync job / optional runtime lookups | Required for monthly PriceCharting ingestion. |
| `SEALED_ML_MODEL_SOURCE` | Amplify SSR | `auto` by default; set to `bundled` for rollback. |

For local ops, copy `.env.example` and fill in the same values before running scripts.

### Syncing official PriceCharting sealed prices
The sealed pricing runtime can consume a synced PriceCharting snapshot artifact and
prefer those official prices over fallback sources. Generate or refresh that artifact with:

```bash
cd ~/Desktop/pokemon-investing
npm run sync:pricecharting
```

If `POKEDATA_API_KEY` is also configured, the sync job will additionally write a
dual-provider monthly snapshot artifact at
`src/lib/data/sealed-ml/dual-provider-monthly-snapshots.json` so training can compare
official PriceCharting pricing against current PokeData market prices.

If `DYNAMODB_TABLE` and AWS credentials are also configured, the same sync command will
best-effort persist provider-aware price snapshots, PriceCharting ID mappings, and
normalized monthly training snapshots into DynamoDB.

Recommended monthly ingestion checklist:

1. Confirm `/api/health` reports `monthlyIngestion.priceChartingConfigured=true`
   and the expected Dynamo table/region. `monthlyIngestion.pokedataConfigured=true`
   is only needed if you are still capturing optional dual-provider snapshots.
2. Run `npm run sync:pricecharting`.
3. Review the generated artifacts under `src/lib/data/sealed-ml/`.
4. If DynamoDB is configured, spot-check a fresh `SEALED_TRAINING#... / SNAPSHOT#YYYY-MM`
   item before retraining.

### Monthly Sealed ML Retraining
The sealed forecast runtime now checks DynamoDB for published XGBoost model artifacts before
falling back to the bundled JSON files in the repo. To keep those models fresh, deploy the
monthly retraining Lambda in `infra/sealed-ml-retrainer/`.

1. Create an ECR repository:
   ```bash
   aws ecr create-repository \
     --repository-name pokealpha-sealed-ml-retrainer \
     --region us-east-1
   ```
2. Authenticate Docker to ECR:
   ```bash
   aws ecr get-login-password --region us-east-1 | \
     docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com
   ```
3. Build and push the retrainer image:
   ```bash
   cd ~/Desktop/pokemon-investing
   docker build -t pokealpha-sealed-ml-retrainer -f infra/sealed-ml-retrainer/Dockerfile .
   docker tag pokealpha-sealed-ml-retrainer:latest \
     <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/pokealpha-sealed-ml-retrainer:latest
   docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/pokealpha-sealed-ml-retrainer:latest
   ```
4. Deploy the EventBridge-scheduled Lambda stack:
   ```bash
   aws cloudformation deploy \
     --template-file infra/sealed-ml-retrainer/template.yaml \
     --stack-name pokealpha-sealed-ml-retrainer \
     --capabilities CAPABILITY_NAMED_IAM \
      --parameter-overrides \
        RetrainerImageUri=<ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/pokealpha-sealed-ml-retrainer:latest \
        DynamoDbTableName=<YOUR_DYNAMODB_TABLE> \
        PokeDataApiKey=<YOUR_POKEDATA_API_KEY_OR_EMPTY_STRING> \
        PublishEnabled=true \
        LogRetentionInDays=30 \
        ScheduleExpression='cron(0 5 1 * ? *)' \
      --region us-east-1
    ```
5. Optional smoke test:
    ```bash
    aws lambda invoke \
      --function-name pokealpha-sealed-ml-retrainer \
      --payload '{}' \
      retrainer-response.json \
      --region us-east-1
    cat retrainer-response.json
    ```
6. Review the Lambda response for:
   - `deploymentApproved`
   - `publishEnabled`
   - `publishedToDynamo`
   - `publishSkippedReason`
   - `capturedTargets`
   - `lookupRows`

Each run captures any due 1-year / 3-year / 5-year outcomes from preserved
`SEALED_TRAINING#... / SNAPSHOT#YYYY-MM` history (falling back to stored
PriceCharting-backed product snapshots when available), retrains the models, and
publishes chunked model artifacts back into DynamoDB for the app to consume.

You can also run the same logic locally with:

```bash
cd ~/Desktop/pokemon-investing
python3 -m pip install -r requirements-ml.txt
npm run retrain:sealed-ml
```

Set `SEALED_ML_PUBLISH_ENABLED=false` to rehearse a monthly run, capture any resolvable stored
outcomes, and inspect the training summary without publishing new model chunks into DynamoDB.

### Observability

- **Application health:** `GET /api/health`
  - shows DynamoDB wiring, ingestion provider readiness, model source preference, active model
    source, bundled fallback metadata, and published Dynamo model metadata when available
- **Retrainer logs:** CloudWatch log group `/aws/lambda/pokealpha-sealed-ml-retrainer`
- **Published model summary:** DynamoDB item
  `pk=SEALED_MODEL#sealed-forecast, sk=MODEL#SUMMARY`
- **Published model chunks:** DynamoDB items
  `pk=SEALED_MODEL#sealed-forecast, sk=MODEL#<horizon>#CHUNK#....`

### Rollback Runbook

If a monthly publish regresses forecast quality or you need to freeze model changes:

1. In Amplify Console, set `SEALED_ML_MODEL_SOURCE=bundled`.
2. Trigger a redeploy and wait for `/api/health` to report:
   - `sealedMl.preferredSource = "bundled"`
   - `sealedMl.effectiveSource = "bundled"`
3. In the retrainer CloudFormation stack, set `PublishEnabled=false` to stop the scheduled
   Lambda from replacing DynamoDB model artifacts while the incident is investigated.
4. Review the latest `MODEL#SUMMARY` payload and CloudWatch logs.
5. After validation, switch Amplify back to `SEALED_ML_MODEL_SOURCE=auto`, restore
   `PublishEnabled=true`, and rerun the smoke test.

---

## Cost Estimate
AWS Amplify free tier includes:
- **1,000 build minutes/month**
- **15 GB served/month**
- **5 GB storage**

For a low-traffic MVP, this is effectively **free**.
