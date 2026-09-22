import { MaterialIcons, type MaterialIconName } from "./ui/material-icons";

/** Web landing/legal pages用のアイコン。アプリ本体と同じMaterialIconsを使い、追加依存を増やさない。 */
export function WebIcon({
  name,
  size = 20,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <MaterialIcons name={name as MaterialIconName} size={size} className={className} />
  );
}
