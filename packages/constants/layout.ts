/**
 * Layout design tokens shared across screens.
 *
 * Use these constants instead of hardcoding px values so paddings, radii, and
 * typography remain consistent between pages.
 */

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

/**
 * Standard padding applied to the top-level container of a tab screen.
 * All tab pages share the same horizontal padding so content aligns visually.
 */
export const ScreenPadding = {
  horizontal: Spacing.xl,
  headerTop: Spacing.sm,
  headerBottom: Spacing.lg,
  /**
   * Bottom padding on scrollable lists inside tab screens.
   * Leaves clearance for the floating tab bar.
   */
  listBottom: 100,
} as const;

export const BorderRadius = {
  xs: 2,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  "2xl": 16,
  "3xl": 20,
  full: 9999,
} as const;

export const FontSize = {
  xs: 10,
  sm: 12,
  base: 13,
  md: 14,
  lg: 16,
  xl: 18,
  "2xl": 20,
  "3xl": 24,
  "4xl": 28,
  "5xl": 32,
  timer: 56,
} as const;

export const FontWeight = {
  normal: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;
