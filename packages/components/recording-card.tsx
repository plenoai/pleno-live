import React, { useRef, useCallback } from "react";
import {
  Text,
  View,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  Animated as RNAnimated,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";

import { Haptics } from "@/packages/platform";
import { IconSymbol } from "@/packages/components/ui/icon-symbol";
import { Badge } from "@/packages/components/ui/badge";
import { Card } from "@/packages/components/ui/card";
import { useColors } from "@/packages/hooks/use-colors";
import { Recording } from "@/packages/types/recording";

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  } else if (days === 1) {
    return "昨日";
  } else if (days < 7) {
    return `${days}日前`;
  } else {
    return date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
  }
}

type StatusVariant = "muted" | "warning" | "success" | "primary" | "error" | "secondary";

function getStatusInfo(status: Recording["status"]): { text: string; variant: StatusVariant } {
  switch (status) {
    case "recording":
      return { text: "録音中", variant: "error" };
    case "saved":
      return { text: "保存済み", variant: "muted" };
    case "transcribing":
      return { text: "文字起こし中", variant: "warning" };
    case "transcribed":
      return { text: "文字起こし完了", variant: "success" };
    case "analyzing":
      return { text: "分析中", variant: "warning" };
    case "analyzed":
      return { text: "分析済", variant: "primary" };
    default:
      return { text: "", variant: "muted" };
  }
}

export interface RecordingCardProps {
  recording: Recording;
  onPress: () => void;
  onDelete: () => void;
  columns: number;
  isSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: () => void;
}

export const RecordingCard = React.memo(function RecordingCard({
  recording,
  onPress,
  onDelete,
  columns,
  isSelectMode = false,
  isSelected = false,
  onToggleSelection,
}: RecordingCardProps) {
  const colors = useColors();
  const statusInfo = getStatusInfo(recording.status);
  const swipeableRef = useRef<Swipeable>(null);

  const handleLongPress = useCallback(() => {
    if (isSelectMode) return;
    Haptics.impact('medium');
    Alert.alert("削除確認", `「${recording.title}」を削除しますか？`, [
      { text: "キャンセル", style: "cancel" },
      { text: "削除", style: "destructive", onPress: onDelete },
    ]);
  }, [recording.title, onDelete, isSelectMode]);

  const handlePress = useCallback(() => {
    if (isSelectMode && onToggleSelection) {
      Haptics.impact('light');
      onToggleSelection();
    } else {
      onPress();
    }
  }, [isSelectMode, onToggleSelection, onPress]);

  const handleDelete = useCallback(() => {
    Haptics.impact('medium');
    Alert.alert("削除確認", `「${recording.title}」を削除しますか？`, [
      { text: "キャンセル", style: "cancel", onPress: () => swipeableRef.current?.close() },
      { text: "削除", style: "destructive", onPress: onDelete },
    ]);
  }, [recording.title, onDelete]);

  const renderRightActions = (
    progress: RNAnimated.AnimatedInterpolation<number>,
    dragX: RNAnimated.AnimatedInterpolation<number>
  ) => {
    const translateX = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [0, 80],
      extrapolate: "clamp",
    });

    const opacity = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    });

    return (
      <RNAnimated.View
        style={[
          styles.deleteAction,
          {
            opacity,
            transform: [{ translateX }],
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.deleteButton, { backgroundColor: colors.error }]}
          onPress={handleDelete}
          activeOpacity={0.8}
        >
          <IconSymbol name="trash.fill" size={22} color="#FFFFFF" />
          <Text style={styles.deleteText}>削除</Text>
        </TouchableOpacity>
      </RNAnimated.View>
    );
  };

  const cardContent = (
    <Card
      variant="interactive"
      onPress={handlePress}
      onLongPress={handleLongPress}
      selected={isSelected}
      style={styles.card}
    >
      <View style={styles.cardHeader}>
        {isSelectMode && (
          <View style={[
            styles.checkbox,
            {
              backgroundColor: isSelected ? colors.primary : "transparent",
              borderColor: isSelected ? colors.primary : colors.muted,
            }
          ]}>
            {isSelected && (
              <IconSymbol name="checkmark" size={14} color="#FFFFFF" />
            )}
          </View>
        )}
        <Text style={[styles.cardTitle, { color: colors.foreground }, isSelectMode && styles.cardTitleWithCheckbox]} numberOfLines={1}>
          {recording.title}
        </Text>
        <Badge variant={statusInfo.variant}>
          {statusInfo.text}
        </Badge>
      </View>

      <View style={styles.cardMeta}>
        <View style={styles.metaItem}>
          <IconSymbol name="clock.fill" size={14} color={colors.muted} />
          <Text style={[styles.metaText, { color: colors.muted }]}>
            {formatDuration(recording.duration)}
          </Text>
        </View>
        <Text style={[styles.metaText, { color: colors.muted }]}>
          {formatDate(recording.createdAt)}
        </Text>
      </View>

      {(recording.highlights.length > 0 || recording.actionItems.length > 0 || recording.keywords.length > 0) && (
        <View style={styles.metadataRow}>
          {recording.highlights.length > 0 && (
            <View style={styles.metadataItem}>
              <IconSymbol name="star.fill" size={12} color={colors.warning} />
              <Text style={[styles.metadataCount, { color: colors.warning }]}>
                {recording.highlights.length}
              </Text>
            </View>
          )}
          {recording.actionItems.length > 0 && (
            <View style={styles.metadataItem}>
              <IconSymbol name="checkmark" size={12} color={colors.success} />
              <Text style={[styles.metadataCount, { color: colors.success }]}>
                {recording.actionItems.filter(a => !a.completed).length}/{recording.actionItems.length}
              </Text>
            </View>
          )}
          {recording.keywords.length > 0 && (
            <View style={styles.metadataItem}>
              <IconSymbol name="doc.text.fill" size={12} color={colors.primary} />
              <Text style={[styles.metadataCount, { color: colors.primary }]}>
                {recording.keywords.length}
              </Text>
            </View>
          )}
        </View>
      )}

      {recording.tags.length > 0 && (
        <View style={styles.tagsRow}>
          {recording.tags.slice(0, 3).map((tag) => (
            <Badge
              key={tag.id}
              variant="primary"
              size="sm"
            >
              {tag.name}
            </Badge>
          ))}
          {recording.tags.length > 3 && (
            <Text style={[styles.moreTagsText, { color: colors.muted }]}>
              +{recording.tags.length - 3}
            </Text>
          )}
        </View>
      )}

      {recording.transcript && (
        <Text style={[styles.preview, { color: colors.muted }]} numberOfLines={2}>
          {recording.transcript.text.substring(0, 100)}...
        </Text>
      )}
    </Card>
  );

  if (Platform.OS === "web") {
    return cardContent;
  }

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootRight={false}
      friction={2}
    >
      {cardContent}
    </Swipeable>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.recording.id === nextProps.recording.id &&
    prevProps.recording.status === nextProps.recording.status &&
    prevProps.recording.title === nextProps.recording.title &&
    prevProps.recording.duration === nextProps.recording.duration &&
    prevProps.recording.highlights.length === nextProps.recording.highlights.length &&
    prevProps.recording.transcript?.text === nextProps.recording.transcript?.text &&
    prevProps.columns === nextProps.columns &&
    prevProps.isSelectMode === nextProps.isSelectMode &&
    prevProps.isSelected === nextProps.isSelected
  );
});

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "600",
    flex: 1,
    marginRight: 8,
  },
  cardTitleWithCheckbox: {
    marginLeft: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  cardMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 13,
  },
  metadataRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  metadataItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metadataCount: {
    fontSize: 12,
    fontWeight: "500",
  },
  preview: {
    fontSize: 13,
    marginTop: 8,
    lineHeight: 18,
  },
  deleteAction: {
    justifyContent: "center",
    alignItems: "flex-end",
    marginBottom: 12,
  },
  deleteButton: {
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    height: "100%",
    borderRadius: 8,
    gap: 4,
  },
  deleteText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  moreTagsText: {
    fontSize: 11,
    alignSelf: "center",
  },
});
