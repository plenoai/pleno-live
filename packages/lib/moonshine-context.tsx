import { useMoonshineModel, type UseMoonshineModelReturn } from "@/packages/hooks/use-moonshine-model";

/**
 * Moonshine hook - 直接 useMoonshineModel を呼ぶ
 * 以前はグローバルProviderでラップしていたが、react-native-executorch の
 * ネイティブモジュール初期化がアプリ起動をクラッシュさせるため、
 * 必要な画面でのみ遅延ロードする設計に変更
 */
export function useMoonshine(): UseMoonshineModelReturn {
  return useMoonshineModel();
}
