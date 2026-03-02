import { View, Text, ScrollView, Pressable, Linking } from "react-native";
import { useRouter } from "expo-router";
import { IconSymbol } from "@/packages/components/ui/icon-symbol";
import { useColors } from "@/packages/hooks/use-colors";

export default function PrivacyPage() {
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
          プライバシーポリシー
        </Text>
        <Text className="text-muted mb-6">最終更新日: 2025年1月11日</Text>

        <View className="space-y-6">
          <Text className="text-foreground leading-6">
            Pleno
            Live（以下「本アプリ」）は、ユーザーのプライバシーを最優先に設計されています。
          </Text>

          <View>
            <Text className="text-lg font-semibold text-foreground mb-2">
              1. 収集するデータ
            </Text>
            <Text className="text-muted leading-6">
              本アプリは、ボイスメモおよび文字起こし機能を提供するため、以下のデータを収集します：{"\n"}
              • 音声データ: マイクから録音された音声データ{"\n"}
              • 文字起こしテキスト: 音声データから生成されたテキストデータ{"\n"}
              • メモのメタデータ: 作成日時、タイトル、タグなどの情報
            </Text>
          </View>

          <View>
            <Text className="text-lg font-semibold text-foreground mb-2">
              2. データの保存場所
            </Text>
            <Text className="text-muted leading-6">
              収集したすべてのデータは、ユーザーの端末内に保存されます。
              音声データおよび文字起こしデータは運営会社のサーバーに送信されることはありません。
            </Text>
          </View>

          <View>
            <Text className="text-lg font-semibold text-foreground mb-2">
              3. 外部サービスへのデータ送信
            </Text>
            <Text className="text-muted leading-6">
              文字起こし機能を提供するため、音声データは以下の外部サービスに送信される場合があります：{"\n"}
              • ElevenLabs: 音声認識（Speech-to-Text）サービスとして使用{"\n"}
              • Google Gemini: 要約やメモの整理などのAI機能に使用{"\n\n"}
              これらのサービスへのデータ送信は、ユーザーがアプリの設定でAPIキーを設定した場合にのみ行われます。
            </Text>
          </View>

          <View>
            <Text className="text-lg font-semibold text-foreground mb-2">
              4. データの利用目的
            </Text>
            <Text className="text-muted leading-6">
              収集したデータは、以下の目的でのみ使用されます：{"\n"}
              • 音声の録音および再生{"\n"}
              • 音声データの文字起こし{"\n"}
              • メモの保存、管理、検索
            </Text>
          </View>

          <View>
            <Text className="text-lg font-semibold text-foreground mb-2">
              5. ユーザーの権利
            </Text>
            <Text className="text-muted leading-6">
              ユーザーは以下の権利を有します：{"\n"}
              • アクセス権: アプリ内から保存されたすべてのメモを閲覧できます{"\n"}
              • 削除権: いつでもメモを削除できます{"\n"}
              • オプトアウト: アプリをアンインストールすることで、データ収集を完全に停止できます
            </Text>
          </View>

          <View>
            <Text className="text-lg font-semibold text-foreground mb-2">
              6. お問い合わせ
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
        </View>
      </View>
    </ScrollView>
  );
}
