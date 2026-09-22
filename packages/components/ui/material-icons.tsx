import createIconSet from "@expo/vector-icons/build/createIconSet";

import glyphMap from "../../lib/material-icons.json";

// アプリで実際に使うグリフだけに絞った MaterialIcons（scripts/subset-material-icons.py で再生成）。
// fontFamily 名はオリジナルと同じ "material" を保ち、既存の fontFamily 指定と互換にする。
// 未知の名前はフォールバック '?' になる。
const font = require("@/assets/fonts/MaterialIcons.ttf");

export const MaterialIcons = createIconSet(glyphMap, "material", font);
export type MaterialIconName = keyof typeof glyphMap;

