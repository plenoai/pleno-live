import type { ComponentType } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { View, StyleSheet } from "react-native";
import { MarkdownText } from "@/packages/components/ui/markdown-text";
import { useColors } from "@/packages/hooks/use-colors";

function MarkdownTextStory({ content, fontSize, lineHeight }: { content: string; fontSize?: number; lineHeight?: number }) {
  const colors = useColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MarkdownText fontSize={fontSize} lineHeight={lineHeight}>
        {content}
      </MarkdownText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
});

const meta: Meta<typeof MarkdownTextStory> = {
  title: "UI/MarkdownText",
  component: MarkdownTextStory,
  decorators: [
    (Story: ComponentType) => (
      <View style={{ flex: 1 }}>
        <Story />
      </View>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof MarkdownTextStory>;

export const BasicFormatting: Story = {
  args: {
    content: `これは**太字**のテキストです。

そして*イタリック*も使えます。

**重要**: マークダウン記法がレンダリングされます。`,
  },
};

export const BoldText: Story = {
  args: {
    content: `**プロジェクトの進捗状況**について議論し、**今後のマイルストーン**を確認しました。

主要な懸念点と**解決策**について合意に達しました。`,
  },
};

export const MixedFormatting: Story = {
  args: {
    content: `# 見出し1

## 見出し2

### 見出し3

通常のテキストと**太字**と*イタリック*が混在しています。

> 引用ブロックもサポートされています。

\`インラインコード\`も表示できます。`,
  },
};

export const CodeBlock: Story = {
  args: {
    content: `コードブロックの例:

\`\`\`javascript
const hello = "world";
console.log(hello);
\`\`\`

インラインでは \`code\` のように表示されます。`,
  },
};

export const Lists: Story = {
  args: {
    content: `箇条書きリスト:
- 項目1
- 項目2
- 項目3

番号付きリスト:
1. 最初の項目
2. 2番目の項目
3. 3番目の項目`,
  },
};

export const SummaryExample: Story = {
  args: {
    content: `**会議のまとめ**

本日の会議では、以下の点について議論しました:

- **開発進捗**: 予定通り進行中
- **テストフェーズ**: 来週から開始予定
- **リリース日**: 3月末を目標

*次回会議*は来週月曜日に予定されています。`,
  },
};

export const ActionItemExample: Story = {
  args: {
    content: `**ドキュメントの更新** - 期限: 今週金曜日までに完了させる必要があります。`,
  },
};

export const LargerFontSize: Story = {
  args: {
    content: `**大きめのフォントサイズ**

この例では fontSize=18 と lineHeight=28 を使用しています。`,
    fontSize: 18,
    lineHeight: 28,
  },
};
