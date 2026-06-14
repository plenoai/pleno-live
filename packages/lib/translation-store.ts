/**
 * リアルタイム翻訳の状態を管理する純粋なストア
 *
 * Reactやネットワークから切り離し、翻訳結果・pending・error・キャッシュを
 * 一貫したルールで管理する。これにより単体テストが可能になり、
 * 「確定時に翻訳が消える」系の不具合を構造的に防ぐ。
 *
 * 安定化の核となるルール:
 * - **stale-while-revalidate**: テキストが変化して再翻訳する間も、
 *   既存の翻訳を保持・表示し続ける（pendingで上書きしない）。
 * - **no-op on unchanged**: 同一IDで同一テキストを再リクエストしても
 *   再翻訳しない（partial→committedで同テキストが再送されるケースのちらつき防止）。
 * - **text cache**: テキスト単位でキャッシュし、同一テキストは即時適用。
 * - **fail は翻訳を破壊しない**: 既存翻訳があればerrorで上書きしない。
 */

export interface TranslationItem {
  id: string;
  text: string;
}

export type TranslationStatus = "pending" | "completed" | "error";

export class TranslationStore {
  /** segmentId -> 翻訳結果 */
  private translations = new Map<string, string>();
  /** 翻訳待ちのsegmentId */
  private pending = new Set<string>();
  /** segmentId -> エラーメッセージ */
  private errors = new Map<string, string>();
  /** 原文テキスト -> 翻訳結果（再利用キャッシュ） */
  private cache = new Map<string, string>();
  /** segmentId -> 最後にリクエストした原文テキスト（変化検出用） */
  private idText = new Map<string, string>();

  /**
   * 翻訳リクエストを受け付け、実際にAPI送信が必要な項目のみを返す。
   * キャッシュヒット・テキスト未変化のものはここで解決され、戻り値から除外される。
   */
  request(items: TranslationItem[]): TranslationItem[] {
    const toSend: TranslationItem[] = [];

    for (const { id, text } of items) {
      if (!text.trim()) continue;

      const prevText = this.idText.get(id);
      const alreadyTranslated = this.translations.has(id);

      // 同一テキストを翻訳済みなら何もしない（ちらつき防止）
      if (alreadyTranslated && prevText === text) {
        continue;
      }

      this.idText.set(id, text);

      // テキストキャッシュヒット: 即時適用、API不要
      const cached = this.cache.get(text);
      if (cached !== undefined) {
        this.translations.set(id, cached);
        this.pending.delete(id);
        this.errors.delete(id);
        continue;
      }

      // 未キャッシュ: 既存翻訳は保持したままpendingにし、API送信対象に追加
      this.pending.add(id);
      this.errors.delete(id);
      toSend.push({ id, text });
    }

    return toSend;
  }

  /**
   * API結果を反映する。テキストキャッシュも更新する。
   */
  resolve(results: { id: string; translation: string }[]): void {
    for (const { id, translation } of results) {
      this.translations.set(id, translation);
      this.pending.delete(id);
      this.errors.delete(id);

      const text = this.idText.get(id);
      if (text !== undefined) {
        this.cache.set(text, translation);
      }
    }
  }

  /**
   * 翻訳失敗を反映する。既存翻訳があれば破壊せず維持する。
   */
  fail(ids: string[], message: string): void {
    for (const id of ids) {
      this.pending.delete(id);
      if (!this.translations.has(id)) {
        this.errors.set(id, message);
      }
    }
  }

  getTranslation(id: string): string | undefined {
    return this.translations.get(id);
  }

  /**
   * 表示ステータス。翻訳が存在する場合は再翻訳中でも completed を返し、
   * 既存翻訳を表示し続ける（消失防止）。
   */
  getStatus(id: string): TranslationStatus | undefined {
    if (this.translations.has(id)) return "completed";
    if (this.pending.has(id)) return "pending";
    if (this.errors.has(id)) return "error";
    return undefined;
  }

  clear(): void {
    this.translations.clear();
    this.pending.clear();
    this.errors.clear();
    this.cache.clear();
    this.idText.clear();
  }

  get isTranslating(): boolean {
    return this.pending.size > 0;
  }

  /** 現在の翻訳マップのスナップショット（読み取り専用用途） */
  snapshot(): Map<string, string> {
    return new Map(this.translations);
  }
}

/**
 * 複数の構成セグメントID（結合表示）に対する翻訳ビューを集約する。
 *
 * - 利用可能な翻訳は順に連結して表示する（一部未翻訳でも消さない）。
 * - 翻訳が1つでもあれば completed として表示を優先する。
 * - 翻訳が無くpendingがあれば pending、errorのみなら error。
 */
export function aggregateTranslationView(
  ids: string[],
  getTranslation: (id: string) => string | undefined,
  getStatus: (id: string) => TranslationStatus | undefined,
): { translation: string | undefined; status: TranslationStatus | undefined } {
  const parts = ids
    .map((id) => getTranslation(id))
    .filter((t): t is string => !!t);

  if (parts.length > 0) {
    return { translation: parts.join(" "), status: "completed" };
  }

  const statuses = ids.map((id) => getStatus(id));
  if (statuses.some((s) => s === "pending")) {
    return { translation: undefined, status: "pending" };
  }
  if (statuses.some((s) => s === "error")) {
    return { translation: undefined, status: "error" };
  }
  return { translation: undefined, status: undefined };
}
