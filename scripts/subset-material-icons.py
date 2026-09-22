#!/usr/bin/env python3
"""MaterialIcons font + glyphmap regeneration limited to glyphs actually used by the app.

Usage (after adding an icon):
  1. Add the MaterialIcons name you want to USE_NAMES
     (check names in the Material Icons section of https://icons.expo.fyi)
  2. Run: python3 scripts/subset-material-icons.py
  3. Verify these files are updated:
     - assets/fonts/MaterialIcons.ttf   (subset font)
     - packages/lib/material-icons.json (name -> glyph map)

Requires: pyftsubset (pip install fonttools)
"""

import io
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GLYPHMAP_SRC = os.path.join(
    ROOT,
    "node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialIcons.json",
)
FONT_SRC = os.path.join(
    ROOT,
    "node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialIcons.ttf",
)
FONT_OUT = os.path.join(ROOT, "assets/fonts/MaterialIcons.ttf")
GLYPHMAP_OUT = os.path.join(ROOT, "packages/lib/material-icons.json")

# Values of MAPPING in packages/components/ui/icon-symbol.tsx plus names used by
# packages/components/web-icon.tsx. Add new names here and rerun this script.
USE_NAMES = [
    "home",
    "send",
    "code",
    "chevron-right",
    "mic",
    "settings",
    "play-arrow",
    "pause",
    "stop",
    "graphic-eq",
    "description",
    "chat",
    "error",
    "star",
    "delete",
    "share",
    "search",
    "shield",
    "close",
    "check",
    "add",
    "remove",
    "arrow-back",
    "bolt",
    "schedule",
    "folder",
    "info",
    "warning",
    "mood",
    "sentiment-neutral",
    "mood-bad",
    "grid-view",
    "view-list",
    "calendar-today",
    "mail",
    "check-circle",
    "cancel",
]


def main() -> int:
    with open(GLYPHMAP_SRC, encoding="utf-8") as f:
        glyphmap = json.load(f)

    # Regression guard: any material icon name used as a literal `icon: "x"`
    # in app/packages must be in USE_NAMES.
    used = sorted({
        m.group(1)
        for root in (os.path.join(ROOT, "app"), os.path.join(ROOT, "packages"))
        for dirpath, _, files in os.walk(root)
        for fn in files
        if fn.endswith((".ts", ".tsx", ".js", ".jsx"))
        for line in io.open(os.path.join(dirpath, fn), encoding="utf-8", errors="ignore")
        for m in re.finditer(r'icon\s*:\s*"([a-z0-9-]+)"', line)
    })
    used_missing = [n for n in used if n in glyphmap and n not in USE_NAMES]
    if used_missing:
        print(f"error: used icon names not in USE_NAMES: {used_missing}", file=sys.stderr)
        return 1

    missing = [n for n in USE_NAMES if n not in glyphmap]
    if missing:
        print(f"error: names missing from glyphmap: {missing}", file=sys.stderr)
        return 1

    subset = {n: glyphmap[n] for n in USE_NAMES}
    # Keep fallback '?' (U+003F) for unknown names.
    codepoints = sorted(set(subset.values()) | {0x3F})
    unicode_arg = ",".join(f"U+{c:04X}" for c in codepoints)

    os.makedirs(os.path.dirname(FONT_OUT), exist_ok=True)
    result = subprocess.run(
        [
            "pyftsubset",
            FONT_SRC,
            f"--output-file={FONT_OUT}",
            f"--unicodes={unicode_arg}",
            "--layout-features=",
            "--no-hinting",
            "--desubroutinize",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(result.stderr, file=sys.stderr)
        return 1

    with open(GLYPHMAP_OUT, "w", encoding="utf-8") as f:
        json.dump(subset, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")

    print(f"ok: ttf={os.path.getsize(FONT_OUT)} bytes, glyphmap={len(subset)} names")
    return 0


if __name__ == "__main__":
    sys.exit(main())
