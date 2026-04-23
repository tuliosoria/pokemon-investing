# Deploying PokéInvest to AWS Amplify

## Prerequisites
- AWS Account (ID: 825081952316)
- GitHub repo: `tuliosoria/pokemon-investing`
- AWS CLI is installed and configured with IAM user `amplify-deploy`

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
- Build command: `npm run build`
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

### Environment Variables
If you add Supabase, OpenAI, PriceCharting sync, etc. later:
1. Amplify Console → **Environment variables**
2. Add variables like:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `OPENAI_API_KEY`
   - `RESEND_API_KEY`
   - `PRICECHARTING_API_TOKEN`

### Syncing official PriceCharting sealed prices
The sealed pricing runtime can consume a synced PriceCharting snapshot artifact and
prefer those official prices over fallback sources. Generate or refresh that artifact with:

```bash
cd ~/Desktop/pokemon-investing
PRICECHARTING_API_TOKEN=<YOUR_TOKEN> npm run sync:pricecharting
```

If `DYNAMODB_TABLE` and AWS credentials are also configured, the same sync command will
best-effort persist provider-aware price snapshots and PriceCharting ID mappings into DynamoDB.

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
       PokeDataApiKey=<YOUR_POKEDATA_API_KEY> \
       ScheduleExpression='cron(0 5 1 * ? *)' \
     --region us-east-1
   ```
5. Optional smoke test:
   ```bash
   aws lambda invoke \
     --function-name pokealpha-sealed-ml-retrainer \
     --payload '{}' \
     /tmp/pokealpha-retrainer-response.json \
     --region us-east-1
   cat /tmp/pokealpha-retrainer-response.json
   ```

Each run captures any due 1-year / 3-year / 5-year outcomes from forecast lookups, retrains the
models, and publishes chunked model artifacts back into DynamoDB for the app to consume.

---

## Cost Estimate
AWS Amplify free tier includes:
- **1,000 build minutes/month**
- **15 GB served/month**
- **5 GB storage**

For a low-traffic MVP, this is effectively **free**.
