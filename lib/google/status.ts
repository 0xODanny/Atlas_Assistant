import type { ConnectionState } from "../types/profile";
import { googleOAuthConfigured, hasWriteScope } from "./config";
import type { CalendarCredentialStore } from "./credentials";

export type GooglePublicStatus = {
  configured: boolean;
  writeEnabled: boolean;
  connection: ConnectionState;
};

export async function publicGoogleStatus(
  store: CalendarCredentialStore,
  connection?: ConnectionState,
): Promise<GooglePublicStatus> {
  const credential = await store.get();
  if (!credential) {
    return {
      configured: googleOAuthConfigured(),
      writeEnabled: false,
      connection: connection ?? { status: "disconnected" },
    };
  }
  return {
    configured: googleOAuthConfigured(),
    writeEnabled: hasWriteScope(credential.scope),
    connection: {
      status: connection?.status ?? "connected",
      email: credential.email || connection?.email,
      lastSyncedAt: connection?.lastSyncedAt,
      syncError: connection?.syncError,
      calendars: connection?.calendars,
    },
  };
}
