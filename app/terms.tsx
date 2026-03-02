import { View, Text, ScrollView, Pressable, Linking } from "react-native";
import { useRouter } from "expo-router";
import { IconSymbol } from "@/packages/components/ui/icon-symbol";
import { useColors } from "@/packages/hooks/use-colors";

export default function TermsPage() {
  const router = useRouter();
  const colors = useColors();

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-6">
        <Pressable
          onPress={() => router.back()}
          className="flex-row items-center gap-2 mb-6"
        >
          <IconSymbol name="arrow.left" size={20} color={colors.muted} />
          <Text className="text-muted">戻る</Text>
        </Pressable>

        <Text className="text-2xl font-bold text-foreground mb-2">
          利用規約
        </Text>
        <Text className="text-muted mb-6">最終更新日: 2025年1月11日</Text>

        <View className="space-y-6">
          <Text className="text-foreground leading-6">
            本利用規約（以下「本規約」）は、Pleno
            Live（以下「本アプリ」）の利用条件を定めるものです。
            本アプリをインストールまたは使用することにより、ユーザーは本規約に同意したものとみなされます。
          </Text>

          <View>
            <Text className="text-lg font-semibold text-foreground mb-2">
              第1条（サービスの内容）
            </Text>
            <Text className="text-muted leading-6">
              本アプリは、以下のサービスを提供します：{"\n"}
              • 音声の録音および再生{"\n"}
              • リアルタイム音声認識（Speech-to-Text）{"\n"}
              • 話者分離（Speaker Diarization）{"\n"}
              • AIによるメモの要約・整理{"\n"}
              • メモの保存・管理・検索
            </Text>
          </View>

          <View>
            <Text className="text-lg font-semibold text-foreground mb-2">
              第2条（利用条件）
            </Text>
            <Text className="text-muted leading-6">
              許可される利用：{"\n"}
              • 個人的なボイスメモ・議事録作成目的での利用{"\n"}
              • 業務における音声メモ・文字起こし目的での利用{"\n"}
              • 学習・研究目的での利用{"\n\n"}
              禁止される利用：{"\n"}
              • 他者の同意なく会話を録音する目的での利用{"\n"}
              • 違法行為の証拠収集を目的とした利用{"\n"}
              • 本アプリを改変し、マルウェアとして配布する行為
            </Text>
          </View>

          <View>
            <Text className="text-lg font-semibold text-foreground mb-2">
              第3条（免責事項）
            </Text>
            <Text className="text-muted leading-6">
              1. 本アプリは「現状有姿」で提供されます。
              開発者は、本アプリの完全性、正確性、信頼性について保証しません。{"\n\n"}
              2. 本アプリの使用によって生じたいかなる損害についても、開発者は責任を負いません。{"\n\n"}
              3. 音声認識の精度は100%ではありません。重要な内容については、必ず録音データを確認してください。
            </Text>
          </View>

          <View>
            <Text className="text-lg font-semibold text-foreground mb-2">
              第4条（ライセンス）
            </Text>
            <Text className="text-muted leading-6">
              本アプリは、GNU Affero General Public License v3.0（AGPL-3.0）の下で提供されています。
              ユーザーは、AGPL-3.0の条件に従い、本アプリのソースコードの閲覧、改変、再配布を行うことができます。
            </Text>
          </View>

          <View>
            <Text className="text-lg font-semibold text-foreground mb-2">
              第5条（準拠法・管轄）
            </Text>
            <Text className="text-muted leading-6">
              本規約は、日本法に準拠し解釈されます。
              本規約に関する紛争については、東京地方裁判所を第一審の専属的合意管轄裁判所とします。
            </Text>
          </View>

          <View>
            <Text className="text-lg font-semibold text-foreground mb-2">
              第6条（お問い合わせ）
            </Text>
            <Pressable
              onPress={() =>
                Linking.openURL(
                  "https://github.com/plenoai/pleno-live/issues"
                )
              }
            >
              <Text className="text-primary underline">
                GitHubのIssuesをご利用ください
              </Text>
            </Pressable>
          </View>

          <View className="mt-8 p-4 bg-surface rounded-lg border border-border">
            <Text className="text-muted text-center leading-6">
              本アプリをインストールまたは使用することにより、ユーザーは本利用規約およびプライバシーポリシーに同意したものとみなされます。
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
