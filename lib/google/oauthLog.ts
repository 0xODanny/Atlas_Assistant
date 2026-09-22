export type GoogleOAuthLogCategory =
  | "state_mismatch"
  | "token_exchange_failed"
  | "credential_encrypt_failed"
  | "credential_persist_failed"
  | "credential_decrypt_failed";

const SECRET_PATTERN =
  /ya29\.|1\/\/[0-9A-Za-z_-]{8,}|access_token|refresh_token|client_secret|authorization.?code|ATLAS_CREDENTIAL_COOKIE_KEY/i;

export function googleOAuthFailureCategory(error: unknown): GoogleOAuthLogCategory {
  const message = error instanceof Error ? error.message : "";
  if (message === "credential_key_missing" || message === "credential_key_invalid" || message === "credential_encrypt_failed") {
    return "credential_encrypt_failed";
  }
  if (message === "credential_persist_failed") return "credential_persist_failed";
  if (message === "credential_decrypt_failed") return "credential_decrypt_failed";
  return "token_exchange_failed";
}

export function logGoogleOAuthFailure(category: GoogleOAuthLogCategory): void {
  console.info("[atlas/google-oauth]", { category });
}

export function oauthLogContainsSecrets(value: unknown): boolean {
  try {
    return SECRET_PATTERN.test(JSON.stringify(value));
  } catch {
    return false;
  }
}
