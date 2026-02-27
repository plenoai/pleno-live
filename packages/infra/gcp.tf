# Google Cloud Infrastructure
#
# Vertex AI (aiplatform.googleapis.com) を使用することで、
# Google Cloud DPA (Data Processing Addendum) の適用対象となり、
# ユーザーデータがモデルの学習に使用されないことが保証される。
# 参照: https://cloud.google.com/terms/data-processing-addendum
#
# Google AI Studio (generativelanguage.googleapis.com) ではこの保証がないため、
# このプロジェクトでは Vertex AI を使用する。

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

# Vertex AI API を有効化
# generativelanguage.googleapis.com (AI Studio) ではなく
# aiplatform.googleapis.com (Vertex AI) を使うことで Cloud DPA が適用される
resource "google_project_service" "vertex_ai" {
  service            = "aiplatform.googleapis.com"
  disable_on_destroy = false
}

# Lambda から Vertex AI を呼び出すサービスアカウント
resource "google_service_account" "vertex_ai_caller" {
  account_id   = "pleno-live-vertex-ai"
  display_name = "pleno-live Vertex AI Caller"
  description  = "Lambda から Vertex AI を呼び出すための最小権限アカウント。Cloud DPA 適用済み。"

  depends_on = [google_project_service.vertex_ai]
}

# Vertex AI ユーザーロール (モデル推論のみ許可)
resource "google_project_iam_member" "vertex_ai_user" {
  project = var.gcp_project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.vertex_ai_caller.email}"
}

# サービスアカウントキー (Lambda の環境変数として使用)
resource "google_service_account_key" "vertex_ai_caller" {
  service_account_id = google_service_account.vertex_ai_caller.name
}

output "vertex_ai_service_account_email" {
  value       = google_service_account.vertex_ai_caller.email
  description = "Vertex AI caller service account email"
}

output "vertex_ai_credentials_base64" {
  value       = google_service_account_key.vertex_ai_caller.private_key
  sensitive   = true
  description = "Base64-encoded service account JSON. Set as GOOGLE_CREDENTIALS in Lambda env."
}
