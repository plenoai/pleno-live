/**
 * CORS allowlist の照合。
 * エントリは完全一致の origin か、`scheme://host:*` 形式 (ポート任意) を受け付ける。
 */
export function isAllowedOrigin(origin: string, allowlist: string[]): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  return allowlist.some((entry) => {
    if (!entry.endsWith(":*")) return entry === origin;
    const [protocol, host] = entry.slice(0, -2).split("//");
    return url.protocol === protocol && url.hostname === host;
  });
}
