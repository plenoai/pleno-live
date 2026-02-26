import { z } from "zod";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM, type Message } from "./_core/llm";
import {
  transcribeAudio,
  transcribeAudioFromUrl,
  formatTranscriptionWithSpeakers,
  type TranscriptionOptions
} from "./elevenlabs";
import { transcribeAudioWithGemini } from "./gemini";
import { generateRealtimeToken } from "./elevenlabs-realtime";

export const appRouter = router({
  system: systemRouter,

  ai: router({
    // Transcription endpoint supporting both ElevenLabs and Gemini
    transcribe: publicProcedure
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
        console.log("[TRPC] transcribe mutation called");
        console.log("[TRPC] provider:", input.provider);
        console.log("[TRPC] filename:", input.filename);
        console.log("[TRPC] audioBase64 length:", input.audioBase64?.length || 0);
        console.log("[TRPC] audioUrl:", input.audioUrl || "none");

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
    chat: publicProcedure
      .input(z.object({
        message: z.string(),
        context: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
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
        } catch (error) {
          console.error("Chat error:", error);
          throw new Error("AIの応答に失敗しました");
        }
      }),

    // Summary endpoint
    summarize: publicProcedure
      .input(z.object({
        text: z.string(),
        template: z.enum(["general", "meeting", "interview", "lecture"]).default("general"),
        customPrompt: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const templatePrompts = {
          general: "以下のテキストを要約してください。概要、重要なポイント3つ、アクションアイテム（あれば）を含めてください。",
          meeting: "以下の会議の文字起こしを要約してください。議題、決定事項、アクションアイテム、次のステップを含めてください。",
          interview: "以下のインタビューの文字起こしを要約してください。主要なトピック、重要な発言、結論を含めてください。",
          lecture: "以下の講義の文字起こしを要約してください。主要なトピック、重要な概念、学習ポイントを含めてください。",
        };

        // Use custom prompt if provided, otherwise use template prompt
        const prompt = input.customPrompt || templatePrompts[input.template];

        try {
          const result = await invokeLLM({
            messages: [
              {
                role: "system",
                content: "あなたは文書要約の専門家です。提供されたテキストを構造化された形式で要約してください。",
              },
              {
                role: "user",
                content: `${prompt}\n\nテキスト:\n${input.text}`,
              },
            ],
            maxTokens: 1500,
          });

          const content = result.choices[0]?.message?.content;
          const summaryText = typeof content === "string" ? content : "";

          // Parse the summary into structured format
          const lines = summaryText.split("\n").filter(l => l.trim());
          const overview = lines[0] || "";
          const keyPoints = lines.slice(1, 4).map(l => l.replace(/^[-•*]\s*/, ""));
          const actionItems = lines.slice(4, 7).map(l => l.replace(/^[-•*]\s*/, ""));

          return {
            overview,
            keyPoints,
            actionItems,
            rawText: summaryText,
          };
        } catch (error) {
          console.error("Summary error:", error);
          throw new Error("要約の生成に失敗しました");
        }
      }),

    // Q&A endpoint
    askQuestion: publicProcedure
      .input(z.object({
        question: z.string(),
        transcriptText: z.string(),
        previousQA: z.array(z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
        })).optional(),
      }))
      .mutation(async ({ input }) => {
        try {
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
        } catch (error) {
          console.error("Q&A error:", error);
          throw new Error("質問への回答に失敗しました");
        }
      }),

    // Generate realtime transcription token
    generateRealtimeToken: publicProcedure
      .mutation(async () => {
        try {
          console.log("[TRPC] Generating realtime token");
          const token = await generateRealtimeToken();
          return { token };
        } catch (error) {
          console.error("[TRPC] Failed to generate realtime token:", error);
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          throw new Error(`トークンの生成に失敗しました: ${errorMessage}`);
        }
      }),

    // Realtime translation endpoint
    translate: publicProcedure
      .input(z.object({
        texts: z.array(z.object({
          id: z.string(),
          text: z.string(),
        })),
        targetLanguage: z.string(),
      }))
      .mutation(async ({ input }) => {
        console.log("[TRPC] translate mutation called");
        console.log("[TRPC] target language:", input.targetLanguage);
        console.log("[TRPC] texts count:", input.texts.length);

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

        try {
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
        } catch (error) {
          console.error("[TRPC] Translation error:", error);
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          throw new Error(`翻訳に失敗しました: ${errorMessage}`);
        }
      }),

    // Generate tags from transcript text
    generateTags: publicProcedure
      .input(z.object({
        text: z.string(),
        maxTags: z.number().default(5),
      }))
      .mutation(async ({ input }) => {
        try {
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
          let parsed: unknown;
          try {
            parsed = JSON.parse(jsonStr);
          } catch {
            throw new Error(`LLMが不正なJSONを返しました: ${jsonStr.slice(0, 100)}`);
          }

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
        } catch (error) {
          console.error("[TRPC] Generate tags error:", error);
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          throw new Error(`タグ生成に失敗しました: ${errorMessage}`);
        }
      }),

    // Extract action items from transcript text
    extractActionItems: publicProcedure
      .input(z.object({
        text: z.string(),
        maxItems: z.number().default(10),
      }))
      .mutation(async ({ input }) => {
        try {
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
          let parsed: unknown;
          try {
            parsed = JSON.parse(jsonStr);
          } catch {
            throw new Error(`LLMが不正なJSONを返しました: ${jsonStr.slice(0, 100)}`);
          }

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
        } catch (error) {
          console.error("[TRPC] Extract action items error:", error);
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          throw new Error(`アクションアイテム抽出に失敗しました: ${errorMessage}`);
        }
      }),

    // Analyze sentiment from transcript text
    analyzeSentiment: publicProcedure
      .input(z.object({
        text: z.string(),
      }))
      .mutation(async ({ input }) => {
        try {
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
          let parsed: Record<string, unknown>;
          try {
            const raw = JSON.parse(jsonStr);
            if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
              throw new Error("オブジェクト形式ではありません");
            }
            parsed = raw as Record<string, unknown>;
          } catch {
            throw new Error(`LLMが不正なJSONを返しました: ${jsonStr.slice(0, 100)}`);
          }

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
          const emotions = {
            joy: Math.min(1, Math.max(0, Number(parsed.emotions?.joy) || 0)),
            sadness: Math.min(1, Math.max(0, Number(parsed.emotions?.sadness) || 0)),
            anger: Math.min(1, Math.max(0, Number(parsed.emotions?.anger) || 0)),
            fear: Math.min(1, Math.max(0, Number(parsed.emotions?.fear) || 0)),
            surprise: Math.min(1, Math.max(0, Number(parsed.emotions?.surprise) || 0)),
            disgust: Math.min(1, Math.max(0, Number(parsed.emotions?.disgust) || 0)),
          };

          return {
            overallSentiment,
            score,
            confidence,
            emotions,
            summary: String(parsed.summary || "").trim(),
            processedAt: new Date(),
          };
        } catch (error) {
          console.error("[TRPC] Sentiment analysis error:", error);
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          throw new Error(`感情分析に失敗しました: ${errorMessage}`);
        }
      }),

    // Extract keywords from transcript text
    extractKeywords: publicProcedure
      .input(z.object({
        text: z.string(),
        maxKeywords: z.number().default(10),
      }))
      .mutation(async ({ input }) => {
        try {
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
        } catch (error) {
          console.error("[TRPC] Extract keywords error:", error);
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          throw new Error(`キーワード抽出に失敗しました: ${errorMessage}`);
        }
      }),

    // Export recording to Markdown format
    exportMarkdown: publicProcedure
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
        try {
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
        } catch (error) {
          console.error("[TRPC] Export markdown error:", error);
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          throw new Error(`Markdownエクスポートに失敗しました: ${errorMessage}`);
        }
      }),

    // Phase 3 P3: Import recording metadata from CSV or JSON files
    importRecording: publicProcedure
      .input(z.object({
        format: z.enum(["csv", "json"]),
        data: z.string(), // CSV or JSON string
        title: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
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
            } catch (e) {
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
        } catch (error) {
          console.error("[TRPC] Import recording error:", error);
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          throw new Error(`ファイルインポートに失敗しました: ${errorMessage}`);
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
