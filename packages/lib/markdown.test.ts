import { describe, expect, it } from "vitest";

import { parseBlocks, parseInline } from "./markdown";

describe("parseInline", () => {
  it("parses bold, em, code and links", () => {
    expect(parseInline("**太字**と*斜体*と\u0060code\u0060と[リンク](https://example.com)")).toEqual([
      { type: "strong", children: [{ type: "text", text: "太字" }] },
      { type: "text", text: "と" },
      { type: "em", children: [{ type: "text", text: "斜体" }] },
      { type: "text", text: "と" },
      { type: "code", text: "code" },
      { type: "text", text: "と" },
      { type: "link", url: "https://example.com", children: [{ type: "text", text: "リンク" }] },
    ]);
  });

  it("keeps intraword underscore as text", () => {
    expect(parseInline("snake_caseとfile_name.md")).toEqual([
      { type: "text", text: "snake_caseとfile_name.md" },
    ]);
  });
});

describe("parseBlocks", () => {
  it("parses headings, paragraphs, lists, blockquote and fence", () => {
    const src = [
      "# 見出し",
      "",
      "第一段落**太字**。",
      "",
      "- 項目A",
      "- 項目B",
      "",
      "1. 手順1",
      "2. 手順2",
      "",
      "> 引用",
      "",
      "\u0060\u0060\u0060",
      "const x = 1;",
      "\u0060\u0060\u0060",
    ].join("\n");
    const blocks = parseBlocks(src);
    expect(blocks).toEqual([
      { type: "heading", level: 1, nodes: [{ type: "text", text: "見出し" }] },
      {
        type: "paragraph",
        nodes: [
          { type: "text", text: "第一段落" },
          { type: "strong", children: [{ type: "text", text: "太字" }] },
          { type: "text", text: "。" },
        ],
      },
      {
        type: "list",
        ordered: false,
        items: [
          [{ type: "text", text: "項目A" }],
          [{ type: "text", text: "項目B" }],
        ],
      },
      {
        type: "list",
        ordered: true,
        items: [
          [{ type: "text", text: "手順1" }],
          [{ type: "text", text: "手順2" }],
        ],
      },
      { type: "blockquote", nodes: [{ type: "text", text: "引用" }] },
      { type: "fence", code: "const x = 1;" },
    ]);
  });

  it("handles empty and plain text", () => {
    expect(parseBlocks("")).toEqual([]);
    expect(parseBlocks("一行だけ")).toEqual([
      { type: "paragraph", nodes: [{ type: "text", text: "一行だけ" }] },
    ]);
  });
});
