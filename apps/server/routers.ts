import { z } from "zod";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { signSessionToken } from "./_core/auth";
import { createChallenge, verifyClientResponse } from "./attestation";
import { invokeLLM, type Message } from "./_core/llm";
import {
  transcribeAudio,
  transcribeAudioFromUrl,
  formatTranscriptionWithSpeakers,
  type TranscriptionOptions
} from "./elevenlabs";
import { transcribeAudioWithGemini } from "./gemini";
import { generateRealtimeToken } from "./elevenlabs-realtime";

const authRouter = router({
  createChallenge: publicProcedure.mutation(async () => {
    console.log("[Auth] createChallenge called");
    const { nonce, challengeToken } = await createChallenge();
    console.log("[Auth] createChallenge success");
    return { nonce, challengeToken };
  }),

  verifyAttestation: publicProcedure
    .input(z.object({
      responseHash: z.string(),
      challengeToken: z.string(),
      platform: z.string(),
      deviceId: z.string(),
    }))
    .mutation(async ({ input }) => {
      console.log("[Auth] verifyAttestation called", { platform: input.platform, deviceId: input.deviceId });
      const result = await verifyClientResponse(input.challengeToken, input.responseHash);
      if (!result.ok) {
        console.error("[Auth] verifyAttestation failed", { error: result.error, platform: input.platform });
        return { success: false as const, error: result.error, sessionToken: null, expiresAt: 0 };
      }

      const sessionToken = await signSessionToken({
        deviceId: input.deviceId,
        platform: input.platform,
      });

      const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour

      console.log("[Auth] verifyAttestation success", { platform: input.platform });
      return { success: true as const, sessionToken, expiresAt };
    }),
});

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,

  ai: router({
    // Transcription endpoint supporting both ElevenLabs and Gemini
    transcribe: protectedProcedure
      .input(z.object({
        audioUrl: z.string().optional(),
        audioBase64: z.string().optional(),
        filename: z.string().default("recording.m4a"),
        languageCode: z.string().optional(),
        diarize: z.boolean().default(true),
        numSpeakers: z.number().min(1).max(32).optional(),
        provider: z.enum(["elevenlabs", "gemini"]).default("elevenlabs"),
      }))
      .mutation(async ({ input }) => {
        console.log("[TRPC] transcribe mutation called, provider:", input.provider);

        try {
          // Gemini provider
          if (input.provider === "gemini") {
            if (!input.audioBase64) {
              throw new Error("Gemini文字起こしにはaudioBase64が必要です");
            }

            const mimeType = input.filename.endsWith(".webm")
              ? "audio/webm"
              : input.filename.endsWith(".m4a")
              ? "audio/mp4"
              : "audio/mpeg";

            const result = await transcribeAudioWithGemini(input.audioBase64, {
              languageCode: input.languageCode,
              mimeType,
            });

            return {
              text: result.text,
              rawText: result.text,
              languageCode: result.languageCode,
              provider: "gemini",
            };
          }

          // ElevenLabs provider (default)
          const options: TranscriptionOptions = {
            languageCode: input.languageCode,
            diarize: input.diarize,
            numSpeakers: input.numSpeakers,
            tagAudioEvents: true,
          };

          let result;

          // If base64 audio is provided, use it directly
          if (input.audioBase64) {
            // base64はバイナリの約1.37倍サイズになるため、100MBバイナリ相当で制限
            const MAX_BASE64_LENGTH = 100 * 1024 * 1024 * 1.37;
            if (input.audioBase64.length > MAX_BASE64_LENGTH) {
              throw new Error("音声ファイルが大きすぎます（上限100MB）");
            }
            const audioBuffer = Buffer.from(input.audioBase64, "base64");
            result = await transcribeAudio(audioBuffer, input.filename, options);
          }
          // If URL is provided and it's a valid HTTPS URL, use cloud_storage_url
          else if (input.audioUrl && input.audioUrl.startsWith("https://")) {
            result = await transcribeAudioFromUrl(input.audioUrl, options);
          }
          // Local file:// URIs cannot be processed
          else if (input.audioUrl && (input.audioUrl.startsWith("file://") || !input.audioUrl.startsWith("http"))) {
            return {
              text: "【ElevenLabs文字起こし】\n\nローカルファイルを文字起こしするには、音声データをBase64形式で送信してください。\n\n録音ファイル: " + (input.audioUrl?.split("/").pop() || "unknown"),
              isPlaceholder: true,
              words: [],
              languageCode: "",
              provider: "elevenlabs",
            };
          }
          else {
            throw new Error("audioBase64 または有効なHTTPS URLが必要です");
          }

          // Format transcription with speaker labels if diarization was enabled
          const formattedText = input.diarize
            ? formatTranscriptionWithSpeakers(result)
            : result.text;

          return {
            text: formattedText,
            rawText: result.text,
            words: result.words,
            languageCode: result.language_code,
            languageProbability: result.language_probability,
            provider: "elevenlabs",
          };
        } catch (error) {
          console.error("Transcription error:", error);
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          throw new Error(`文字起こしに失敗しました: ${errorMessage}`);
        }
      }),

    // Chat/Summary endpoint
    chat: protectedProcedure
      .input(z.object({
        message: z.string(),
        context: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const messages: Message[] = [
          {
            role: "system",
            content: "あなたは会議や録音の内容を分析する専門家です。ユーザーの質問に対して、提供されたコンテキストに基づいて正確に回答してください。",
          },
        ];

        if (input.context) {
          messages.push({
            role: "user",
            content: `コンテキスト:\n${input.context}`,
          });
        }

        messages.push({
          role: "user",
          content: input.message,
        });

        const result = await invokeLLM({
          messages,
          maxTokens: 2000,
        });

        const content = result.choices[0]?.message?.content;
        const text = typeof content === "string" ? content : "";

        return { message: text };
      }),

    // Unified analysis endpoint: summary + tags + actionItems + keywords + sentiment
    analyze: protectedProcedure
      .input(z.object({
        text: z.string(),
        template: z.enum(["general", "meeting", "interview", "lecture"]).default("general"),
        maxTags: z.number().default(5),
        maxActionItems: z.number().default(10),
        maxKeywords: z.number().default(10),
      }))
      .mutation(async ({ input }) => {
        const templateHints: Record<string, string> = {
          general: "汎用的な分析を行ってください。",
          meeting: "会議の文脈で分析してください。議題・決定事項・次のステップに注目してください。",
          interview: "インタビューの文脈で分析してください。主要トピック・重要発言・結論に注目してください。",
          lecture: "講義の文脈で分析してください。主要概念・学習ポイントに注目してください。",
        };

        const prompt = `以下のテキストを総合的に分析してください。${templateHints[input.template]}

テキスト:
${input.text}

以下のJSON形式で出力してください（JSON以外のテキストは出力しないでください）:
{
  "overview": "テキスト全体の概要（1-2文）",
  "keyPoints": ["重要ポイント1", "重要ポイント2", "重要ポイント3"],
  "tags": [{"name": "タグ名", "confidence": 0.95}],
  "actionItems": [{"text": "タスク内容", "priority": "high|medium|low", "confidence": 0.9}],
  "keywords": [{"text": "キーワード", "importance": "high|medium|low", "confidence": 0.9, "frequency": 2}],
  "sentiment": {
    "score": 0.5,
    "confidence": 0.9,
    "emotions": {"joy": 0.3, "sadness": 0.1, "anger": 0.05, "fear": 0.1, "surprise": 0.2, "disgust": 0.05},
    "summary": "感情的なトーンの簡潔な説明"
  }
}

制約:
- tags: 最大${input.maxTags}個
- actionItems: 最大${input.maxActionItems}個
- keywords: 最大${input.maxKeywords}個
- 必ず有効なJSONオブジェクトのみを返してください`;

        const result = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "あなたはテキスト分析の専門家です。与えられたテキストを多角的に分析し、構造化されたJSON形式で結果を返します。",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          maxTokens: 3000,
        });

        const content = result.choices[0]?.message?.content;
        if (!content) {
          throw new Error("LLMから応答が得られません");
        }

        const contentStr = Array.isArray(content)
          ? content.map(c => {
              if (typeof c === 'string') return c;
              if ('text' in c && typeof c.text === 'string') return c.text;
              return '';
            }).join('')
          : String(content);
        const jsonMatch = contentStr.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : contentStr;
        const raw = JSON.parse(jsonStr);
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
          throw new Error("LLMが不正なJSONを返しました");
        }
        const parsed = raw as Record<string, unknown>;

        // overview & keyPoints
        const overview = String(parsed.overview || "").trim();
        const keyPoints = Array.isArray(parsed.keyPoints)
          ? parsed.keyPoints.map((p: unknown) => String(p).trim()).filter(Boolean)
          : [];

        // tags
        const rawTags = Array.isArray(parsed.tags) ? parsed.tags : [];
        const tags = rawTags
          .map((tag: any) => ({
            id: Date.now().toString() + Math.random(),
            name: String(tag.name || "").trim(),
            isAutoGenerated: true,
            confidence: Math.min(1, Math.max(0, Number(tag.confidence) || 0.5)),
          }))
          .filter((t: any) => t.name.length > 0)
          .slice(0, input.maxTags);

        // actionItems
        const rawItems = Array.isArray(parsed.actionItems) ? parsed.actionItems : [];
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        const actionItems = rawItems
          .map((item: any) => ({
            id: Date.now().toString() + Math.random(),
            text: String(item.text || "").trim(),
            priority: ['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium',
            completed: false,
            isAutoGenerated: true,
            confidence: Math.min(1, Math.max(0, Number(item.confidence) || 0.5)),
          }))
          .filter((i: any) => i.text.length > 0)
          .sort((a: any, b: any) => {
            const diff = priorityOrder[a.priority as keyof typeof priorityOrder] - priorityOrder[b.priority as keyof typeof priorityOrder];
            if (diff !== 0) return diff;
            return (b.confidence || 0) - (a.confidence || 0);
          })
          .slice(0, input.maxActionItems);

        // keywords
        const rawKeywords = Array.isArray(parsed.keywords) ? parsed.keywords : [];
        const importanceOrder = { high: 0, medium: 1, low: 2 };
        const keywords = rawKeywords
          .map((kw: any, i: number) => ({
            id: Date.now().toString() + i,
            text: String(kw.text || "").trim(),
            importance: ['high', 'medium', 'low'].includes(kw.importance) ? kw.importance : 'medium',
            confidence: Math.min(1, Math.max(0, Number(kw.confidence) || 0.5)),
            frequency: Math.max(1, Number(kw.frequency) || 1),
            startIndex: input.text.toLowerCase().indexOf((kw.text || "").toLowerCase()),
          }))
          .filter((k: any) => k.text.length > 0 && k.startIndex >= 0)
          .sort((a: any, b: any) => {
            const diff = importanceOrder[a.importance as keyof typeof importanceOrder] - importanceOrder[b.importance as keyof typeof importanceOrder];
            if (diff !== 0) return diff;
            return (b.confidence || 0) - (a.confidence || 0);
          })
          .slice(0, input.maxKeywords);

        // sentiment
        const rawSentiment = typeof parsed.sentiment === 'object' && parsed.sentiment !== null
          ? parsed.sentiment as Record<string, unknown>
          : {};
        const score = Math.min(1, Math.max(-1, Number(rawSentiment.score) || 0));
        const confidence = Math.min(1, Math.max(0, Number(rawSentiment.confidence) || 0.5));
        let overallSentiment: 'positive' | 'neutral' | 'negative';
        if (score > 0.1) overallSentiment = 'positive';
        else if (score < -0.1) overallSentiment = 'negative';
        else overallSentiment = 'neutral';

        const emotionsData: Record<string, unknown> = typeof rawSentiment.emotions === 'object' && rawSentiment.emotions !== null
          ? rawSentiment.emotions as Record<string, unknown>
          : {};
        const sentiment = {
          overallSentiment,
          score,
          confidence,
          emotions: {
            joy: Math.min(1, Math.max(0, Number(emotionsData.joy) || 0)),
            sadness: Math.min(1, Math.max(0, Number(emotionsData.sadness) || 0)),
            anger: Math.min(1, Math.max(0, Number(emotionsData.anger) || 0)),
            fear: Math.min(1, Math.max(0, Number(emotionsData.fear) || 0)),
            surprise: Math.min(1, Math.max(0, Number(emotionsData.surprise) || 0)),
            disgust: Math.min(1, Math.max(0, Number(emotionsData.disgust) || 0)),
          },
          summary: String(rawSentiment.summary || "").trim(),
          processedAt: new Date(),
        };

        return {
          overview,
          keyPoints,
          tags,
          actionItems,
          keywords,
          sentiment,
        };
      }),

    // Q&A endpoint
    askQuestion: protectedProcedure
      .input(z.object({
        question: z.string(),
        transcriptText: z.string(),
        previousQA: z.array(z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
        })).optional(),
      }))
      .mutation(async ({ input }) => {
        const messages: Message[] = [
          {
            role: "system",
            content: `あなたは録音内容に関する質問に答えるアシスタントです。以下の文字起こしテキストに基づいて、ユーザーの質問に正確に答えてください。回答は文字起こしの内容に基づいている必要があります。

文字起こしテキスト:
${input.transcriptText}`,
          },
        ];

        // Add previous Q&A context
        if (input.previousQA) {
          for (const qa of input.previousQA) {
            messages.push({
              role: qa.role,
              content: qa.content,
            });
          }
        }

        messages.push({
          role: "user",
          content: input.question,
        });

        const result = await invokeLLM({
          messages,
          maxTokens: 1000,
        });

        const content = result.choices[0]?.message?.content;
        const answer = typeof content === "string" ? content : "";

        return { answer };
      }),

    // Refine realtime transcript segments to natural text without changing meaning
    refineTranscript: protectedProcedure
      .input(z.object({
        segments: z.array(z.object({
          id: z.string(),
          text: z.string(),
          speaker: z.string().optional(),
        })),
      }))
      .mutation(async ({ input }) => {
        const text = input.segments.map(s => s.text).join(" ");

        const result = await invokeLLM({
          messages: [
            {
              role: "system",
              content: [
                "あなたは音声認識の文字起こし結果を校正するアシスタントです。",
                "以下のルールを厳守してください：",
                "- 元の意味・内容・語順を最大限保持する",
                "- 明らかな誤字・脱字・助詞の誤りのみ修正する",
                "- 言葉の追加・削除・言い換えは行わない",
                "- 句読点を適切に補う程度に留める",
                "- テキストのみ返す（説明・コメント不要）",
              ].join("\n"),
            },
            {
              role: "user",
              content: text,
            },
          ],
          maxTokens: 500,
        });

        const content = result.choices[0]?.message?.content;
        const refined = typeof content === "string" ? content.trim() : text;

        return { refined, originalIds: input.segments.map(s => s.id) };
      }),

    // Generate realtime transcription token
    generateRealtimeToken: protectedProcedure
      .mutation(async () => {
        console.log("[TRPC] Generating realtime token");
        const token = await generateRealtimeToken();
        return { token };
      }),

    // Realtime translation endpoint
    translate: protectedProcedure
      .input(z.object({
        texts: z.array(z.object({
          id: z.string(),
          text: z.string(),
        })),
        targetLanguage: z.string(),
      }))
      .mutation(async ({ input }) => {
        console.log("[TRPC] translate mutation called");

        const languageNames: Record<string, string> = {
          en: "English",
          zh: "Chinese",
          ko: "Korean",
          es: "Spanish",
          fr: "French",
          de: "German",
          ja: "Japanese",
        };

        const targetLangName = languageNames[input.targetLanguage] || input.targetLanguage;

        // バッチ処理: 複数テキストを一度に翻訳
        const textsToTranslate = input.texts.map(t => t.text).join("\n---SEPARATOR---\n");

        const result = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a translator. Translate the following texts to ${targetLangName}.
Each text is separated by "---SEPARATOR---".
Output only the translations in the same order, separated by "---SEPARATOR---".
Maintain the original tone and nuance. Do not add any explanation.`,
            },
            {
              role: "user",
              content: textsToTranslate,
            },
          ],
          maxTokens: 2000,
        });

        const content = result.choices[0]?.message?.content;
        const translatedTexts = typeof content === "string"
          ? content.split("---SEPARATOR---").map(t => t.trim())
          : [];

        return {
          translations: input.texts.map((t, i) => ({
            id: t.id,
            translatedText: translatedTexts[i] || "",
          })),
        };
      }),

    // Generate tags from transcript text
    generateTags: protectedProcedure
      .input(z.object({
        text: z.string(),
        maxTags: z.number().default(5),
      }))
      .mutation(async ({ input }) => {
        const prompt = `以下のテキストから、最大${input.maxTags}個の重要なタグを抽出してください。各タグは短く（2-4語以内）、テキストの内容を的確に表すものにしてください。

テキスト:
${input.text}

JSON形式で以下のように出力してください:
[
  {"name": "タグ1", "confidence": 0.95},
  {"name": "タグ2", "confidence": 0.87}
]

必ずJSON配列のみを返し、その他のテキストは出力しないでください。`;

        const result = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "あなたはテキスト分析の専門家です。与えられたテキストから重要なタグを抽出します。",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          maxTokens: 500,
        });

        const content = result.choices[0]?.message?.content;
        if (!content) {
          throw new Error("LLMから応答が得られません");
        }

        // Extract JSON from response (handle markdown code blocks)
        const contentStr = Array.isArray(content)
          ? content.map(c => {
              if (typeof c === 'string') return c;
              if ('text' in c && typeof c.text === 'string') return c.text;
              return '';
            }).join('')
          : String(content);
        const jsonMatch = contentStr.match(/\[[\s\S]*\]/);
        const jsonStr = jsonMatch ? jsonMatch[0] : contentStr;
        const parsed: unknown = JSON.parse(jsonStr);

        // Validate and format response
        const tags = Array.isArray(parsed)
          ? parsed.map((tag: any) => ({
              id: Date.now().toString() + Math.random(),
              name: String(tag.name || "").trim(),
              isAutoGenerated: true,
              confidence: Math.min(1, Math.max(0, Number(tag.confidence) || 0.5)),
            }))
          : [];

        // Sort by confidence and limit
        return {
          tags: tags
            .filter((t: any) => t.name.length > 0)
            .sort((a: any, b: any) => (b.confidence || 0) - (a.confidence || 0))
            .slice(0, input.maxTags),
        };
      }),

    // Extract action items from transcript text
    extractActionItems: protectedProcedure
      .input(z.object({
        text: z.string(),
        maxItems: z.number().default(10),
      }))
      .mutation(async ({ input }) => {
        const prompt = `以下のテキストから、最大${input.maxItems}個のアクションアイテム（やることリスト）を抽出してください。明確なタスク・目標・計画について言及されているものを選んでください。

テキスト:
${input.text}

各アイテムに対して、優先度を判定してください:
- high: 緊急で重要
- medium: 重要だが緊急ではない
- low: 優先度が低い

JSON形式で以下のように出力してください:
[
  {"text": "タスク1", "priority": "high", "confidence": 0.95},
  {"text": "タスク2", "priority": "medium", "confidence": 0.87}
]

必ずJSON配列のみを返し、その他のテキストは出力しないでください。`;

        const result = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "あなたはタスク管理の専門家です。与えられたテキストから実行すべきアクションアイテムを抽出します。",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          maxTokens: 1000,
        });

        const content = result.choices[0]?.message?.content;
        if (!content) {
          throw new Error("LLMから応答が得られません");
        }

        // Extract JSON from response
        const contentStr = Array.isArray(content)
          ? content.map(c => {
              if (typeof c === 'string') return c;
              if ('text' in c && typeof c.text === 'string') return c.text;
              return '';
            }).join('')
          : String(content);
        const jsonMatch = contentStr.match(/\[[\s\S]*\]/);
        const jsonStr = jsonMatch ? jsonMatch[0] : contentStr;
        const parsed: unknown = JSON.parse(jsonStr);

        // Validate and format response
        const items = Array.isArray(parsed)
          ? parsed.map((item: any) => ({
              id: Date.now().toString() + Math.random(),
              text: String(item.text || "").trim(),
              priority: ['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium',
              completed: false,
              isAutoGenerated: true,
              confidence: Math.min(1, Math.max(0, Number(item.confidence) || 0.5)),
            }))
          : [];

        // Sort by priority (high > medium > low) and confidence
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return {
          actionItems: items
            .filter((i: any) => i.text.length > 0)
            .sort((a: any, b: any) => {
              const priorityDiff = priorityOrder[a.priority as keyof typeof priorityOrder] - priorityOrder[b.priority as keyof typeof priorityOrder];
              if (priorityDiff !== 0) return priorityDiff;
              return (b.confidence || 0) - (a.confidence || 0);
            })
            .slice(0, input.maxItems),
        };
      }),

    // Analyze sentiment from transcript text
    analyzeSentiment: protectedProcedure
      .input(z.object({
        text: z.string(),
      }))
      .mutation(async ({ input }) => {
        const prompt = `以下のテキストの感情分析を行ってください。以下の6つの感情各々のスコア（0-1）と、全体的なセンチメント（ポジティブ/ニュートラル/ネガティブ）を判定してください。

テキスト:
${input.text}

以下の感情スコア、全体感情スコア（-1=極度にネガティブ〜0=中立〜1=極度にポジティブ）、信頼度、簡潔なサマリーを返してください。

JSON形式で以下のように出力してください:
{
  "score": 0.5,
  "confidence": 0.9,
  "emotions": {
    "joy": 0.3,
    "sadness": 0.1,
    "anger": 0.05,
    "fear": 0.1,
    "surprise": 0.2,
    "disgust": 0.05
  },
  "summary": "感情的なトーンの簡潔な説明"
}

必ずJSON形式のみを返してください。`;

        const result = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "あなたは感情分析の専門家です。テキストから感情を抽出し、定量化します。",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          maxTokens: 500,
        });

        const content = result.choices[0]?.message?.content;
        if (!content) {
          throw new Error("LLMから応答が得られません");
        }

        // Extract JSON from response
        const contentStr = Array.isArray(content)
          ? content.map(c => {
              if (typeof c === 'string') return c;
              if ('text' in c && typeof c.text === 'string') return c.text;
              return '';
            }).join('')
          : String(content);
        const jsonMatch = contentStr.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : contentStr;
        const raw = JSON.parse(jsonStr);
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
          throw new Error(`LLMが不正なJSONを返しました: オブジェクト形式ではありません (${jsonStr.slice(0, 100)})`);
        }
        const parsed = raw as Record<string, unknown>;

        // Validate and format response
        const score = Math.min(1, Math.max(-1, Number(parsed.score) || 0));
        const confidence = Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5));

        // Determine overall sentiment based on score
        let overallSentiment: 'positive' | 'neutral' | 'negative';
        if (score > 0.1) {
          overallSentiment = 'positive';
        } else if (score < -0.1) {
          overallSentiment = 'negative';
        } else {
          overallSentiment = 'neutral';
        }

        // Normalize emotion scores to 0-1
        const emotionsData: Record<string, unknown> = typeof parsed.emotions === 'object' && parsed.emotions !== null
          ? parsed.emotions as Record<string, unknown>
          : {};
        const emotions = {
          joy: Math.min(1, Math.max(0, Number(emotionsData.joy) || 0)),
          sadness: Math.min(1, Math.max(0, Number(emotionsData.sadness) || 0)),
          anger: Math.min(1, Math.max(0, Number(emotionsData.anger) || 0)),
          fear: Math.min(1, Math.max(0, Number(emotionsData.fear) || 0)),
          surprise: Math.min(1, Math.max(0, Number(emotionsData.surprise) || 0)),
          disgust: Math.min(1, Math.max(0, Number(emotionsData.disgust) || 0)),
        };

        return {
          overallSentiment,
          score,
          confidence,
          emotions,
          summary: String(parsed.summary || "").trim(),
          processedAt: new Date(),
        };
      }),

    // Extract keywords from transcript text
    extractKeywords: protectedProcedure
      .input(z.object({
        text: z.string(),
        maxKeywords: z.number().default(10),
      }))
      .mutation(async ({ input }) => {
        const prompt = `以下のテキストから、最大${input.maxKeywords}個の重要なキーワード・キーフレーズを抽出してください。業界用語、重要な概念、繰り返し言及される主題を優先してください。

テキスト:
${input.text}

各キーワードについて、重要度（high/medium/low）、信頼度（0-1）、出現頻度を判定してください。

JSON形式で以下のように出力してください:
[
  {"text": "キーワード1", "importance": "high", "confidence": 0.95, "frequency": 3},
  {"text": "キーワード2", "importance": "medium", "confidence": 0.87, "frequency": 2}
]

必ずJSON配列のみを返してください。`;

        const result = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "あなたはテキスト分析の専門家です。テキストから重要なキーワードを抽出します。",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          maxTokens: 1000,
        });

        const content = result.choices[0]?.message?.content;
        if (!content) {
          throw new Error("LLMから応答が得られません");
        }

        // Extract JSON from response
        const contentStr = Array.isArray(content)
          ? content.map(c => {
              if (typeof c === 'string') return c;
              if ('text' in c && typeof c.text === 'string') return c.text;
              return '';
            }).join('')
          : String(content);
        const jsonMatch = contentStr.match(/\[[\s\S]*\]/);
        const jsonStr = jsonMatch ? jsonMatch[0] : contentStr;
        const parsed = JSON.parse(jsonStr);

        // Calculate startIndex for each keyword in the original text
        const keywords = Array.isArray(parsed)
          ? parsed.map((kw: any, i: number) => ({
              id: Date.now().toString() + i,
              text: String(kw.text || "").trim(),
              importance: ['high', 'medium', 'low'].includes(kw.importance) ? kw.importance : 'medium',
              confidence: Math.min(1, Math.max(0, Number(kw.confidence) || 0.5)),
              frequency: Math.max(1, Number(kw.frequency) || 1),
              startIndex: input.text.toLowerCase().indexOf((kw.text || "").toLowerCase()),
            }))
          : [];

        // Sort by importance and confidence
        const importanceOrder = { high: 0, medium: 1, low: 2 };
        return {
          keywords: keywords
            .filter((k: any) => k.text.length > 0 && k.startIndex >= 0)
            .sort((a: any, b: any) => {
              const importanceDiff = importanceOrder[a.importance as keyof typeof importanceOrder] - importanceOrder[b.importance as keyof typeof importanceOrder];
              if (importanceDiff !== 0) return importanceDiff;
              return (b.confidence || 0) - (a.confidence || 0);
            })
            .slice(0, input.maxKeywords),
        };
      }),

    // Export recording to Markdown format
    exportMarkdown: protectedProcedure
      .input(z.object({
        recordingId: z.string(),
        title: z.string(),
        transcript: z.object({
          text: z.string(),
          segments: z.array(z.object({
            text: z.string(),
            startTime: z.number(),
            endTime: z.number(),
            speaker: z.string().optional(),
          })),
        }).optional(),
        summary: z.object({
          overview: z.string(),
          keyPoints: z.array(z.string()),
          actionItems: z.array(z.string()),
        }).optional(),
        keywords: z.array(z.object({
          text: z.string(),
          importance: z.string(),
          frequency: z.number(),
        })).optional(),
        tags: z.array(z.object({
          name: z.string(),
        })).optional(),
        actionItems: z.array(z.object({
          text: z.string(),
          priority: z.string(),
          completed: z.boolean(),
        })).optional(),
        sentiment: z.object({
          overallSentiment: z.string(),
          summary: z.string(),
        }).optional(),
      }))
      .mutation(async ({ input }) => {
        let markdown = `# ${input.title}\n\n`;
        markdown += `**Record ID:** ${input.recordingId}\n\n`;
        markdown += `---\n\n`;

        // Summary section
        if (input.summary) {
          markdown += `## 要約\n\n`;
          markdown += `**概要:** ${input.summary.overview}\n\n`;

          if (input.summary.keyPoints.length > 0) {
            markdown += `**重要なポイント:**\n`;
            input.summary.keyPoints.forEach(point => {
              markdown += `- ${point}\n`;
            });
            markdown += `\n`;
          }
        }

        // Sentiment section
        if (input.sentiment) {
          markdown += `## 感情分析\n\n`;
          markdown += `**総合感情:** ${input.sentiment.overallSentiment}\n`;
          markdown += `**詳細:** ${input.sentiment.summary}\n\n`;
        }

        // Keywords section
        if (input.keywords && input.keywords.length > 0) {
          markdown += `## キーワード\n\n`;
          input.keywords.forEach(kw => {
            markdown += `- **${kw.text}** (重要度: ${kw.importance}, 出現数: ${kw.frequency})\n`;
          });
          markdown += `\n`;
        }

        // Tags section
        if (input.tags && input.tags.length > 0) {
          markdown += `## タグ\n\n`;
          markdown += input.tags.map(t => `\`${t.name}\``).join(`, `);
          markdown += `\n\n`;
        }

        // Action Items section
        if (input.actionItems && input.actionItems.length > 0) {
          markdown += `## アクションアイテム\n\n`;
          input.actionItems.forEach(item => {
            const checkbox = item.completed ? '✓' : '☐';
            markdown += `- [${checkbox}] ${item.text} (優先度: ${item.priority})\n`;
          });
          markdown += `\n`;
        }

        // Transcript section
        if (input.transcript) {
          markdown += `## 文字起こし\n\n`;
          if (input.transcript.segments.length > 0) {
            input.transcript.segments.forEach(seg => {
              const speaker = seg.speaker ? `**${seg.speaker}:** ` : '';
              markdown += `${speaker}${seg.text}\n\n`;
            });
          } else {
            markdown += `${input.transcript.text}\n`;
          }
        }

        markdown += `\n---\n`;
        markdown += `*エクスポート日時: ${new Date().toLocaleString('ja-JP')}*\n`;

        return {
          markdown,
          filename: `${input.title.replace(/[\/\\:*?"<>|]/g, '_')}.md`,
        };
      }),

    // Phase 3 P3: Import recording metadata from CSV or JSON files
    importRecording: protectedProcedure
      .input(z.object({
        format: z.enum(["csv", "json"]),
        data: z.string(), // CSV or JSON string
        title: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        let recordings: Array<{
          title: string;
          notes?: string;
          tags?: Array<{ name: string; color?: string }>;
          actionItems?: Array<{
            text: string;
            priority: 'high' | 'medium' | 'low';
            completed?: boolean;
          }>;
          keywords?: Array<{
            text: string;
            importance: 'high' | 'medium' | 'low';
            frequency?: number;
          }>;
        }> = [];

        if (input.format === "json") {
          // Parse JSON format
          try {
            const parsed = JSON.parse(input.data);
            recordings = Array.isArray(parsed) ? parsed : [parsed];
          } catch {
            throw new Error("JSONの解析に失敗しました。正しいJSON形式で入力してください。");
          }
        } else if (input.format === "csv") {
          // Parse CSV format (simple implementation)
          const lines = input.data.trim().split('\n');
          if (lines.length < 2) {
            throw new Error("CSVに有効なデータが含まれていません。");
          }

          const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
          const titleIndex = headers.indexOf('title');
          const notesIndex = headers.indexOf('notes');
          const tagsIndex = headers.indexOf('tags');
          const actionItemsIndex = headers.indexOf('actionitems');
          const keywordsIndex = headers.indexOf('keywords');

          if (titleIndex === -1) {
            throw new Error("CSVに'title'列が必要です。");
          }

          for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;

            const values = lines[i].split(',').map(v => v.trim());
            const recording: typeof recordings[0] = {
              title: values[titleIndex] || `インポート ${i}`,
            };

            if (notesIndex !== -1 && values[notesIndex]) {
              recording.notes = values[notesIndex];
            }

            // Parse tags (format: "tag1|tag2|tag3")
            if (tagsIndex !== -1 && values[tagsIndex]) {
              recording.tags = values[tagsIndex]
                .split('|')
                .map(tag => ({
                  name: tag.trim(),
                }))
                .filter(tag => tag.name.length > 0);
            }

            // Parse action items (format: "item1:high|item2:medium")
            if (actionItemsIndex !== -1 && values[actionItemsIndex]) {
              recording.actionItems = values[actionItemsIndex]
                .split('|')
                .map(item => {
                  const [text, priority] = item.split(':');
                  return {
                    text: text?.trim() || '',
                    priority: (priority?.trim().toLowerCase() as any) || 'medium',
                    completed: false,
                  };
                })
                .filter(item => item.text.length > 0);
            }

            // Parse keywords (format: "keyword1:high|keyword2:medium")
            if (keywordsIndex !== -1 && values[keywordsIndex]) {
              recording.keywords = values[keywordsIndex]
                .split('|')
                .map(kw => {
                  const [text, importance] = kw.split(':');
                  return {
                    text: text?.trim() || '',
                    importance: (importance?.trim().toLowerCase() as any) || 'medium',
                    frequency: 1,
                  };
                })
                .filter(kw => kw.text.length > 0);
            }

            recordings.push(recording);
          }
        }

        // Validate and normalize imported data
        const importedRecordings = recordings.map((rec, idx) => ({
          id: `imported_${Date.now()}_${idx}`,
          title: rec.title || `インポート ${idx + 1}`,
          audioUri: '', // Will need to be filled in by user
          duration: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          highlights: [],
          notes: rec.notes || '',
          tags: (rec.tags || []).map((tag, i) => ({
            id: `tag_${Date.now()}_${i}`,
            name: tag.name,
            color: tag.color,
            isAutoGenerated: false,
            confidence: 1,
          })),
          actionItems: (rec.actionItems || []).map((item, i) => ({
            id: `action_${Date.now()}_${i}`,
            text: item.text,
            priority: item.priority as 'high' | 'medium' | 'low',
            completed: item.completed || false,
            isAutoGenerated: false,
            confidence: 1,
          })),
          keywords: (rec.keywords || []).map((kw, i) => ({
            id: `keyword_${Date.now()}_${i}`,
            text: kw.text,
            importance: kw.importance as 'high' | 'medium' | 'low',
            confidence: 1,
            frequency: kw.frequency || 1,
            startIndex: 0,
          })),
          qaHistory: [],
          status: 'saved' as const,
        }));

        return {
          success: true,
          count: importedRecordings.length,
          recordings: importedRecordings,
          message: `${importedRecordings.length}件の録音メタデータをインポートしました。`,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
