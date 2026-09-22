export type InlineNode =
  | { type: "text"; text: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "em"; children: InlineNode[] }
  | { type: "code"; text: string }
  | { type: "link"; url: string; children: InlineNode[] };

export type Block =
  | { type: "paragraph"; nodes: InlineNode[] }
  | { type: "blockquote"; nodes: InlineNode[] }
  | { type: "heading"; level: number; nodes: InlineNode[] }
  | { type: "list"; ordered: boolean; items: InlineNode[][] }
  | { type: "fence"; code: string };

const isDelimiter = (c: string) => c === "*" || c === "_";

export function parseInline(src: string): InlineNode[] {
  const out: InlineNode[] = [];
  let buf = "";
  const flush = () => {
    if (buf) {
      out.push({ type: "text", text: buf });
      buf = "";
    }
  };
  for (let i = 0; i < src.length; ) {
    const c = src[i];
    if (c === "\u0060") {
      const end = src.indexOf("\u0060", i + 1);
      if (end !== -1) {
        flush();
        out.push({ type: "code", text: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (c === "[") {
      const close = src.indexOf("]", i + 1);
      const open = close !== -1 ? src.indexOf("(", close + 1) : -1;
      const end = open !== -1 ? src.indexOf(")", open + 1) : -1;
      if (open === close + 1 && end !== -1) {
        flush();
        out.push({
          type: "link",
          url: src.slice(open + 1, end),
          children: parseInline(src.slice(i + 1, close)),
        });
        i = end + 1;
        continue;
      }
    }
    if (isDelimiter(c)) {
      const bold = src[i + 1] === c;
      const delim = c + c;
      const close = src.indexOf(delim, i + 2);
      if (bold && close !== -1) {
        flush();
        out.push({ type: "strong", children: parseInline(src.slice(i + 2, close)) });
        i = close + 2;
        continue;
      }
      const prev = src[i - 1];
      const next = src[i + 1];
      const bounded =
        (prev === undefined || !/\w/.test(prev)) && (next === undefined || !/\w/.test(next));
      const singleClose = src.indexOf(c, i + 1);
      if (!bold && bounded && singleClose !== -1 && c !== "_") {
        flush();
        out.push({ type: "em", children: parseInline(src.slice(i + 1, singleClose)) });
        i = singleClose + 1;
        continue;
      }
    }
    buf += c;
    i++;
  }
  flush();
  return out;
}

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: "paragraph", nodes: parseInline(para.join(" ")) });
      para = [];
    }
  };
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      flushPara();
      i++;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushPara();
      blocks.push({ type: "heading", level: heading[1].length, nodes: parseInline(heading[2]) });
      i++;
      continue;
    }
    if (trimmed.startsWith("\u0060\u0060\u0060")) {
      flushPara();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("\u0060\u0060\u0060")) {
        code.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({ type: "fence", code: code.join("\n") });
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(trimmed);
    if (quote) {
      flushPara();
      const quotes: string[] = [];
      while (i < lines.length) {
        const m = /^>\s?(.*)$/.exec(lines[i].trim());
        if (!m) break;
        quotes.push(m[1]);
        i++;
      }
      blocks.push({ type: "blockquote", nodes: parseInline(quotes.join(" ")) });
      continue;
    }
    const ul = /^[-*+]\s+(.*)$/.exec(trimmed);
    const ol = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (ul || ol) {
      flushPara();
      const ordered = Boolean(ol);
      const items: InlineNode[][] = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        const m = ordered ? /^\d+[.)]\s+(.*)$/.exec(t) : /^[-*+]\s+(.*)$/.exec(t);
        if (!m) break;
        items.push(parseInline(m[1]));
        i++;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    para.push(trimmed);
    i++;
  }
  flushPara();
  return blocks;
}
