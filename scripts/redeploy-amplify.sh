#!/usr/bin/env bash
# Manually trigger an Amplify rebuild of the `main` branch.
# Use this when GitHub pushes don't auto-deploy (broken webhook).
#
# Prereqs:
#   - AWS CLI installed (brew install awscli)
#   - Credentials configured (one of):
#       aws configure              # access key + secret
#       aws sso login --profile X  # SSO
#       AWS_PROFILE=X bash redeploy-amplify.sh
#
# Required IAM permission: amplify:StartJob on the app.

set -euo pipefail

APP_ID="${AMPLIFY_APP_ID:-d16gvb6c6e6eir}"
BRANCH="${AMPLIFY_BRANCH:-main}"
REGION="${AWS_REGION:-us-east-1}"

if [[ -z "$APP_ID" || -z "$BRANCH" || -z "$REGION" ]]; then
  echo "❌ APP_ID, BRANCH, and REGION must all be non-empty." >&2
  echo "   Got: APP_ID='$APP_ID' BRANCH='$BRANCH' REGION='$REGION'" >&2
  exit 1
fi

echo "→ Checking AWS identity…"
aws sts get-caller-identity --output table

echo "→ Inspecting app ${APP_ID} in ${REGION}…"
aws amplify get-branch --app-id "$APP_ID" --branch-name "$BRANCH" --region "$REGION" \
  --query 'branch.{stage:stage,enableAutoBuild:enableAutoBuild,activeJobId:activeJobId}' \
  --output table

echo "→ Triggering RELEASE job on ${BRANCH}…"
JOB_ID=$(aws amplify start-job \
  --app-id "$APP_ID" \
  --branch-name "$BRANCH" \
  --job-type RELEASE \
  --region "$REGION" \
  --query 'jobSummary.jobId' --output text)

echo "→ Job started: ${JOB_ID}"
echo "→ Watching status (Ctrl+C to stop polling — build still runs)…"
while true; do
  STATUS=$(aws amplify get-job --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB_ID" \
    --region "$REGION" --query 'job.summary.status' --output text)
  printf '   [%s] %s\n' "$(date +%H:%M:%S)" "$STATUS"
  case "$STATUS" in
    SUCCEED) echo "✅ Deploy complete."; break ;;
    FAILED|CANCELLED) echo "❌ Deploy $STATUS — check console."; exit 1 ;;
  esac
  sleep 15
done

echo "→ Smoke-testing live forecast endpoint (returns 200 + non-trivial ROI)…"
echo "  Note: this is a smoke test — community-score factors are loaded server-side"
echo "  from the catalogue, so we send minimal client factors here."
sleep 10
curl -s -X POST "https://main.${APP_ID}.amplifyapp.com/api/sealed/forecast" \
  -H "content-type: application/json" \
  -d '{"sets":[{"id":"x","name":"Destined Rivals Booster Box","productType":"Booster Box","releaseYear":2025,"currentPrice":560.99,"gradient":["#000","#fff"],"factors":{"marketValue":75,"chaseCardIndex":82,"printRun":50,"setAge":50,"priceTrajectory":50,"popularity":77,"marketCycle":55,"demandRatio":91,"liquidityTier":"high","expectedChaseValue":null,"chaseEvRatio":null,"setSinglesValue":null,"setSinglesValueRatio":null},"chaseCards":[],"printRunLabel":"Standard","notes":""}]}' \
  | python3 -c "import json,sys; f=json.load(sys.stdin)['results'][0]['forecast']; print(f'  ROI: {f[\"roiPercent\"]}%  signal: {f[\"signal\"]}  5y: \${f[\"horizonPredictions\"][\"fiveYear\"]}  cs: {f.get(\"compositeScore\")}')"
