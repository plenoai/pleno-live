/**
 * 端末スペックに応じたローカル STT モデル推奨
 *
 * expo-device の RAM 情報と端末クラスを使って
 * 最適なモデルサイズを提案する
 */

import * as Device from "expo-device";
import { Platform } from "react-native";

export type ModelTier = "tiny" | "base" | "small";

export interface ModelRecommendation {
  tier: ModelTier;
  reason: string;
  /** 推定モデルサイズ (MB) */
  estimatedSizeMB: number;
}

/**
 * 端末の総 RAM (MB) を返す
 * 取得できない場合は undefined
 */
async function getDeviceRamMB(): Promise<number | undefined> {
  if (Platform.OS === "web") return undefined;
  try {
    const totalMemory = await Device.getMaxMemoryAsync();
    if (totalMemory && totalMemory > 0) {
      return totalMemory / (1024 * 1024); // bytes → MB
    }
  } catch {
    // フォールバック
  }
  return undefined;
}

/**
 * 端末スペックに基づいてモデルサイズを推奨する
 *
 * 推奨基準:
 * - RAM < 3GB   → tiny  (~40-150MB)
 * - RAM 3-5GB   → base  (~75-300MB)
 * - RAM > 5GB   → small (~150-500MB)
 */
export async function recommendModelTier(): Promise<ModelRecommendation> {
  const ramMB = await getDeviceRamMB();

  if (ramMB === undefined) {
    return {
      tier: "tiny",
      reason: "RAM 情報を取得できないため、最小モデルを推奨",
      estimatedSizeMB: 149,
    };
  }

  if (ramMB < 3 * 1024) {
    return {
      tier: "tiny",
      reason: `RAM ${Math.round(ramMB / 1024 * 10) / 10}GB（低スペック端末）`,
      estimatedSizeMB: 149,
    };
  }

  if (ramMB < 5 * 1024) {
    return {
      tier: "base",
      reason: `RAM ${Math.round(ramMB / 1024 * 10) / 10}GB（中スペック端末）`,
      estimatedSizeMB: 290,
    };
  }

  return {
    tier: "small",
    reason: `RAM ${Math.round(ramMB / 1024 * 10) / 10}GB（高スペック端末）`,
    estimatedSizeMB: 480,
  };
}
