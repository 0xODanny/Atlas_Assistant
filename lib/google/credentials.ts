import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { CREDENTIAL_STORE_PATH, resolveCredentialStoreKind } from "./config";

export type CalendarCredential = {
  provider: "google";
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope?: string;
  email?: string;
  tokenType?: string;
};

export interface CalendarCredentialStore {
  get(provider?: "google"): Promise<CalendarCredential | null>;
  set(credential: CalendarCredential): Promise<void>;
  clear(provider?: "google"): Promise<void>;
}

export function createMemoryCredentialStore(
  initial?: CalendarCredential | null,
): CalendarCredentialStore {
  let current = initial ?? null;
  return {
    async get() {
      return current;
    },
    async set(credential) {
      current = credential;
    },
    async clear() {
      current = null;
    },
  };
}

export function createFileCredentialStore(
  filePath = CREDENTIAL_STORE_PATH,
): CalendarCredentialStore {
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);

  async function read(): Promise<CalendarCredential | null> {
    try {
      const raw = await readFile(resolved, "utf8");
      const parsed = JSON.parse(raw) as CalendarCredential;
      if (!parsed?.accessToken) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  return {
    async get() {
      return read();
    },
    async set(credential) {
      await mkdir(path.dirname(resolved), { recursive: true });
      await writeFile(resolved, JSON.stringify(credential, null, 2), { mode: 0o600 });
    },
    async clear() {
      try {
        await unlink(resolved);
      } catch {
        // already empty
      }
    },
  };
}

let defaultStore: CalendarCredentialStore | undefined;

export function defaultCredentialStore(): CalendarCredentialStore {
  if (defaultStore) return defaultStore;
  if (resolveCredentialStoreKind() === "cookie") {
    throw new Error("cookie_credential_store_requires_request");
  }
  defaultStore = createFileCredentialStore();
  return defaultStore;
}

export function setDefaultCredentialStore(store: CalendarCredentialStore | undefined): void {
  defaultStore = store;
}
