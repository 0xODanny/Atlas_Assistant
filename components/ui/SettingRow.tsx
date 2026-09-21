import type { ReactNode } from "react";

export function SettingRow({
  label,
  value,
  control,
}: {
  label: string;
  value?: string;
  control?: ReactNode;
}) {
  return (
    <div className="setting-row" data-atlas-setting-row>
      <p className="setting-row-label">{label}</p>
      {control ? (
        <div className="setting-row-control">{control}</div>
      ) : (
        <p className="setting-row-value">{value}</p>
      )}
    </div>
  );
}
