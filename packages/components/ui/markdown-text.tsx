import { Linking, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { useMemo } from "react";

import { useColors } from "@/packages/hooks/use-colors";
import { parseBlocks, type Block, type InlineNode } from "@/packages/lib/markdown";

interface MarkdownTextProps {
  children: string;
  fontSize?: number;
  lineHeight?: number;
  style?: ViewStyle;
}

export interface MarkdownStyleMap {
  body?: TextStyle;
  paragraph?: TextStyle;
  strong?: TextStyle;
  em?: TextStyle;
  link?: TextStyle;
  heading1?: TextStyle;
  heading2?: TextStyle;
  heading3?: TextStyle;
  bullet_list?: ViewStyle;
  ordered_list?: ViewStyle;
  list_item?: ViewStyle;
  code_inline?: TextStyle;
  fence?: TextStyle;
  blockquote?: ViewStyle;
}

function Inline({ nodes, styles, base }: { nodes: InlineNode[]; styles: MarkdownStyleMap; base: string }) {
  return (
    <>
      {nodes.map((node, i) => {
        const key = base + "-" + i;
        switch (node.type) {
          case "text":
            return <Text key={key}>{node.text}</Text>;
          case "strong":
            return (
              <Text key={key} style={styles.strong}>
                <Inline nodes={node.children} styles={styles} base={key} />
              </Text>
            );
          case "em":
            return (
              <Text key={key} style={styles.em}>
                <Inline nodes={node.children} styles={styles} base={key} />
              </Text>
            );
          case "code":
            return <Text key={key} style={styles.code_inline}>{node.text}</Text>;
          case "link":
            return (
              <Text key={key} style={styles.link} onPress={() => Linking.openURL(node.url)}>
                <Inline nodes={node.children} styles={styles} base={key} />
              </Text>
            );
        }
      })}
    </>
  );
}

function BlockView({ block, styles, index }: { block: Block; styles: MarkdownStyleMap; index: number }) {
  switch (block.type) {
    case "paragraph":
      return (
        <Text key={index} style={[styles.body, styles.paragraph]}>
          <Inline nodes={block.nodes} styles={styles} base={"p" + index} />
        </Text>
      );
    case "heading":
      return (
        <Text key={index} style={styles[("heading" + block.level) as keyof MarkdownStyleMap] as TextStyle}>
          <Inline nodes={block.nodes} styles={styles} base={"h" + index} />
        </Text>
      );
    case "blockquote":
      return (
        <View key={index} style={styles.blockquote}>
          <Text style={[styles.body, styles.paragraph]}>
            <Inline nodes={block.nodes} styles={styles} base={"q" + index} />
          </Text>
        </View>
      );
    case "list":
      return (
        <View key={index} style={block.ordered ? styles.ordered_list : styles.bullet_list}>
          {block.items.map((item, i) => (
            <View key={i} style={[styles.list_item, { gap: 6 }]}>
              <Text style={styles.body}>{block.ordered ? i + 1 + "." : "\u2022"}</Text>
              <Text style={[styles.body, { flex: 1 }]}>
                <Inline nodes={item} styles={styles} base={"i" + index + "-" + i} />
              </Text>
            </View>
          ))}
        </View>
      );
    case "fence":
      return <Text key={index} style={styles.fence}>{block.code}</Text>;
  }
}

export function MarkdownText({ children, fontSize = 15, lineHeight = 24, style }: MarkdownTextProps) {
  const colors = useColors();
  const styles = useMemo<MarkdownStyleMap>(
    () => ({
      body: { color: colors.foreground, fontSize, lineHeight },
      paragraph: { marginTop: 0, marginBottom: 0 },
      strong: { fontWeight: "700" },
      em: { fontStyle: "italic" },
      link: { color: colors.primary },
      heading1: { fontSize: fontSize * 1.5, fontWeight: "700", marginVertical: 8 },
      heading2: { fontSize: fontSize * 1.3, fontWeight: "700", marginVertical: 6 },
      heading3: { fontSize: fontSize * 1.15, fontWeight: "600", marginVertical: 4 },
      bullet_list: { marginVertical: 4 },
      ordered_list: { marginVertical: 4 },
      list_item: { flexDirection: "row", marginVertical: 2 },
      code_inline: {
        backgroundColor: colors.surface,
        color: colors.foreground,
        paddingHorizontal: 4,
        borderRadius: 4,
        fontFamily: "monospace",
      },
      fence: {
        backgroundColor: colors.surface,
        color: colors.foreground,
        padding: 8,
        borderRadius: 8,
        fontFamily: "monospace",
        marginVertical: 8,
      },
      blockquote: {
        backgroundColor: colors.surface,
        borderLeftWidth: 4,
        borderLeftColor: colors.primary,
        paddingLeft: 12,
        paddingVertical: 4,
        marginVertical: 8,
      },
    }),
    [colors, fontSize, lineHeight]
  );
  const blocks = useMemo(() => parseBlocks(children), [children]);
  return (
    <View style={style}>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} styles={styles} index={i} />
      ))}
    </View>
  );
}
