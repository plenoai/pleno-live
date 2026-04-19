import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/packages/hooks/use-colors";
import { FontSize, FontWeight, ScreenPadding } from "@/packages/constants/layout";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Optional action(s) rendered on the trailing edge of the header row. */
  action?: ReactNode;
  /**
   * Override the default screen horizontal padding. Useful for wide layouts
   * where the body padding differs from the default.
   */
  horizontalPadding?: number;
}

/**
 * Standard title header for tab screens.
 *
 * Unifies paddings, typography and layout so every top-level page
 * (record / notes / settings) looks visually consistent.
 */
export function PageHeader({ title, subtitle, action, horizontalPadding }: PageHeaderProps) {
  const colors = useColors();

  return (
    <View
      style={[
        styles.header,
        horizontalPadding !== undefined && { paddingHorizontal: horizontalPadding },
      ]}
    >
      <View style={styles.text}>
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: ScreenPadding.horizontal,
    paddingTop: ScreenPadding.headerTop,
    paddingBottom: ScreenPadding.headerBottom,
    gap: 12,
  },
  text: {
    flex: 1,
  },
  title: {
    fontSize: FontSize["5xl"],
    fontWeight: FontWeight.bold,
  },
  subtitle: {
    fontSize: FontSize.md,
    marginTop: 4,
  },
});
