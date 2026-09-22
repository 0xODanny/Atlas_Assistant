import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  CREDENTIAL_COOKIE,
  CREDENTIAL_COOKIE_HARD_LIMIT,
  CREDENTIAL_COOKIE_KEY_ENV,
  CREDENTIAL_COOKIE_SAFE_LIMIT,
} from "./config";
import type { CalendarCredential } from "./credentials";

export const CREDENTIAL_COOKIE_PREFIX = "v1.";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export type CredentialCookiePayloadV1 = {
  v: 1;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  tokenType?: string;
  scope?: string;
  email?: string;
};

export function parseCredentialCookieKey(raw: string | undefined): Buffer {
  const value = raw?.trim() ?? "";
  if (!value) throw new Error("credential_key_missing");
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, "hex");
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const key = Buffer.from(padded, "base64");
  if (key.length !== KEY_LENGTH) throw new Error("credential_key_invalid");
  return key;
}

export function resolveCredentialCookieKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  return parseCredentialCookieKey(env[CREDENTIAL_COOKIE_KEY_ENV]);
}

export function credentialToPayload(credential: CalendarCredential): CredentialCookiePayloadV1 {
  return {
    v: 1,
    accessToken: credential.accessToken,
    ...(credential.refreshToken ? { refreshToken: credential.refreshToken } : {}),
    expiresAt: credential.expiresAt,
    ...(credential.tokenType ? { tokenType: credential.tokenType } : {}),
    ...(credential.scope ? { scope: credential.scope } : {}),
    ...(credential.email ? { email: credential.email } : {}),
  };
}

export function payloadToCredential(payload: CredentialCookiePayloadV1): CalendarCredential {
  return {
    provider: "google",
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    expiresAt: payload.expiresAt,
    tokenType: payload.tokenType,
    scope: payload.scope,
    email: payload.email,
  };
}

export function encryptCredentialCookie(payload: CredentialCookiePayloadV1, key: Buffer): string {
  try {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const packed = Buffer.concat([iv, encrypted, cipher.getAuthTag()]);
    return `${CREDENTIAL_COOKIE_PREFIX}${packed.toString("base64url")}`;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("credential_")) throw error;
    throw new Error("credential_encrypt_failed");
  }
}

export function decryptCredentialCookie(value: string, key: Buffer): CredentialCookiePayloadV1 | null {
  try {
    if (!value.startsWith(CREDENTIAL_COOKIE_PREFIX)) return null;
    const packed = Buffer.from(value.slice(CREDENTIAL_COOKIE_PREFIX.length), "base64url");
    if (packed.length < IV_LENGTH + TAG_LENGTH + 1) return null;
    const iv = packed.subarray(0, IV_LENGTH);
    const tag = packed.subarray(packed.length - TAG_LENGTH);
    const ciphertext = packed.subarray(IV_LENGTH, packed.length - TAG_LENGTH);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const parsed = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")) as CredentialCookiePayloadV1;
    if (parsed?.v !== 1 || typeof parsed.accessToken !== "string" || !parsed.accessToken) return null;
    if (typeof parsed.expiresAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function measureCredentialCookieSize(input: {
  credential: CalendarCredential;
  key: Buffer;
}): {
  plaintextBytes: number;
  cookieValueBytes: number;
  cookieLineBytes: number;
  fitsSafeLimit: boolean;
  fitsHardLimit: boolean;
} {
  const payload = credentialToPayload(input.credential);
  const plaintextBytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  const cookieValue = encryptCredentialCookie(payload, input.key);
  const cookieValueBytes = Buffer.byteLength(cookieValue, "utf8");
  const cookieLine = `${CREDENTIAL_COOKIE}=${cookieValue}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=15552000`;
  const cookieLineBytes = Buffer.byteLength(cookieLine, "utf8");
  return {
    plaintextBytes,
    cookieValueBytes,
    cookieLineBytes,
    fitsSafeLimit: cookieLineBytes <= CREDENTIAL_COOKIE_SAFE_LIMIT,
    fitsHardLimit: cookieLineBytes <= CREDENTIAL_COOKIE_HARD_LIMIT,
  };
}
