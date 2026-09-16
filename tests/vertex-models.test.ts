import { describe, expect, it } from "vitest";

import {
  AUDIO_MODEL,
  TEXT_MODEL,
  VERTEX_LOCATION,
  vertexHost,
} from "../apps/server/_core/models";
import { buildGeminiTranscriptionPayload } from "../apps/server/gemini";

describe("Vertex AI model configuration", () => {
  it("uses the global host for the global location", () => {
    expect(vertexHost("global")).toBe("aiplatform.googleapis.com");
    expect(vertexHost()).toBe("aiplatform.googleapis.com");
  });

  it("prefixes the region for regional locations", () => {
    expect(vertexHost("us-central1")).toBe("us-central1-aiplatform.googleapis.com");
  });

  it("does not depend on a region for the configured location", () => {
    // Gemini 3 はリージョナルエンドポイントで 404 になるため global 固定。
    expect(VERTEX_LOCATION).toBe("global");
  });

  it("targets GA Gemini 3 models, not previews or retired 2.5", () => {
    for (const model of [TEXT_MODEL, AUDIO_MODEL]) {
      expect(model).toMatch(/^gemini-3\./);
      expect(model).not.toContain("2.5");
      expect(model).not.toContain("preview");
    }
  });
});

describe("buildGeminiTranscriptionPayload", () => {
  it("sets role=user, which Vertex AI v1 generateContent requires", () => {
    const payload = buildGeminiTranscriptionPayload("AAAA", { mimeType: "audio/webm" });

    expect(payload.contents[0].role).toBe("user");
    expect(payload.contents[0].parts[1].inline_data).toEqual({
      mime_type: "audio/webm",
      data: "AAAA",
    });
  });

  it("includes the language hint when a language code is given", () => {
    const payload = buildGeminiTranscriptionPayload("AAAA", { languageCode: "ja" });

    expect(payload.contents[0].parts[0].text).toContain("in ja");
  });
});
