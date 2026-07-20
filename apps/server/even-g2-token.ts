import { generateRealtimeToken } from "./elevenlabs-realtime";

const WINDOW_MS = 60_000;
const REQUESTS_PER_WINDOW = 5;
const REQUESTS_PER_INSTANCE_WINDOW = 100;
const MAX_CLIENTS = 1_000;

type ClientWindow = {
  count: number;
  resetsAt: number;
};

export class EvenG2TokenRateLimiter {
  private readonly clients = new Map<string, ClientWindow>();
  private instanceWindow: ClientWindow = { count: 0, resetsAt: 0 };

  consume(clientId: string, now = Date.now()): boolean {
    if (this.instanceWindow.resetsAt <= now) {
      this.instanceWindow = { count: 0, resetsAt: now + WINDOW_MS };
    }

    const existing = this.clients.get(clientId);
    if (
      existing &&
      existing.resetsAt > now &&
      existing.count >= REQUESTS_PER_WINDOW
    ) {
      return false;
    }

    if (!existing || existing.resetsAt <= now) {
      this.trimExpired(now);
      if (!this.clients.has(clientId) && this.clients.size >= MAX_CLIENTS) {
        return false;
      }
    }

    if (this.instanceWindow.count >= REQUESTS_PER_INSTANCE_WINDOW) {
      return false;
    }

    if (!existing || existing.resetsAt <= now) {
      this.clients.set(clientId, { count: 1, resetsAt: now + WINDOW_MS });
    } else {
      existing.count += 1;
    }
    this.instanceWindow.count += 1;
    return true;
  }

  private trimExpired(now: number): void {
    for (const [clientId, window] of this.clients) {
      if (window.resetsAt <= now) {
        this.clients.delete(clientId);
      }
    }
  }
}

export type EvenG2TokenIssueResult =
  | { ok: true; token: string }
  | { ok: false; status: 429; error: string; retryAfterSeconds: number }
  | { ok: false; status: 502; error: string };

export async function issueEvenG2RealtimeToken(
  clientId: string,
  limiter: EvenG2TokenRateLimiter,
  tokenFactory: () => Promise<string> = generateRealtimeToken,
): Promise<EvenG2TokenIssueResult> {
  if (!limiter.consume(clientId)) {
    return {
      ok: false,
      status: 429,
      error: "Too many token requests",
      retryAfterSeconds: WINDOW_MS / 1_000,
    };
  }

  try {
    const token = await tokenFactory();
    if (typeof token !== "string" || token.length === 0) {
      throw new Error("Invalid realtime token");
    }
    return { ok: true, token };
  } catch {
    console.error("[Even G2] Realtime token request failed");
    return {
      ok: false,
      status: 502,
      error: "Transcription service unavailable",
    };
  }
}
