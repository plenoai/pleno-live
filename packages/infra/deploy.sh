#!/bin/bash
set -e

AWS_REGION=${AWS_REGION:-ap-northeast-1}
PROJECT_NAME=${PROJECT_NAME:-pleno-live-api}
ENVIRONMENT=${ENVIRONMENT:-prod}
FUNCTION_NAME="${PROJECT_NAME}-${ENVIRONMENT}"

# Get AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${FUNCTION_NAME}"

echo "=== Building and deploying ${FUNCTION_NAME} ==="

# Login to ECR
echo "Logging into ECR..."
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

# Build Docker image from project root
echo "Building Docker image..."
cd "$(dirname "$0")/../.."
docker build --platform linux/amd64 -t ${FUNCTION_NAME} --load .

# Tag and push
echo "Pushing to ECR..."
docker tag ${FUNCTION_NAME}:latest ${ECR_REPO}:latest
docker push ${ECR_REPO}:latest

# Update Lambda function
echo "Updating Lambda function..."
aws lambda update-function-code \
    --function-name ${FUNCTION_NAME} \
    --image-uri ${ECR_REPO}:latest \
    --region ${AWS_REGION}

echo "=== Deployment complete ==="
echo "API Endpoint: $(cd infra && terraform output -raw api_endpoint 2>/dev/null || echo 'Run terraform apply first')"
