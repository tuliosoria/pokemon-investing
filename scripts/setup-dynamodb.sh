#!/usr/bin/env bash
# Setup DynamoDB table for PokéInvest caching
# Usage: ./scripts/setup-dynamodb.sh [region] [table-name]
#
# Prerequisites:
#   - AWS CLI v2 installed and configured
#   - IAM permissions: dynamodb:CreateTable, dynamodb:UpdateTimeToLive, dynamodb:DescribeTable

set -euo pipefail

REGION="${1:-us-east-1}"
TABLE="${2:-pokeinvest-cache}"

echo "🗄️  Creating DynamoDB table: $TABLE in $REGION"
echo ""

# Create table with on-demand billing (pay-per-request, no capacity planning needed)
aws dynamodb create-table \
  --table-name "$TABLE" \
  --attribute-definitions \
    AttributeName=pk,AttributeType=S \
    AttributeName=sk,AttributeType=S \
  --key-schema \
    AttributeName=pk,KeyType=HASH \
    AttributeName=sk,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION" \
  --no-cli-pager

echo ""
echo "⏳ Waiting for table to become ACTIVE..."
aws dynamodb wait table-exists --table-name "$TABLE" --region "$REGION"

# Enable TTL for automatic cache expiration
echo "⏰ Enabling TTL on 'ttl' attribute..."
aws dynamodb update-time-to-live \
  --table-name "$TABLE" \
  --time-to-live-specification "Enabled=true,AttributeName=ttl" \
  --region "$REGION" \
  --no-cli-pager

echo ""
echo "✅ Table '$TABLE' is ready!"
echo ""
echo "Next steps:"
echo "  1. Add DYNAMODB_TABLE=$TABLE as an environment variable in Amplify Console"
echo "     (App settings → Environment variables)"
echo ""
echo "  2. Grant DynamoDB access to Amplify SSR compute role:"
echo "     - Go to IAM → Roles → search for 'amplify' and your app ID"
echo "     - Attach this inline policy:"
echo ""
cat <<POLICY
     {
       "Version": "2012-10-17",
       "Statement": [{
         "Effect": "Allow",
         "Action": [
           "dynamodb:GetItem",
           "dynamodb:PutItem",
           "dynamodb:DeleteItem",
           "dynamodb:Query"
         ],
         "Resource": "arn:aws:dynamodb:$REGION:*:table/$TABLE"
       }]
     }
POLICY
echo ""
