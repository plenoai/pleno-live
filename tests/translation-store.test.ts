import { describe, it, expect } from "vitest";
import {
  TranslationStore,
  aggregateTranslationView,
} from "../packages/lib/translation-store";

describe("TranslationStore", () => {
  it("未キャッシュのリクエストはAPI対象として返しpendingにする", () => {
    const store = new TranslationStore();
    const toSend = store.request([{ id: "1", text: "こんにちは" }]);

    expect(toSend).toEqual([{ id: "1", text: "こんにちは" }]);
    expect(store.getStatus("1")).toBe("pending");
  });

  it("resolveで翻訳を確定しpendingを解除、テキストでキャッシュする", () => {
    const store = new TranslationStore();
    store.request([{ id: "1", text: "こんにちは" }]);
    store.resolve([{ id: "1", translation: "Hello" }]);

    expect(store.getTranslation("1")).toBe("Hello");
    expect(store.getStatus("1")).toBe("completed");

    // 同じテキストの別IDはキャッシュヒットで即時適用（API不要）
    const toSend = store.request([{ id: "2", text: "こんにちは" }]);
    expect(toSend).toEqual([]);
    expect(store.getTranslation("2")).toBe("Hello");
    expect(store.getStatus("2")).toBe("completed");
  });

  it("同一IDで同一テキストを再リクエストしても再翻訳しない（確定時のちらつき防止）", () => {
    const store = new TranslationStore();
    store.request([{ id: "1", text: "こんにちは" }]);
    store.resolve([{ id: "1", translation: "Hello" }]);

    // committed が partial と同じテキストで再度来るケース
    const toSend = store.request([{ id: "1", text: "こんにちは" }]);
    expect(toSend).toEqual([]);
    expect(store.getStatus("1")).toBe("completed");
    expect(store.getTranslation("1")).toBe("Hello");
  });

  it("テキスト変更時も既存翻訳を保持し表示し続ける（stale-while-revalidate）", () => {
    const store = new TranslationStore();
    store.request([{ id: "1", text: "こんにちは" }]);
    store.resolve([{ id: "1", translation: "Hello" }]);

    // partial から committed でテキストが変化
    const toSend = store.request([{ id: "1", text: "こんにちは。" }]);
    expect(toSend).toEqual([{ id: "1", text: "こんにちは。" }]);

    // 再翻訳中も古い翻訳が消えない（statusはpendingにならない）
    expect(store.getTranslation("1")).toBe("Hello");
    expect(store.getStatus("1")).toBe("completed");

    store.resolve([{ id: "1", translation: "Hello." }]);
    expect(store.getTranslation("1")).toBe("Hello.");
  });

  it("翻訳が無いIDのpendingはpendingを返す", () => {
    const store = new TranslationStore();
    store.request([{ id: "1", text: "こんにちは" }]);
    expect(store.getStatus("1")).toBe("pending");
    expect(store.getTranslation("1")).toBeUndefined();
  });

  it("failは既存翻訳が無い場合のみerrorにする", () => {
    const store = new TranslationStore();
    store.request([{ id: "1", text: "A" }]);
    store.fail(["1"], "boom");
    expect(store.getStatus("1")).toBe("error");

    // 既に翻訳がある場合はerrorで上書きせず翻訳を維持
    store.request([{ id: "1", text: "A2" }]);
    store.resolve([{ id: "1", translation: "good" }]);
    store.request([{ id: "1", text: "A3" }]);
    store.fail(["1"], "boom2");
    expect(store.getStatus("1")).toBe("completed");
    expect(store.getTranslation("1")).toBe("good");
  });

  it("空白のみのテキストはリクエストしない", () => {
    const store = new TranslationStore();
    const toSend = store.request([{ id: "1", text: "   " }]);
    expect(toSend).toEqual([]);
    expect(store.getStatus("1")).toBeUndefined();
  });

  it("clearで全状態をリセットする", () => {
    const store = new TranslationStore();
    store.request([{ id: "1", text: "A" }]);
    store.resolve([{ id: "1", translation: "B" }]);
    store.clear();
    expect(store.getTranslation("1")).toBeUndefined();
    expect(store.getStatus("1")).toBeUndefined();
    // キャッシュもクリアされる
    const toSend = store.request([{ id: "2", text: "A" }]);
    expect(toSend).toEqual([{ id: "2", text: "A" }]);
  });

  it("isTranslatingはpendingが存在する間true", () => {
    const store = new TranslationStore();
    expect(store.isTranslating).toBe(false);
    store.request([{ id: "1", text: "A" }]);
    expect(store.isTranslating).toBe(true);
    store.resolve([{ id: "1", translation: "B" }]);
    expect(store.isTranslating).toBe(false);
  });
});

describe("aggregateTranslationView", () => {
  const getTranslation = (map: Record<string, string | undefined>) => (id: string) =>
    map[id];
  const getStatus =
    (map: Record<string, string | undefined>) =>
    (id: string): "pending" | "completed" | "error" | undefined => {
      if (map[id]) return "completed";
      return undefined;
    };

  it("全IDが翻訳済みなら結合してcompletedを返す", () => {
    const t = getTranslation({ a: "Hello", b: "World" });
    const s = getStatus({ a: "Hello", b: "World" });
    const view = aggregateTranslationView(["a", "b"], t, s);
    expect(view.translation).toBe("Hello World");
    expect(view.status).toBe("completed");
  });

  it("一部だけ翻訳済みなら利用可能分を結合して表示しcompletedにする（消失防止）", () => {
    const map = { a: "Hello", b: undefined };
    const t = getTranslation(map);
    const s = (id: string): "pending" | "completed" | "error" | undefined =>
      id === "a" ? "completed" : "pending";
    const view = aggregateTranslationView(["a", "b"], t, s);
    expect(view.translation).toBe("Hello");
    expect(view.status).toBe("completed");
  });

  it("どれも未翻訳でpendingがあればpendingを返す", () => {
    const t = getTranslation({});
    const s = (): "pending" => "pending";
    const view = aggregateTranslationView(["a", "b"], t, s);
    expect(view.translation).toBeUndefined();
    expect(view.status).toBe("pending");
  });

  it("未翻訳でerrorのみならerrorを返す", () => {
    const t = getTranslation({});
    const s = (): "error" => "error";
    const view = aggregateTranslationView(["a"], t, s);
    expect(view.translation).toBeUndefined();
    expect(view.status).toBe("error");
  });
});
