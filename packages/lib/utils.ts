import { clsx, type ClassValue } from "clsx";

/**
 * Combines class names with clsx.
 * Base classes go first; callers append overrides.
 *
 * Usage:
 * ```tsx
 * cn("px-4 py-2", isActive && "bg-primary", className)
 * ```
 */
export function cn(...inputs: ClassValue[]) {
  // ponytail: tailwind-merge を削除（first-load common gzip 約 9KB 減）。現在の呼び出しに class 衝突はない。
  // 衝突（例: bg-background を bg-red-500 で上書き）が増えたら再導入して twMerge で包むこと。
  return clsx(...inputs);
}
