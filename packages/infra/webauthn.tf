variable "webauthn_rp_id" {
  type        = string
  default     = "plenoai.com"
  description = "WebAuthn Relying Party ID (apex domain)"
}

variable "webauthn_rp_origins" {
  type        = string
  default     = "https://plenoai.com,https://app.plenoai.com"
  description = "Comma-separated list of allowed WebAuthn origins"
}

# DynamoDB table for WebAuthn credential storage
resource "aws_dynamodb_table" "webauthn_credentials" {
  name         = "pleno-live-webauthn-credentials"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    Purpose     = "WebAuthn credential storage"
  }
}

# IAM policy for Lambda to access DynamoDB
resource "aws_iam_policy" "lambda_dynamodb_webauthn" {
  name        = "${local.function_name}-dynamodb-webauthn"
  description = "Allow Lambda to access WebAuthn credentials DynamoDB table"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:UpdateItem",
      ]
      Resource = aws_dynamodb_table.webauthn_credentials.arn
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_dynamodb_webauthn" {
  role       = aws_iam_role.lambda.name
  policy_arn = aws_iam_policy.lambda_dynamodb_webauthn.arn
}
