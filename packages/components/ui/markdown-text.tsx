import Markdown, { type MarkdownStyleMap } from "@ronradtke/react-native-markdown-display";
import { View, type ViewStyle } from "react-native";

import { useColors } from "@/packages/hooks/use-colors";

interface MarkdownTextProps {
  children: string;
  fontSize?: number;
  lineHeight?: number;
  style?: ViewStyle;
}

export function MarkdownText({
  children,
  fontSize = 15,
  lineHeight = 24,
  style,
}: MarkdownTextProps) {
  const colors = useColors();

  const styles: MarkdownStyleMap = {
    body: {
      color: colors.foreground,
      fontSize,
      lineHeight,
    },
    paragraph: {
      marginTop: 0,
      marginBottom: 0,
    },
    strong: {
      fontWeight: "700",
    },
    em: {
      fontStyle: "italic",
    },
    link: {
      color: colors.primary,
    },
    heading1: {
      fontSize: fontSize * 1.5,
      fontWeight: "700",
      marginVertical: 8,
    },
    heading2: {
      fontSize: fontSize * 1.3,
      fontWeight: "700",
      marginVertical: 6,
    },
    heading3: {
      fontSize: fontSize * 1.15,
      fontWeight: "600",
      marginVertical: 4,
    },
    bullet_list: {
      marginVertical: 4,
    },
    ordered_list: {
      marginVertical: 4,
    },
    list_item: {
      flexDirection: "row",
      marginVertical: 2,
    },
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
  };

  return (
    <View style={style}>
      <Markdown style={styles}>{children}</Markdown>
    </View>
  );
}

