export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  // Vertex AI 認証 (Cloud DPA 適用 = 学習利用禁止)
  // base64 エンコードされたサービスアカウント JSON
  googleCredentials: process.env.GOOGLE_CREDENTIALS ?? "",
  gcpProjectId: process.env.GCP_PROJECT_ID ?? "",
  gcpRegion: process.env.GCP_REGION ?? "us-central1",
};
