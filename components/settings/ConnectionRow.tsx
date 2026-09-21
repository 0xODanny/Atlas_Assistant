import type { ConnectionStatus } from "@/lib/types/profile";
import { SettingRow } from "../ui/SettingRow";

export function ConnectionRow({
  name,
  status,
  connectedLabel = "Connected",
  disconnectedLabel = "Not connected",
}: {
  name: string;
  status: ConnectionStatus;
  connectedLabel?: string;
  disconnectedLabel?: string;
}) {
  const label =
    status === "disconnected"
      ? disconnectedLabel
      : status === "connected"
        ? connectedLabel
        : status === "connecting"
          ? "Connecting"
          : "Connection error";
  return (
    <SettingRow
      label={name}
      value={label}
    />
  );
}
