import { describe, expect, it } from "vitest";
import { isAllowedOrigin } from "./cors";

const allowlist = ["https://plenoai.com", "http://localhost:*"];

describe("isAllowedOrigin", () => {
  it("完全一致を許可する", () => {
    expect(isAllowedOrigin("https://plenoai.com", allowlist)).toBe(true);
  });

  it("ポートワイルドカードは任意ポートと無ポートを許可する", () => {
    expect(isAllowedOrigin("http://localhost:8082", allowlist)).toBe(true);
    expect(isAllowedOrigin("http://localhost", allowlist)).toBe(true);
  });

  it("scheme や host が異なる origin を拒否する", () => {
    expect(isAllowedOrigin("https://localhost:8082", allowlist)).toBe(false);
    expect(isAllowedOrigin("http://localhost.evil.com:80", allowlist)).toBe(
      false,
    );
    expect(isAllowedOrigin("https://plenoai.com.evil.com", allowlist)).toBe(
      false,
    );
  });

  it("不正な origin を拒否する", () => {
    expect(isAllowedOrigin("null", allowlist)).toBe(false);
  });
});
