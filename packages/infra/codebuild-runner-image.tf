# ECR repository for custom CodeBuild runner image (Android SDK pre-installed)
resource "aws_ecr_repository" "runner" {
  name                 = "pleno-live-runner"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "runner" {
  repository = aws_ecr_repository.runner.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep only last 3 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 3
      }
      action = { type = "expire" }
    }]
  })
}

output "runner_ecr_repository_url" {
  value       = aws_ecr_repository.runner.repository_url
  description = "ECRリポジトリURL。docker build & push後にCodeBuildプロジェクトのimageに設定する"
}
