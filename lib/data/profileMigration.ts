import { normalizeProfileHours } from "../calendar/hours";
import type { UserProfile } from "../types/profile";

export const PROFILE_SCHEMA_VERSION = 1;
export const LEGACY_SEED_DISPLAY_NAME = "Daniel";
export const CURRENT_SEED_DISPLAY_NAME = "Danny";

const LEGACY_SEED_GOAL = "Protect one deep-work block each weekday";

export function isUneditedLegacySeedProfile(profile: UserProfile): boolean {
  if (typeof profile.schemaVersion === "number") return false;
  if (profile.id !== "user_local") return false;
  if (profile.displayName !== LEGACY_SEED_DISPLAY_NAME) return false;
  if (!profile.createdAt || profile.createdAt !== profile.updatedAt) return false;
  if (profile.morningBriefTime !== "07:15") return false;
  if (profile.privacyDefault !== "busy-only") return false;
  return profile.goals[0] === LEGACY_SEED_GOAL;
}

export function migrateProfile<T extends UserProfile>(profile: T): T {
  const normalized = normalizeProfileHours(profile);
  if ((normalized.schemaVersion ?? 0) >= PROFILE_SCHEMA_VERSION) {
    return normalized;
  }
  if (isUneditedLegacySeedProfile(profile)) {
    return {
      ...normalized,
      displayName: CURRENT_SEED_DISPLAY_NAME,
      schemaVersion: PROFILE_SCHEMA_VERSION,
    };
  }
  return {
    ...normalized,
    schemaVersion: PROFILE_SCHEMA_VERSION,
  };
}
