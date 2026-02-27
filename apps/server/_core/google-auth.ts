/**
 * Google Cloud サービスアカウント認証
 *
 * jose (既存依存) を使って JWT を署名し、
 * Google OAuth2 トークンエンドポイントでアクセストークンに交換する。
 * トークンは 1 時間有効なのでメモリキャッシュする。
 */

import { importPKCS8, SignJWT } from "jose";
import { ENV } from "./env";

type TokenCache = {
  token: string;
  expiresAt: number; // unix seconds
};

let tokenCache: TokenCache | null = null;

export async function getGoogleAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.expiresAt > now + 60) {
    return tokenCache.token;
  }

  const credentials = JSON.parse(
    Buffer.from(ENV.googleCredentials, "base64").toString("utf-8"),
  ) as {
    client_email: string;
    private_key: string;
  };

  const privateKey = await importPKCS8(credentials.private_key, "RS256");

  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/cloud-platform",
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt(now)
    .setIssuer(credentials.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  tokenCache = {
    token: data.access_token,
    expiresAt: now + data.expires_in,
  };

  return data.access_token;
}
