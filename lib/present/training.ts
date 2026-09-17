import type { UserProfile } from "../types/profile";

export function trainingPriorityLabel(profile: UserProfile): string | undefined {
  const raw = profile.trainingPreferences.goal?.trim();
  if (!raw) return undefined;
  const match = raw.match(/^I am training for (?:a |an )?(.+?)\.?$/i);
  if (match?.[1]) return match[1].replace(/\s+preparation$/i, "").trim();
  return raw.replace(/\.$/, "");
}

export function trainingGoalCopy(profile: UserProfile): string {
  const label = trainingPriorityLabel(profile);
  if (!label) return "";
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} training is a planning priority.`;
}

export function trainingPriorityReason(profile: UserProfile, hasScheduledTraining: boolean): string | undefined {
  if (!hasScheduledTraining) return undefined;
  const label = trainingPriorityLabel(profile);
  if (!label) return undefined;
  return `I'm leaving your scheduled ${label} training and its buffer in place.`;
}
