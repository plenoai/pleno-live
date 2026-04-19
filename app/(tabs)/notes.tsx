import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  Text,
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/packages/components/screen-container";
import { PageHeader } from "@/packages/components/page-header";
import { RecordingCard } from "@/packages/components/recording-card";
import { Haptics, Storage } from "@/packages/platform";
import { IconSymbol } from "@/packages/components/ui/icon-symbol";
import { useRecordings } from "@/packages/lib/recordings-context";
import { useColors } from "@/packages/hooks/use-colors";
import { useResponsive } from "@/packages/hooks/use-responsive";
import { useTranslation } from "@/packages/lib/i18n/context";
import { withAlpha } from "@/packages/lib/color";
import {
  BorderRadius,
  FontSize,
  FontWeight,
  ScreenPadding,
  Spacing,
} from "@/packages/constants/layout";

export default function HomeScreen() {
  const router = useRouter();
  const colors = useColors();
  const { columns, isDesktop } = useResponsive();
  const { state, deleteRecording } = useRecordings();
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [selectedTemplateType, setSelectedTemplateType] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "longest" | "shortest">("newest");
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showSearchHistory, setShowSearchHistory] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  // 表示モードに基づいてカラム数を計算
  const effectiveColumns = useMemo(() => {
    if (viewMode === "list") return 1;
    // グリッドモードではレスポンシブのカラム数を使用
    return columns;
  }, [viewMode, columns]);

  // 検索履歴をロード
  useEffect(() => {
    const loadSearchHistory = async () => {
      try {
        const saved = await Storage.getItem("search-history");
        if (saved) {
          setSearchHistory(JSON.parse(saved));
        }
      } catch (error) {
        console.error("Failed to load search history:", error);
      }
    };
    loadSearchHistory();
  }, []);

  // 検索履歴を保存
  const saveToSearchHistory = useCallback(async (query: string) => {
    if (!query.trim()) return;
    const trimmedQuery = query.trim();
    // 重複を削除して先頭に追加
    const updatedHistory = [
      trimmedQuery,
      ...searchHistory.filter((h) => h !== trimmedQuery),
    ].slice(0, 10); // 最大10件
    setSearchHistory(updatedHistory);
    try {
      await Storage.setItem("search-history", JSON.stringify(updatedHistory));
    } catch (error) {
      console.error("Failed to save search history:", error);
    }
  }, [searchHistory]);

  // 検索履歴から削除
  const removeFromSearchHistory = useCallback(async (query: string) => {
    const updatedHistory = searchHistory.filter((h) => h !== query);
    setSearchHistory(updatedHistory);
    try {
      await Storage.setItem("search-history", JSON.stringify(updatedHistory));
    } catch (error) {
      console.error("Failed to save search history:", error);
    }
  }, [searchHistory]);

  // 検索履歴をクリア
  const clearSearchHistory = useCallback(async () => {
    setSearchHistory([]);
    try {
      await Storage.removeItem("search-history");
    } catch (error) {
      console.error("Failed to clear search history:", error);
    }
  }, []);

  // 全ての一意なタグを収集
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    state.recordings.forEach((r) => {
      r.tags.forEach((t) => tagSet.add(t.name));
    });
    return Array.from(tagSet).sort();
  }, [state.recordings]);

  // 検索クエリのデバウンス処理（300ms）
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filteredRecordings = useMemo(() => {
    let result = state.recordings;

    // Apply search filter with debounced query
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.title.toLowerCase().includes(query) ||
          r.transcript?.text.toLowerCase().includes(query) ||
          r.notes.toLowerCase().includes(query) ||
          // Phase 2 P5: Enhanced search with keywords, tags, and action items
          r.keywords.some((k) => k.text.toLowerCase().includes(query)) ||
          r.tags.some((t) => t.name.toLowerCase().includes(query)) ||
          r.actionItems.some((a) => a.text.toLowerCase().includes(query))
      );
    }

    // Apply template type filter
    if (selectedTemplateType) {
      result = result.filter((r) => r.summaryTemplateType === selectedTemplateType);
    }

    // Apply tag filter
    if (selectedTag) {
      result = result.filter((r) => r.tags.some((t) => t.name === selectedTag));
    }

    // Apply sort
    result = [...result].sort((a, b) => {
      switch (sortOrder) {
        case "newest":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "longest":
          return b.duration - a.duration;
        case "shortest":
          return a.duration - b.duration;
        default:
          return 0;
      }
    });

    return result;
  }, [state.recordings, debouncedSearchQuery, selectedTemplateType, selectedTag, sortOrder]);

  // コールバックをメモ化してRecordingCardの再レンダリングを防止
  const handleRecordingPress = useCallback((id: string) => {
    router.push(`/note/${id}`);
  }, [router]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteRecording(id);
  }, [deleteRecording]);

  const handleToggleSelectMode = useCallback(() => {
    setIsSelectMode((prev) => !prev);
    setSelectedIds(new Set());
  }, []);

  const handleToggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    const allIds = filteredRecordings.map((r) => r.id);
    setSelectedIds(new Set(allIds));
  }, [filteredRecordings]);

  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;

    Alert.alert(
      "一括削除",
      `${selectedIds.size}件の録音を削除しますか？`,
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "削除",
          style: "destructive",
          onPress: async () => {
            Haptics.impact('heavy');
            for (const id of selectedIds) {
              await deleteRecording(id);
            }
            setSelectedIds(new Set());
            setIsSelectMode(false);
          },
        },
      ]
    );
  }, [selectedIds, deleteRecording]);

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <IconSymbol name="mic.fill" size={64} color={colors.muted} />
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
        録音がありません
      </Text>
      <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
        下の録音ボタンをタップして{"\n"}最初の録音を開始しましょう
      </Text>
    </View>
  );

  return (
    <ScreenContainer>
      <PageHeader
        title={t("notes.title")}
        subtitle={`${state.recordings.length}${t("common.recording_noun")}`}
        action={
          state.recordings.length > 0 ? (
            <TouchableOpacity
              onPress={handleToggleSelectMode}
              style={[
                styles.selectModeButton,
                {
                  backgroundColor: isSelectMode ? withAlpha(colors.primary, 0.12) : colors.surface,
                  borderColor: isSelectMode ? colors.primary : colors.border,
                },
              ]}
            >
              <IconSymbol
                name={isSelectMode ? "xmark" : "checkmark.circle"}
                size={16}
                color={isSelectMode ? colors.primary : colors.muted}
              />
              <Text style={[styles.selectModeText, { color: isSelectMode ? colors.primary : colors.muted }]}>
                {isSelectMode ? "キャンセル" : "選択"}
              </Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      <View style={styles.searchWrapper}>
        <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <IconSymbol name="magnifyingglass" size={20} color={colors.muted} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder={t("notes.searchPlaceholder")}
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setShowSearchHistory(true)}
            onBlur={() => setTimeout(() => setShowSearchHistory(false), 200)}
            onSubmitEditing={() => {
              if (searchQuery.trim()) {
                saveToSearchHistory(searchQuery);
              }
              setShowSearchHistory(false);
            }}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <IconSymbol name="xmark" size={18} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Search History Dropdown */}
        {showSearchHistory && searchHistory.length > 0 && (
          <View style={[styles.searchHistoryDropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.searchHistoryHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.searchHistoryTitle, { color: colors.muted }]}>検索履歴</Text>
              <TouchableOpacity onPress={clearSearchHistory}>
                <Text style={[styles.searchHistoryClear, { color: colors.primary }]}>クリア</Text>
              </TouchableOpacity>
            </View>
            {searchHistory.map((item) => (
              <View key={item} style={styles.searchHistoryItem}>
                <TouchableOpacity
                  onPress={() => {
                    setSearchQuery(item);
                    setShowSearchHistory(false);
                  }}
                  style={styles.searchHistoryItemContent}
                >
                  <IconSymbol name="clock.fill" size={14} color={colors.muted} />
                  <Text style={[styles.searchHistoryText, { color: colors.foreground }]}>{item}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeFromSearchHistory(item)}>
                  <IconSymbol name="xmark" size={14} color={colors.muted} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.filterRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterButtons}
        >
          <TouchableOpacity
            onPress={() => setSelectedTemplateType(null)}
            style={[
              styles.filterButton,
              {
                backgroundColor: selectedTemplateType === null ? colors.primary : colors.surface,
                borderColor: selectedTemplateType === null ? colors.primary : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.filterText,
                { color: selectedTemplateType === null ? "#FFFFFF" : colors.muted },
              ]}
            >
              {t("notes.allNotes")}
            </Text>
          </TouchableOpacity>
          {(["general", "meeting", "interview", "lecture"] as const).map((type) => {
            const labels: Record<string, string> = {
              general: "一般",
              meeting: "会議",
              interview: "インタビュー",
              lecture: "講義",
            };
            const isActive = selectedTemplateType === type;
            return (
              <TouchableOpacity
                key={type}
                onPress={() => setSelectedTemplateType(isActive ? null : type)}
                style={[
                  styles.filterButton,
                  {
                    backgroundColor: isActive ? colors.primary : colors.surface,
                    borderColor: isActive ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    { color: isActive ? "#FFFFFF" : colors.muted },
                  ]}
                >
                  {labels[type]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <View style={styles.sortAndViewButtons}>
          <TouchableOpacity
            onPress={() => setViewMode(viewMode === "list" ? "grid" : "list")}
            style={[styles.viewModeButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <IconSymbol
              name={viewMode === "list" ? "square.grid.2x2" : "list.bullet"}
              size={14}
              color={colors.muted}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              const orders: ("newest" | "oldest" | "longest" | "shortest")[] = ["newest", "oldest", "longest", "shortest"];
              const currentIndex = orders.indexOf(sortOrder);
              setSortOrder(orders[(currentIndex + 1) % orders.length]);
            }}
            style={[styles.sortButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <IconSymbol
              name={sortOrder === "newest" || sortOrder === "oldest" ? "calendar" : "clock"}
              size={14}
              color={colors.muted}
            />
            <Text style={[styles.sortText, { color: colors.muted }]}>
              {sortOrder === "newest" ? "新しい順" : sortOrder === "oldest" ? "古い順" : sortOrder === "longest" ? "長い順" : "短い順"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tag Filter */}
      {allTags.length > 0 && (
        <View style={styles.tagFilterRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tagFilterContent}
          >
            <TouchableOpacity
              onPress={() => setSelectedTag(null)}
              style={[
                styles.tagFilterButton,
                {
                  backgroundColor: selectedTag === null ? withAlpha(colors.primary, 0.12) : colors.surface,
                  borderColor: selectedTag === null ? colors.primary : colors.border,
                },
              ]}
            >
              <IconSymbol name="tag.fill" size={14} color={selectedTag === null ? colors.primary : colors.muted} />
              <Text
                style={[
                  styles.tagFilterText,
                  { color: selectedTag === null ? colors.primary : colors.muted },
                ]}
              >
                すべてのタグ
              </Text>
            </TouchableOpacity>
            {allTags.map((tag) => (
              <TouchableOpacity
                key={tag}
                onPress={() => setSelectedTag(selectedTag === tag ? null : tag)}
                style={[
                  styles.tagFilterButton,
                  {
                    backgroundColor: selectedTag === tag ? withAlpha(colors.primary, 0.12) : colors.surface,
                    borderColor: selectedTag === tag ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tagFilterText,
                    { color: selectedTag === tag ? colors.primary : colors.muted },
                  ]}
                >
                  {tag}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <FlatList
        data={filteredRecordings}
        keyExtractor={(item) => item.id}
        key={`grid-${effectiveColumns}`}
        numColumns={effectiveColumns}
        renderItem={({ item }) => (
          <View style={effectiveColumns === 1 ? styles.listItem : styles.gridItem}>
            <RecordingCard
              recording={item}
              onPress={() => handleRecordingPress(item.id)}
              onDelete={() => handleDelete(item.id)}
              columns={effectiveColumns}
              isSelectMode={isSelectMode}
              isSelected={selectedIds.has(item.id)}
              onToggleSelection={() => handleToggleSelection(item.id)}
            />
          </View>
        )}
        contentContainerStyle={[
          styles.listContent,
          isDesktop && styles.listContentDesktop,
          isSelectMode && { paddingBottom: 160 },
        ]}
        columnWrapperStyle={effectiveColumns > 1 ? styles.columnWrapper : undefined}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
        // パフォーマンス最適化: 大量データ対応
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
      />

      {/* Bottom action bar for batch operations */}
      {isSelectMode && (
        <View style={[styles.batchActionBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <View style={styles.batchActionInfo}>
            <Text style={[styles.batchActionCount, { color: colors.foreground }]}>
              {selectedIds.size}件選択中
            </Text>
            <View style={styles.batchActionButtons}>
              <TouchableOpacity
                onPress={selectedIds.size === filteredRecordings.length ? handleDeselectAll : handleSelectAll}
                style={[styles.batchActionButton, { borderColor: colors.border }]}
              >
                <Text style={[styles.batchActionButtonText, { color: colors.primary }]}>
                  {selectedIds.size === filteredRecordings.length ? "全解除" : "全選択"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity
            onPress={handleBatchDelete}
            disabled={selectedIds.size === 0}
            style={[
              styles.batchDeleteButton,
              {
                backgroundColor: selectedIds.size > 0 ? colors.error : withAlpha(colors.muted, 0.25),
              },
            ]}
          >
            <IconSymbol name="trash.fill" size={18} color="#FFFFFF" />
            <Text style={styles.batchDeleteText}>削除</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  selectModeButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius["2xl"],
    borderWidth: 1,
    gap: 6,
  },
  selectModeText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
  },
  searchWrapper: {
    position: "relative",
    marginHorizontal: ScreenPadding.horizontal,
    zIndex: 100,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  searchHistoryDropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 4,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    paddingVertical: Spacing.sm,
  },
  searchHistoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderBottomWidth: 1,
    marginBottom: 4,
  },
  searchHistoryTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  searchHistoryClear: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  searchHistoryItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  searchHistoryItemContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  searchHistoryText: {
    fontSize: FontSize.md,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.lg,
    padding: 0,
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: ScreenPadding.horizontal,
    paddingVertical: Spacing.md,
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  filterButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  sortAndViewButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  viewModeButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    gap: 4,
  },
  sortText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  filterButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: BorderRadius["2xl"],
    borderWidth: 1,
  },
  filterText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
  },
  listContent: {
    paddingHorizontal: ScreenPadding.horizontal,
    paddingBottom: ScreenPadding.listBottom,
    flexGrow: 1,
  },
  listContentDesktop: {},
  listItem: {
    width: "100%",
  },
  gridItem: {
    flex: 1,
    minWidth: 280,
    maxWidth: "100%",
  },
  columnWrapper: {
    gap: Spacing.md,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: FontSize["2xl"],
    fontWeight: FontWeight.semibold,
    marginTop: Spacing.lg,
  },
  emptySubtitle: {
    fontSize: FontSize.md,
    textAlign: "center",
    marginTop: Spacing.sm,
    lineHeight: 20,
  },
  tagFilterRow: {
    paddingBottom: Spacing.sm,
  },
  tagFilterContent: {
    paddingHorizontal: ScreenPadding.horizontal,
    gap: Spacing.sm,
  },
  tagFilterButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius["2xl"],
    borderWidth: 1,
    gap: 4,
  },
  tagFilterText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
  },
  batchActionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: ScreenPadding.horizontal,
    paddingVertical: Spacing.lg,
    paddingBottom: 40,
    borderTopWidth: 1,
  },
  batchActionInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  batchActionCount: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
  },
  batchActionButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  batchActionButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
  },
  batchActionButtonText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
  },
  batchDeleteButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: ScreenPadding.horizontal,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.xl,
    gap: Spacing.sm,
  },
  batchDeleteText: {
    color: "#FFFFFF",
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
  },
});
