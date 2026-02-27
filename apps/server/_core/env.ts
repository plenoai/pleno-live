export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
};
