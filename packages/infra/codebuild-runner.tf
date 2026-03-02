# CodeBuild GitHub Actions Runner
# GitHub ProプランでもSelf-hosted runnerとして動作
# 実行時のみEC2課金（固定費なし）

variable "github_token" {
  type      = string
  sensitive = true
  description = "GitHub Personal Access Token (repo scope)"
}

variable "runner_project_name" {
  default = "pleno-live-runner"
}

# GitHub接続用のCodeBuild Credentials
resource "aws_codebuild_source_credential" "github" {
  auth_type   = "PERSONAL_ACCESS_TOKEN"
  server_type = "GITHUB"
  token       = var.github_token
}

# IAM Role for CodeBuild
resource "aws_iam_role" "codebuild_runner" {
  name = "${var.runner_project_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "codebuild.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "codebuild_runner" {
  name = "${var.runner_project_name}-policy"
  role = aws_iam_role.codebuild_runner.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${var.aws_region}:*:log-group:/aws/codebuild/${var.runner_project_name}*"
      },
      {
        # S3キャッシュ用（Gradleキャッシュをビルド間で共有）
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject"]
        Resource = "${aws_s3_bucket.codebuild_cache.arn}/*"
      },
      {
        # ECRからカスタムrunnerイメージをプル（リポジトリスコープ）
        Effect = "Allow"
        Action = [
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:BatchCheckLayerAvailability"
        ]
        Resource = aws_ecr_repository.runner.arn
      },
      {
        # GetAuthorizationTokenはリソースレベルの制限不可
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      }
    ]
  })
}

# Gradleキャッシュ用S3バケット
resource "aws_s3_bucket" "codebuild_cache" {
  bucket = "${var.runner_project_name}-cache"

  lifecycle {
    prevent_destroy = false
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "codebuild_cache" {
  bucket = aws_s3_bucket.codebuild_cache.id

  rule {
    id     = "expire-old-cache"
    status = "Enabled"
    filter {}
    expiration {
      days = 7
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# CodeBuild Runner Project
resource "aws_codebuild_project" "runner" {
  name          = var.runner_project_name
  description   = "GitHub Actions self-hosted runner for pleno-live APK builds"
  service_role  = aws_iam_role.codebuild_runner.arn

  # Runner project用の設定
  project_visibility = "PRIVATE"

  source {
    type            = "GITHUB"
    location        = "https://github.com/plenoai/pleno-live"
    git_clone_depth = 1

    # Runner projectはbuildspecをGitHub Actionsが制御するため空
    buildspec = ""
  }

  environment {
    type         = "LINUX_CONTAINER"
    # Android SDK焼き込み済みカスタムイメージ (ECR) - setup-androidステップ不要
    image        = "${aws_ecr_repository.runner.repository_url}:latest"
    # large: 4 vCPU / 7GB RAM ($0.01/min)
    compute_type = "BUILD_GENERAL1_LARGE"

    image_pull_credentials_type = "SERVICE_ROLE"
  }

  # Gradleキャッシュ
  cache {
    type     = "S3"
    location = "${aws_s3_bucket.codebuild_cache.bucket}/gradle"
  }

  artifacts {
    type = "NO_ARTIFACTS"
  }

  logs_config {
    cloudwatch_logs {
      group_name  = "/aws/codebuild/${var.runner_project_name}"
      stream_name = ""
      status      = "ENABLED"
    }
  }

  depends_on = [aws_codebuild_source_credential.github]
}

# Webhook はTerraform AWS providerが未対応のためAWS CLIで作成:
# aws codebuild create-webhook \
#   --project-name pleno-live-runner \
#   --build-type RUNNER \
#   --filter-groups "[[{\"type\":\"EVENT\",\"pattern\":\"WORKFLOW_JOB_QUEUED\"}]]"

output "runner_project_name" {
  value       = aws_codebuild_project.runner.name
  description = "GitHub ActionsのworkflowでのRUNS_ON値: codebuild-{this_value}-GITHUB_RUN_ID-GITHUB_RUN_ATTEMPT"
}

output "cache_bucket" {
  value = aws_s3_bucket.codebuild_cache.bucket
}
