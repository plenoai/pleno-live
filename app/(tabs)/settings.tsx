import { useState, useEffect } from "react";
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Switch,
  Platform,
  TextInput,
} from "react-native";
import Constants from "expo-constants";

import { ScreenContainer } from "@/packages/components/screen-container";
import { Haptics, Storage } from "@/packages/platform";
import { IconSymbol, type IconSymbolName } from "@/packages/components/ui/icon-symbol";
import { useRecordings } from "@/packages/lib/recordings-context";
import { useColors } from "@/packages/hooks/use-colors";
import { useThemeContext } from "@/packages/lib/theme-provider";
import { trpc } from "@/packages/lib/trpc";
import { useWhisperModel } from "@/packages/hooks/use-whisper-model";
import { useMoonshine } from "@/packages/lib/moonshine-context";
import { recommendModelTier, type ModelRecommendation } from "@/packages/lib/device-model-recommendation";
import { useSettings, type Language, type TranscriptionProvider } from "@/packages/lib/settings-context";

type SummaryTemplate = "general" | "meeting" | "interview" | "lecture" | string;

interface CustomTemplate {
  id: string;
  name: string;
  prompt: string;
  createdAt: Date;
}

const LANGUAGES: { value: Language; label: string }[] = [
  { value: "auto", label: "自動" },
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
];

const TRANSCRIPTION_PROVIDERS: { value: TranscriptionProvider; label: string; description: string }[] = [
  { value: "elevenlabs", label: "ElevenLabs", description: "高精度・話者分離対応" },
  { value: "gemini", label: "Gemini", description: "Googleマルチモーダル" },
  { value: "whisper-local", label: "Whisper", description: "オフライン・プライバシー重視" },
  { value: "moonshine-local", label: "Moonshine", description: "オフライン・高速 (Web/iOS/Android)" },
];

const TEMPLATES: { value: SummaryTemplate; label: string; description: string }[] = [
  { value: "general", label: "一般", description: "汎用" },
  { value: "meeting", label: "会議", description: "議題・決定・アクション" },
  { value: "interview", label: "インタビュー", description: "発言・結論" },
  { value: "lecture", label: "講義", description: "概念・学習ポイント" },
];

const TRANSLATION_LANGUAGES: { value: string; label: string }[] = [
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
];

const CUSTOM_TEMPLATES_KEY = "custom-templates";

export default function SettingsScreen() {
  const colors = useColors();
  const { state: recordingsState, addRecording } = useRecordings();
  const { colorScheme, setColorScheme } = useThemeContext();
  const { settings, updateSettings, updateNestedSettings } = useSettings();

  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplatePrompt, setNewTemplatePrompt] = useState("");

  const {
    state: whisperState,
    loadModel: loadWhisperModel,
    availableModels: whisperModels,
    isWebGPUSupported,
    isSupported: isWhisperSupported,
  } = useWhisperModel();

  const {
    state: moonshineState,
    isSupported: isMoonshineSupported,
  } = useMoonshine();

  const [modelRecommendation, setModelRecommendation] = useState<ModelRecommendation | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;
    recommendModelTier().then(setModelRecommendation).catch(() => {});
  }, []);

  useEffect(() => {
    const load = async () => {
      const saved = await Storage.getItem(CUSTOM_TEMPLATES_KEY);
      if (!saved) return;
      try {
        const parsed: CustomTemplate[] = JSON.parse(saved);
        setCustomTemplates(parsed.map(t => ({ ...t, createdAt: new Date(t.createdAt) })));
      } catch { /* 壊れたデータは無視 */ }
    };
    load();
  }, []);

  const realtimeEnabled = settings.realtimeTranscription.enabled;
  const isElevenLabs = settings.transcriptionProvider === "elevenlabs";

  const handleClearData = async () => {
    if (Platform.OS === "web") {
      const confirmed = window.confirm("すべての録音データを削除しますか？この操作は取り消せません。");
      if (confirmed) {
        try {
          await Storage.clear();
          window.alert("削除しました。ページを再読み込みしてください。");
          window.location.reload();
        } catch {
          window.alert("削除に失敗しました");
        }
      }
    } else {
      Alert.alert(
        "データを削除",
        "すべての録音データを削除しますか？この操作は取り消せません。",
        [
          { text: "キャンセル", style: "cancel" },
          {
            text: "削除",
            style: "destructive",
            onPress: async () => {
              try {
                await Storage.clear();
                Alert.alert("完了", "削除しました。アプリを再起動してください。");
              } catch {
                Alert.alert("エラー", "削除に失敗しました");
              }
            },
          },
        ]
      );
    }
  };

  const importMutation = trpc.ai.importRecording.useMutation();

  const handleImport = async () => {
    Haptics.impact("light");
    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,.csv";
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        try {
          const content = await file.text();
          const format = file.name.endsWith(".csv") ? "csv" : "json";
          const result = await importMutation.mutateAsync({ format: format as "csv" | "json", data: content });
          if (result.success && result.recordings) {
            for (const rec of result.recordings) {
              await addRecording({ ...rec, audioUri: "", duration: 0, createdAt: new Date(), updatedAt: new Date(), highlights: [], notes: "", tags: rec.tags || [], actionItems: rec.actionItems || [], keywords: rec.keywords || [], qaHistory: [], status: "saved" });
            }
            window.alert(`${result.count}件をインポートしました。`);
          }
        } catch {
          window.alert("インポートに失敗しました");
        }
      };
      input.click();
    } else {
      try {
        const { getDocumentAsync } = await import("expo-document-picker");
        const result = await getDocumentAsync({ type: ["application/json", "text/csv"] });
        if (result.canceled || !result.assets?.[0]) return;
        const file = result.assets[0];
        const content = await (await fetch(file.uri)).text();
        const format = file.name?.endsWith(".csv") ? "csv" : "json";
        const importResult = await importMutation.mutateAsync({ format: format as "csv" | "json", data: content });
        if (importResult.success && importResult.recordings) {
          for (const rec of importResult.recordings) {
            await addRecording({ ...rec, audioUri: "", duration: 0, createdAt: new Date(), updatedAt: new Date(), highlights: [], notes: "", tags: rec.tags || [], actionItems: rec.actionItems || [], keywords: rec.keywords || [], qaHistory: [], status: "saved" });
          }
          Alert.alert("完了", `${importResult.count}件をインポートしました。`);
        }
      } catch {
        Alert.alert("エラー", "インポートに失敗しました");
      }
    }
  };

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim() || !newTemplatePrompt.trim()) {
      Alert.alert("エラー", "テンプレート名とプロンプトを入力してください");
      return;
    }
    const newTemplate: CustomTemplate = { id: Date.now().toString(), name: newTemplateName.trim(), prompt: newTemplatePrompt.trim(), createdAt: new Date() };
    const updated = [...customTemplates, newTemplate];
    setCustomTemplates(updated);
    await Storage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(updated));
    setNewTemplateName("");
    setNewTemplatePrompt("");
    setShowTemplateForm(false);
    Alert.alert("完了", "カスタムテンプレートを作成しました");
  };

  const handleDeleteTemplate = async (id: string) => {
    const updated = customTemplates.filter(t => t.id !== id);
    setCustomTemplates(updated);
    await Storage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(updated));
  };

  return (
    <ScreenContainer>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>設定</Text>
        </View>

        {/* 録音 */}
        <SectionHeader label="録音" />
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          {/* 文字起こし言語 */}
          <RowLabel label="文字起こし言語" colors={colors} />
          <View style={[styles.chipRow, { marginBottom: 16 }]}>
            {LANGUAGES.map((lang) => (
              <Chip
                key={lang.value}
                label={lang.label}
                selected={settings.language === lang.value}
                onPress={() => { Haptics.impact("light"); updateSettings({ language: lang.value }); }}
                colors={colors}
              />
            ))}
          </View>

          {/* 文字起こしプロバイダ */}
          <RowLabel label="文字起こしプロバイダ" colors={colors} />
          {TRANSCRIPTION_PROVIDERS.filter((p) => {
            if (p.value === "whisper-local") return Platform.OS === "web" && isWhisperSupported;
            // moonshine-local: Web は moonshine-js で対応, Native は executorch で対応
            if (p.value === "moonshine-local") return isMoonshineSupported;
            return true;
          }).map((provider) => (
            <SelectItem
              key={provider.value}
              label={provider.label}
              description={provider.description}
              selected={settings.transcriptionProvider === provider.value}
              onPress={() => { Haptics.impact("light"); updateSettings({ transcriptionProvider: provider.value }); }}
              colors={colors}
            />
          ))}

          {/* Whisper詳細設定 - Web Only */}
          {Platform.OS === "web" && settings.transcriptionProvider === "whisper-local" && (
            <View style={[styles.subsection, { borderTopColor: colors.border }]}>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.muted }]}>WebGPU</Text>
                <Text style={[styles.infoValue, { color: isWebGPUSupported ? colors.success : colors.warning }]}>
                  {isWebGPUSupported ? "対応" : "非対応 (WASM)"}
                </Text>
              </View>
              <RowLabel label="モデルサイズ" colors={colors} />
              {whisperModels.map((model) => (
                <SelectItem
                  key={model.id}
                  label={`${model.label} (${model.size})${model.recommended ? " 推奨" : ""}`}
                  description={model.description}
                  selected={settings.whisperSettings.modelSize === model.id}
                  onPress={() => { Haptics.impact("light"); updateNestedSettings("whisperSettings", { modelSize: model.id }); }}
                  colors={colors}
                />
              ))}
              {whisperState.isLoading && (
                <NoteBox icon="arrow.down.circle.fill" text={`ダウンロード中... ${Math.round(whisperState.loadProgress)}%`} color={colors.primary} colors={colors} />
              )}
              {whisperState.isLoaded && (
                <NoteBox icon="checkmark.circle.fill" text="モデル読み込み完了" color={colors.success} colors={colors} />
              )}
              {whisperState.error && (
                <NoteBox icon="exclamationmark.circle.fill" text={whisperState.error} color={colors.error} colors={colors} />
              )}
              {!whisperState.isLoaded && !whisperState.isLoading && (
                <TouchableOpacity
                  onPress={() => loadWhisperModel(settings.whisperSettings.modelSize, settings.whisperSettings.useWebGPU && isWebGPUSupported)}
                  style={[styles.actionButton, { borderColor: colors.primary, marginTop: 8 }]}
                >
                  <IconSymbol name="arrow.down.circle" size={18} color={colors.primary} />
                  <Text style={[styles.actionButtonText, { color: colors.primary }]}>モデルをダウンロード</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Moonshine詳細設定 - Native Only */}
          {isMoonshineSupported && settings.transcriptionProvider === "moonshine-local" && (
            <View style={[styles.subsection, { borderTopColor: colors.border }]}>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.muted }]}>モデル</Text>
                <Text style={[styles.infoValue, { color: colors.foreground }]}>Moonshine Tiny (~149MB)</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.muted }]}>対応言語</Text>
                <Text style={[styles.infoValue, { color: colors.foreground }]}>英語のみ</Text>
              </View>
              {modelRecommendation && (
                <NoteBox
                  icon={modelRecommendation.tier === "tiny" ? "checkmark.circle.fill" : "info.circle.fill"}
                  text={`端末推奨: ${modelRecommendation.tier} モデル（${modelRecommendation.reason}）`}
                  color={modelRecommendation.tier === "tiny" ? colors.success : colors.primary}
                  colors={colors}
                />
              )}
              {moonshineState.isGenerating && (
                <NoteBox icon="waveform" text="推論中..." color={colors.primary} colors={colors} />
              )}
              {moonshineState.error && (
                <NoteBox icon="exclamationmark.circle.fill" text={moonshineState.error} color={colors.error} colors={colors} />
              )}
              {moonshineState.isReady && !moonshineState.isGenerating && !moonshineState.error && (
                <NoteBox icon="checkmark.circle.fill" text="モデル準備完了" color={colors.success} colors={colors} />
              )}
              {!moonshineState.isReady && moonshineState.downloadProgress > 0 && (
                <NoteBox icon="arrow.down.circle.fill" text={`ダウンロード中... ${Math.round(moonshineState.downloadProgress * 100)}%`} color={colors.primary} colors={colors} />
              )}
              {!moonshineState.isReady && moonshineState.downloadProgress === 0 && (
                <NoteBox icon="info.circle.fill" text="文字起こし時に自動でモデルがダウンロードされます" color={colors.muted} colors={colors} />
              )}
            </View>
          )}

          <View style={[styles.divider, { borderTopColor: colors.border }]} />

          {/* 自動処理 */}
          <ToggleRow
            label="自動文字起こし"
            description="録音完了後に自動で文字起こしを開始"
            value={settings.autoTranscribe}
            onValueChange={() => { Haptics.impact("light"); updateSettings({ autoTranscribe: !settings.autoTranscribe }); }}
            colors={colors}
          />
          <ToggleRow
            label="自動分析"
            description="文字起こし後に要約・タグ・感情分析を自動実行（Gemini使用）"
            value={settings.autoAnalyze}
            onValueChange={() => { Haptics.impact("light"); updateSettings({ autoAnalyze: !settings.autoAnalyze }); }}
            colors={colors}
            noBorder
          />
        </View>

        {/* リアルタイム（ElevenLabs限定） */}
        <SectionHeader label="リアルタイム" badge="ElevenLabs 限定" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          {!isElevenLabs && (
            <NoteBox
              icon="exclamationmark.triangle.fill"
              text="リアルタイム機能は ElevenLabs プロバイダのみ利用できます"
              color={colors.warning}
              colors={colors}
              style={{ marginBottom: 12 }}
            />
          )}
          <ToggleRow
            label="リアルタイム文字起こし"
            description="録音中にリアルタイムで文字起こし結果を表示"
            value={realtimeEnabled}
            onValueChange={() => { Haptics.impact("light"); updateNestedSettings("realtimeTranscription", { enabled: !realtimeEnabled }); }}
            colors={colors}
            disabled={!isElevenLabs}
          />
          {realtimeEnabled && isElevenLabs && (
            <>
              <ToggleRow
                label="話者分離"
                description="複数話者を自動識別してラベル付け"
                value={settings.realtimeTranscription.enableSpeakerDiarization}
                onValueChange={() => { Haptics.impact("light"); updateNestedSettings("realtimeTranscription", { enableSpeakerDiarization: !settings.realtimeTranscription.enableSpeakerDiarization }); }}
                colors={colors}
              />
              <ToggleRow
                label="リアルタイム翻訳"
                description="文字起こし結果をリアルタイムで翻訳（API使用量増加）"
                value={settings.realtimeTranslation.enabled}
                onValueChange={() => { Haptics.impact("light"); updateNestedSettings("realtimeTranslation", { enabled: !settings.realtimeTranslation.enabled }); }}
                colors={colors}
              />
              {settings.realtimeTranslation.enabled && (
                <View style={{ marginTop: 8 }}>
                  <RowLabel label="翻訳先言語" colors={colors} />
                  <View style={styles.chipRow}>
                    {TRANSLATION_LANGUAGES.map((lang) => (
                      <Chip
                        key={lang.value}
                        label={lang.label}
                        selected={settings.realtimeTranslation.targetLanguage === lang.value}
                        onPress={() => { Haptics.impact("light"); updateNestedSettings("realtimeTranslation", { targetLanguage: lang.value }); }}
                        colors={colors}
                      />
                    ))}
                  </View>
                </View>
              )}
            </>
          )}
        </View>

        {/* 要約 */}
        <SectionHeader label="要約" badge="Gemini 使用" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <RowLabel label="テンプレート" colors={colors} />
          {TEMPLATES.map((template) => (
            <SelectItem
              key={template.value}
              label={template.label}
              description={template.description}
              selected={settings.summaryTemplate === template.value}
              onPress={() => { Haptics.impact("light"); updateSettings({ summaryTemplate: template.value }); }}
              colors={colors}
            />
          ))}

          {customTemplates.length > 0 && (
            <View style={[styles.subsection, { borderTopColor: colors.border }]}>
              <Text style={[styles.subsectionTitle, { color: colors.foreground }]}>カスタム ({customTemplates.length})</Text>
              {customTemplates.map((template) => (
                <View key={template.id} style={[styles.customTemplateItem, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => { Haptics.impact("light"); updateSettings({ summaryTemplate: template.id }); }}>
                    <Text style={[styles.customTemplateName, { color: colors.foreground }]}>{template.name}</Text>
                    <Text style={[styles.customTemplatePrompt, { color: colors.muted }]} numberOfLines={2}>{template.prompt}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteTemplate(template.id)} style={styles.deleteButton}>
                    <IconSymbol name="xmark" size={16} color={colors.error} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            onPress={() => setShowTemplateForm(!showTemplateForm)}
            style={[styles.addButton, { backgroundColor: colors.primary + "15" }]}
          >
            <IconSymbol name="plus" size={16} color={colors.primary} />
            <Text style={[styles.addButtonText, { color: colors.primary }]}>カスタムテンプレートを追加</Text>
          </TouchableOpacity>

          {showTemplateForm && (
            <View style={[styles.templateForm, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.formLabel, { color: colors.foreground }]}>テンプレート名</Text>
              <TextInput
                style={[styles.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                placeholder="例: マーケティング会議"
                placeholderTextColor={colors.muted}
                value={newTemplateName}
                onChangeText={setNewTemplateName}
              />
              <Text style={[styles.formLabel, { color: colors.foreground, marginTop: 12 }]}>プロンプト</Text>
              <TextInput
                style={[styles.textInputMultiline, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                placeholder="カスタマイズしたプロンプトを入力"
                placeholderTextColor={colors.muted}
                value={newTemplatePrompt}
                onChangeText={setNewTemplatePrompt}
                multiline
                numberOfLines={4}
              />
              <View style={styles.formButtons}>
                <TouchableOpacity onPress={handleCreateTemplate} style={[styles.formButton, { backgroundColor: colors.primary }]}>
                  <Text style={styles.formButtonText}>作成</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowTemplateForm(false); setNewTemplateName(""); setNewTemplatePrompt(""); }} style={[styles.formButton, { backgroundColor: colors.muted + "20" }]}>
                  <Text style={[styles.formButtonText, { color: colors.foreground }]}>キャンセル</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* 外観 */}
        <SectionHeader label="外観" />
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <ToggleRow
            label="ダークモード"
            description="暗い環境での目の疲労を軽減"
            value={colorScheme === "dark"}
            onValueChange={async (value) => {
              await setColorScheme(value ? "dark" : "light");
              await Storage.setItem("theme-preference", value ? "dark" : "light");
              await Haptics.impact("light");
            }}
            colors={colors}
            noBorder
          />
        </View>

        {/* データ */}
        <SectionHeader label="データ" />
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <TouchableOpacity
            onPress={handleImport}
            disabled={importMutation.isPending}
            style={[styles.actionButton, { borderColor: colors.primary, marginBottom: 10 }]}
          >
            <IconSymbol name="square.and.arrow.down" size={18} color={colors.primary} />
            <Text style={[styles.actionButtonText, { color: colors.primary }]}>
              {importMutation.isPending ? "インポート中..." : "ファイルからインポート (JSON/CSV)"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleClearData} style={[styles.actionButton, { borderColor: colors.error }]}>
            <IconSymbol name="trash.fill" size={18} color={colors.error} />
            <Text style={[styles.actionButtonText, { color: colors.error }]}>すべてのデータを削除</Text>
          </TouchableOpacity>
        </View>

        {/* アプリ情報 */}
        <View style={[styles.footer]}>
          <Text style={[styles.footerAppName, { color: colors.muted }]}>
            {Constants.expoConfig?.name ?? "Pleno"} {Constants.expoConfig?.version ?? ""}
          </Text>
          <Text style={[styles.footerSub, { color: colors.muted }]}>
            録音 {recordingsState.recordings.length}件
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

// ---- 共通コンポーネント ----

type Colors = ReturnType<typeof useColors>;

function SectionHeader({ label, badge, colors }: { label: string; badge?: string; colors?: Colors }) {
  return (
    <View style={sectionHeaderStyles.row}>
      <Text style={sectionHeaderStyles.label}>{label}</Text>
      {badge && colors && (
        <View style={[sectionHeaderStyles.badge, { backgroundColor: colors.primary + "20" }]}>
          <Text style={[sectionHeaderStyles.badgeText, { color: colors.primary }]}>{badge}</Text>
        </View>
      )}
    </View>
  );
}

const sectionHeaderStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginTop: 20, marginBottom: 6, gap: 8 },
  label: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, color: "#888" },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: "600" },
});

function RowLabel({ label, colors }: { label: string; colors: Colors }) {
  return <Text style={[rowLabelStyles.label, { color: colors.muted }]}>{label}</Text>;
}

const rowLabelStyles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: "500", marginBottom: 6 },
});

function Chip({ label, selected, onPress, colors }: { label: string; selected: boolean; onPress: () => void; colors: Colors }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[chipStyles.chip, { backgroundColor: selected ? colors.primary : colors.background, borderColor: selected ? colors.primary : colors.border }]}
    >
      <Text style={[chipStyles.text, { color: selected ? "#fff" : colors.foreground }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const chipStyles = StyleSheet.create({
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1 },
  text: { fontSize: 13, fontWeight: "500" },
});

function SelectItem({ label, description, selected, onPress, colors }: { label: string; description?: string; selected: boolean; onPress: () => void; colors: Colors }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[selectItemStyles.item, { backgroundColor: selected ? colors.primary + "12" : "transparent", borderColor: selected ? colors.primary : colors.border }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[selectItemStyles.label, { color: selected ? colors.primary : colors.foreground }]}>{label}</Text>
        {description && <Text style={[selectItemStyles.description, { color: colors.muted }]}>{description}</Text>}
      </View>
      {selected && <IconSymbol name="checkmark" size={16} color={colors.primary} />}
    </TouchableOpacity>
  );
}

const selectItemStyles = StyleSheet.create({
  item: { flexDirection: "row", alignItems: "center", padding: 11, borderRadius: 8, borderWidth: 1, marginBottom: 6 },
  label: { fontSize: 14, fontWeight: "500" },
  description: { fontSize: 12, marginTop: 1 },
});

function ToggleRow({ label, description, value, onValueChange, colors, disabled, noBorder }: {
  label: string; description?: string; value: boolean; onValueChange: (v: boolean) => void;
  colors: Colors; disabled?: boolean; noBorder?: boolean;
}) {
  return (
    <View style={[toggleRowStyles.row, !noBorder && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[toggleRowStyles.label, { color: disabled ? colors.muted : colors.foreground }]}>{label}</Text>
        {description && <Text style={[toggleRowStyles.description, { color: colors.muted }]}>{description}</Text>}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

const toggleRowStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  label: { fontSize: 15, fontWeight: "500" },
  description: { fontSize: 12, marginTop: 2 },
});

function NoteBox({ icon, text, color, colors, style }: { icon: string; text: string; color: string; colors: Colors; style?: object }) {
  return (
    <View style={[noteBoxStyles.box, { backgroundColor: color + "18" }, style]}>
      <IconSymbol name={icon as IconSymbolName} size={14} color={color} />
      <Text style={[noteBoxStyles.text, { color }]}>{text}</Text>
    </View>
  );
}

const noteBoxStyles = StyleSheet.create({
  box: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: 8, gap: 8 },
  text: { flex: 1, fontSize: 12, lineHeight: 17 },
});

// ---- メインスタイル ----

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 32, fontWeight: "700" },
  section: { marginHorizontal: 16, borderRadius: 10, padding: 14 },
  divider: { borderTopWidth: 1, marginVertical: 8 },
  subsection: { borderTopWidth: 1, marginTop: 10, paddingTop: 10 },
  subsectionTitle: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 11, borderRadius: 8, borderWidth: 1, gap: 7 },
  actionButtonText: { fontSize: 14, fontWeight: "500" },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  infoLabel: { fontSize: 13 },
  infoValue: { fontSize: 13, fontWeight: "500" },
  customTemplateItem: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: 8, borderWidth: 1, marginBottom: 6, gap: 8 },
  customTemplateName: { fontSize: 13, fontWeight: "600", marginBottom: 2 },
  customTemplatePrompt: { fontSize: 12, lineHeight: 16 },
  deleteButton: { padding: 4 },
  addButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: 8, gap: 6, marginTop: 10 },
  addButtonText: { fontSize: 13, fontWeight: "600" },
  templateForm: { borderWidth: 1, borderRadius: 8, padding: 14, marginTop: 10 },
  formLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6 },
  textInput: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  textInputMultiline: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, textAlignVertical: "top", minHeight: 80 },
  formButtons: { flexDirection: "row", gap: 8, marginTop: 12 },
  formButton: { flex: 1, paddingVertical: 9, borderRadius: 6, alignItems: "center" },
  formButtonText: { fontSize: 13, fontWeight: "600", color: "#FFFFFF" },
  footer: { alignItems: "center", paddingVertical: 28, gap: 4 },
  footerAppName: { fontSize: 13, fontWeight: "500" },
  footerSub: { fontSize: 12 },
});
