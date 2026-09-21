import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { mergeGoogleConnection } from "../lib/calendar/destination";
import { normalizeProfileHours } from "../lib/calendar/hours";
import { createMemoryStore } from "../lib/data/memory-store";
import {
  CURRENT_SEED_DISPLAY_NAME,
  isUneditedLegacySeedProfile,
  migrateProfile,
  PROFILE_SCHEMA_VERSION,
} from "../lib/data/profileMigration";
import { createSeedState } from "../lib/data/seed";
import { deserializeState, serializeState } from "../lib/data/serialize";
import { createProfileRepository } from "../lib/repositories/profile";

const ROOT = join(process.cwd());
const NOW = new Date("2026-09-21T16:00:00.000Z");

function legacySeedProfile() {
  const seed = createSeedState(NOW);
  return {
    ...seed.profile,
    displayName: "Daniel",
    schemaVersion: undefined,
    createdAt: seed.profile.createdAt,
    updatedAt: seed.profile.createdAt,
  };
}

test("unedited legacy seed migrates Daniel to Danny once", () => {
  const legacy = legacySeedProfile();
  assert.equal(isUneditedLegacySeedProfile(legacy), true);
  const first = migrateProfile(legacy);
  assert.equal(first.displayName, CURRENT_SEED_DISPLAY_NAME);
  assert.equal(first.schemaVersion, PROFILE_SCHEMA_VERSION);
  const second = migrateProfile({ ...first, displayName: "Daniel" });
  assert.equal(second.displayName, "Daniel");
  assert.equal(second.schemaVersion, PROFILE_SCHEMA_VERSION);
});

test("a current-version profile saved as Daniel remains Daniel after reload", () => {
  const seed = createSeedState(NOW);
  const stored = {
    ...seed,
    profile: { ...seed.profile, displayName: "Daniel", schemaVersion: PROFILE_SCHEMA_VERSION },
  };
  const reloaded = deserializeState(serializeState(stored));
  assert.ok(reloaded);
  assert.equal(reloaded.profile.displayName, "Daniel");
  const repo = createProfileRepository(createMemoryStore(reloaded));
  repo.updateProfile({ displayName: "Daniel" });
  assert.equal(repo.getProfile().displayName, "Daniel");
});

test("Danny remains Danny after reload", () => {
  const seed = createSeedState(NOW);
  assert.equal(seed.profile.displayName, "Danny");
  const reloaded = deserializeState(serializeState(seed));
  assert.ok(reloaded);
  assert.equal(reloaded.profile.displayName, "Danny");
});

test("an unrelated name remains unchanged", () => {
  const seed = createSeedState(NOW);
  const stored = {
    ...seed,
    profile: { ...seed.profile, displayName: "Marcus", schemaVersion: undefined },
  };
  const migrated = migrateProfile(stored.profile);
  assert.equal(migrated.displayName, "Marcus");
  const reloaded = deserializeState(serializeState(stored));
  assert.ok(reloaded);
  assert.equal(reloaded.profile.displayName, "Marcus");
});

test("normalizeProfileHours never rewrites the preferred name", () => {
  const seed = createSeedState(NOW);
  assert.equal(normalizeProfileHours({ ...seed.profile, displayName: "Daniel" }).displayName, "Daniel");
  assert.equal(normalizeProfileHours({ ...seed.profile, displayName: "Danny" }).displayName, "Danny");
  assert.equal(normalizeProfileHours({ ...seed.profile, displayName: "Alex" }).displayName, "Alex");
});

test("an edited Daniel profile is not treated as the legacy seed", () => {
  const edited = {
    ...legacySeedProfile(),
    updatedAt: "2026-09-21T18:00:00.000Z",
  };
  assert.equal(isUneditedLegacySeedProfile(edited), false);
  assert.equal(migrateProfile(edited).displayName, "Daniel");
});

test("Google connection refresh does not overwrite a user-edited preferred name", () => {
  const seed = createSeedState(NOW);
  const store = createMemoryStore({
    ...seed,
    profile: { ...seed.profile, displayName: "Daniel", schemaVersion: PROFILE_SCHEMA_VERSION },
  });
  const current = store.getState();
  store.setState({
    ...current,
    connections: {
      ...current.connections,
      google: mergeGoogleConnection(current.connections.google, {
        status: "connected",
        email: "copicatxyz@gmail.com",
        lastSyncedAt: NOW.toISOString(),
      }),
    },
  });
  assert.equal(store.getState().profile.displayName, "Daniel");
  const provider = readFileSync(join(ROOT, "lib/state/provider.tsx"), "utf8");
  assert.match(provider, /displayName:\s*current\.profile\.displayName/);
  assert.doesNotMatch(provider, /displayName:\s*(data|connection|email)/);
  const hours = readFileSync(join(ROOT, "lib/calendar/hours.ts"), "utf8");
  assert.doesNotMatch(hours, /displayName === "Daniel"/);
});
