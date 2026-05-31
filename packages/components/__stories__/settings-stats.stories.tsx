import type { ComponentType } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "@/packages/hooks/use-colors";
import { IconSymbol } from "@/packages/components/ui/icon-symbol";

interface StatsData {
  totalRecordings: number;
  totalDuration: number;
  transcribedCount: number;
  summarizedCount: number;
  thisWeekCount: number;
  thisWeekDuration: number;
  sentimentCounts: {
    positive: number;
    neutral: number;
    negative: number;
  };
  topTags: Array<{ name: string; count: number }>;
  pendingActions: number;
  highPriorityActions: number;
  transcriptionRate: number;
  summarizationRate: number;
}

interface SettingsStatsProps {
  stats: StatsData;
}

function SettingsStats({ stats }: SettingsStatsProps) {
  const colors = useColors();
  const hasSentiment =
    stats.sentimentCounts.positive +
      stats.sentimentCounts.neutral +
      stats.sentimentCounts.negative >
    0;

  return (
    <View style={[styles.section, { backgroundColor: colors.surface }]}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
        統計
      </Text>

      {/* Basic Stats */}
      <View style={styles.statsGrid}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.primary }]}>
            {stats.totalRecordings}
          </Text>
          <Text style={[styles.statLabel, { color: colors.muted }]}>
            録音数
          </Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.primary }]}>
            {Math.floor(stats.totalDuration / 60)}
          </Text>
          <Text style={[styles.statLabel, { color: colors.muted }]}>
            合計時間(分)
          </Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.success }]}>
            {stats.transcribedCount}
          </Text>
          <Text style={[styles.statLabel, { color: colors.muted }]}>
            文字起こし済
          </Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.secondary }]}>
            {stats.summarizedCount}
          </Text>
          <Text style={[styles.statLabel, { color: colors.muted }]}>
            要約済
          </Text>
        </View>
      </View>

      {/* This Week */}
      <View style={[styles.statsSubsection, { borderTopColor: colors.border }]}>
        <Text style={[styles.statsSubsectionTitle, { color: colors.foreground }]}>
          今週
        </Text>
        <View style={styles.statsRow}>
          <View style={styles.statsRowItem}>
            <Text style={[styles.statsRowValue, { color: colors.primary }]}>
              {stats.thisWeekCount}
            </Text>
            <Text style={[styles.statsRowLabel, { color: colors.muted }]}>
              件
            </Text>
          </View>
          <View style={styles.statsRowItem}>
            <Text style={[styles.statsRowValue, { color: colors.primary }]}>
              {Math.floor(stats.thisWeekDuration / 60)}
            </Text>
            <Text style={[styles.statsRowLabel, { color: colors.muted }]}>
              分
            </Text>
          </View>
        </View>
      </View>

      {/* Processing Rate */}
      <View style={[styles.statsSubsection, { borderTopColor: colors.border }]}>
        <Text style={[styles.statsSubsectionTitle, { color: colors.foreground }]}>
          処理率
        </Text>
        <View style={styles.progressBars}>
          <View style={styles.progressBarRow}>
            <Text style={[styles.progressBarLabel, { color: colors.muted }]}>
              文字起こし
            </Text>
            <View style={[styles.progressBarBg, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${stats.transcriptionRate}%`,
                    backgroundColor: colors.success,
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressBarValue, { color: colors.foreground }]}>
              {stats.transcriptionRate}%
            </Text>
          </View>
          <View style={styles.progressBarRow}>
            <Text style={[styles.progressBarLabel, { color: colors.muted }]}>
              要約
            </Text>
            <View style={[styles.progressBarBg, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${stats.summarizationRate}%`,
                    backgroundColor: colors.secondary,
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressBarValue, { color: colors.foreground }]}>
              {stats.summarizationRate}%
            </Text>
          </View>
        </View>
      </View>

      {/* Sentiment Distribution */}
      {hasSentiment && (
        <View style={[styles.statsSubsection, { borderTopColor: colors.border }]}>
          <Text style={[styles.statsSubsectionTitle, { color: colors.foreground }]}>
            感情分析
          </Text>
          <View style={styles.sentimentRow}>
            <View
              style={[
                styles.sentimentItem,
                { backgroundColor: colors.success + "20" },
              ]}
            >
              <IconSymbol name="face.smiling" size={16} color={colors.success} />
              <Text style={[styles.sentimentCount, { color: colors.success }]}>
                {stats.sentimentCounts.positive}
              </Text>
            </View>
            <View
              style={[
                styles.sentimentItem,
                { backgroundColor: colors.muted + "20" },
              ]}
            >
              <IconSymbol name="face.dashed" size={16} color={colors.muted} />
              <Text style={[styles.sentimentCount, { color: colors.muted }]}>
                {stats.sentimentCounts.neutral}
              </Text>
            </View>
            <View
              style={[
                styles.sentimentItem,
                { backgroundColor: colors.error + "20" },
              ]}
            >
              <IconSymbol name="face.frowning" size={16} color={colors.error} />
              <Text style={[styles.sentimentCount, { color: colors.error }]}>
                {stats.sentimentCounts.negative}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Action Items */}
      {stats.pendingActions > 0 && (
        <View style={[styles.statsSubsection, { borderTopColor: colors.border }]}>
          <Text style={[styles.statsSubsectionTitle, { color: colors.foreground }]}>
            未完了タスク
          </Text>
          <View style={styles.actionStatsRow}>
            <View style={styles.actionStatItem}>
              <Text style={[styles.actionStatValue, { color: colors.warning }]}>
                {stats.pendingActions}
              </Text>
              <Text style={[styles.actionStatLabel, { color: colors.muted }]}>
                件
              </Text>
            </View>
            {stats.highPriorityActions > 0 && (
              <View
                style={[
                  styles.actionStatBadge,
                  { backgroundColor: colors.error + "20" },
                ]}
              >
                <IconSymbol
                  name="exclamationmark.triangle.fill"
                  size={12}
                  color={colors.error}
                />
                <Text style={[styles.actionStatBadgeText, { color: colors.error }]}>
                  高優先度 {stats.highPriorityActions}件
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Top Tags */}
      {stats.topTags.length > 0 && (
        <View style={[styles.statsSubsection, { borderTopColor: colors.border }]}>
          <Text style={[styles.statsSubsectionTitle, { color: colors.foreground }]}>
            よく使うタグ
          </Text>
          <View style={styles.topTagsRow}>
            {stats.topTags.map((tag) => (
              <View
                key={tag.name}
                style={[
                  styles.topTagItem,
                  { backgroundColor: colors.primary + "15" },
                ]}
              >
                <Text style={[styles.topTagName, { color: colors.primary }]}>
                  {tag.name}
                </Text>
                <Text style={[styles.topTagCount, { color: colors.primary }]}>
                  {tag.count}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  statItem: {
    width: "50%",
    paddingVertical: 8,
  },
  statValue: {
    fontSize: 28,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 13,
    marginTop: 2,
  },
  statsSubsection: {
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 12,
  },
  statsSubsectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: "row",
    gap: 24,
  },
  statsRowItem: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  statsRowValue: {
    fontSize: 24,
    fontWeight: "700",
  },
  statsRowLabel: {
    fontSize: 13,
  },
  progressBars: {
    gap: 8,
  },
  progressBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  progressBarLabel: {
    width: 70,
    fontSize: 13,
  },
  progressBarBg: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  progressBarValue: {
    width: 40,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "right",
  },
  sentimentRow: {
    flexDirection: "row",
    gap: 8,
  },
  sentimentItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  sentimentCount: {
    fontSize: 15,
    fontWeight: "600",
  },
  actionStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  actionStatItem: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  actionStatValue: {
    fontSize: 24,
    fontWeight: "700",
  },
  actionStatLabel: {
    fontSize: 13,
  },
  actionStatBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  actionStatBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  topTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  topTagItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 6,
  },
  topTagName: {
    fontSize: 13,
    fontWeight: "500",
  },
  topTagCount: {
    fontSize: 12,
    fontWeight: "600",
  },
});

const meta: Meta<typeof SettingsStats> = {
  title: "Settings/Stats",
  component: SettingsStats,
  decorators: [
    (Story: ComponentType) => (
      <View style={{ flex: 1, backgroundColor: "#f5f5f5", paddingTop: 20 }}>
        <Story />
      </View>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SettingsStats>;

const emptyStats: StatsData = {
  totalRecordings: 0,
  totalDuration: 0,
  transcribedCount: 0,
  summarizedCount: 0,
  thisWeekCount: 0,
  thisWeekDuration: 0,
  sentimentCounts: { positive: 0, neutral: 0, negative: 0 },
  topTags: [],
  pendingActions: 0,
  highPriorityActions: 0,
  transcriptionRate: 0,
  summarizationRate: 0,
};

export const EmptyStats: Story = {
  args: {
    stats: emptyStats,
  },
};

export const BasicStatsOnly: Story = {
  args: {
    stats: {
      ...emptyStats,
      totalRecordings: 15,
      totalDuration: 3600,
      transcribedCount: 12,
      summarizedCount: 8,
      thisWeekCount: 5,
      thisWeekDuration: 1200,
      transcriptionRate: 80,
      summarizationRate: 67,
    },
  },
};

export const WithSentiment: Story = {
  args: {
    stats: {
      ...emptyStats,
      totalRecordings: 25,
      totalDuration: 7200,
      transcribedCount: 20,
      summarizedCount: 18,
      thisWeekCount: 8,
      thisWeekDuration: 2400,
      transcriptionRate: 80,
      summarizationRate: 90,
      sentimentCounts: { positive: 12, neutral: 6, negative: 2 },
    },
  },
};

export const WithActionItems: Story = {
  args: {
    stats: {
      ...emptyStats,
      totalRecordings: 30,
      totalDuration: 9000,
      transcribedCount: 28,
      summarizedCount: 25,
      thisWeekCount: 10,
      thisWeekDuration: 3000,
      transcriptionRate: 93,
      summarizationRate: 89,
      pendingActions: 7,
      highPriorityActions: 2,
    },
  },
};

export const WithTopTags: Story = {
  args: {
    stats: {
      ...emptyStats,
      totalRecordings: 50,
      totalDuration: 18000,
      transcribedCount: 45,
      summarizedCount: 40,
      thisWeekCount: 12,
      thisWeekDuration: 4200,
      transcriptionRate: 90,
      summarizationRate: 89,
      topTags: [
        { name: "会議", count: 15 },
        { name: "アイデア", count: 12 },
        { name: "タスク", count: 8 },
        { name: "メモ", count: 7 },
        { name: "重要", count: 5 },
      ],
    },
  },
};

export const FullStats: Story = {
  args: {
    stats: {
      totalRecordings: 100,
      totalDuration: 36000,
      transcribedCount: 95,
      summarizedCount: 90,
      thisWeekCount: 20,
      thisWeekDuration: 7200,
      transcriptionRate: 95,
      summarizationRate: 95,
      sentimentCounts: { positive: 45, neutral: 35, negative: 10 },
      topTags: [
        { name: "会議", count: 30 },
        { name: "アイデア", count: 25 },
        { name: "タスク", count: 20 },
        { name: "メモ", count: 15 },
        { name: "重要", count: 10 },
      ],
      pendingActions: 12,
      highPriorityActions: 3,
    },
  },
};

export const ProgressBarEdgeCases: Story = {
  args: {
    stats: {
      ...emptyStats,
      totalRecordings: 10,
      totalDuration: 600,
      transcribedCount: 10,
      summarizedCount: 10,
      thisWeekCount: 2,
      thisWeekDuration: 120,
      transcriptionRate: 100,
      summarizationRate: 100,
    },
  },
};

export const ProgressBarZero: Story = {
  args: {
    stats: {
      ...emptyStats,
      totalRecordings: 10,
      totalDuration: 600,
      transcribedCount: 0,
      summarizedCount: 0,
      thisWeekCount: 2,
      thisWeekDuration: 120,
      transcriptionRate: 0,
      summarizationRate: 0,
    },
  },
};
