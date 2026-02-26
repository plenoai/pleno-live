import { describe, it, expect } from "vitest";

// getNestedValue のロジックをホワイトボックステスト
// any型や型崩れが入り込まないことを型レベルで保証するため直接実装をテスト
function getNestedValue(
  obj: Record<string, unknown>,
  path: string,
  defaultValue: string = path
): string {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (typeof current === "object" && current !== null && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return defaultValue;
    }
  }

  return typeof current === "string" ? current : defaultValue;
}

describe("getNestedValue", () => {
  it("フラットなキーを取得できる", () => {
    expect(getNestedValue({ title: "タイトル" }, "title")).toBe("タイトル");
  });

  it("ネストされたキーをドット記法で取得できる", () => {
    const obj = { settings: { title: "設定" } };
    expect(getNestedValue(obj, "settings.title")).toBe("設定");
  });

  it("3階層のネストに対応する", () => {
    const obj = { a: { b: { c: "深い値" } } };
    expect(getNestedValue(obj, "a.b.c")).toBe("深い値");
  });

  it("キーが存在しない場合はデフォルト値（パス文字列）を返す", () => {
    expect(getNestedValue({}, "missing.key")).toBe("missing.key");
  });

  it("カスタムデフォルト値を返せる", () => {
    expect(getNestedValue({}, "missing", "fallback")).toBe("fallback");
  });

  it("中間キーが存在しない場合はデフォルト値を返す", () => {
    const obj = { settings: {} };
    expect(getNestedValue(obj, "settings.missing")).toBe("settings.missing");
  });

  it("値が文字列でない場合はデフォルト値を返す", () => {
    const obj = { count: 42 } as Record<string, unknown>;
    expect(getNestedValue(obj, "count")).toBe("count");
  });

  it("値がnullの場合はデフォルト値を返す", () => {
    const obj = { key: null } as Record<string, unknown>;
    expect(getNestedValue(obj, "key")).toBe("key");
  });
});
