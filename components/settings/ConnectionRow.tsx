import type { ConnectionStatus } from "@/lib/types/profile";

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
    <div className="flex items-center justify-between gap-4 py-3">
      <p>{name}</p>
      <p className="text-sm text-[var(--muted)]">{label}</p>
    </div>
  );
}
