import { normalizeProfileHours, resolveSchedulingHours, withUpdatedHours } from "../calendar/hours";
import type { StateStore } from "../data/state";
import type { Connections, HourKind, ScheduleHours, UserProfile } from "../types/profile";

export function createProfileRepository(store: StateStore) {
  return {
    getProfile(): UserProfile {
      return store.getState().profile;
    },
    getConnections(): Connections {
      return store.getState().connections;
    },
    updateProfile(patch: Partial<Omit<UserProfile, "id" | "createdAt">>): UserProfile {
      const state = store.getState();
      const merged = {
        ...state.profile,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      if (patch.workingHours && !patch.schedulingHours) {
        merged.schedulingHours = {
          ...resolveSchedulingHours(merged),
          focus: {
            ...resolveSchedulingHours(merged).focus,
            ...patch.workingHours,
            source: "user",
          },
        };
      }
      const profile = normalizeProfileHours(merged);
      store.setState({ ...state, profile });
      return profile;
    },
    updateScheduleHours(kind: HourKind, patch: Partial<ScheduleHours>): UserProfile {
      const state = store.getState();
      const schedulingHours = withUpdatedHours(resolveSchedulingHours(state.profile), kind, patch);
      return this.updateProfile({ schedulingHours });
    },
  };
}

export type ProfileRepository = ReturnType<typeof createProfileRepository>;
