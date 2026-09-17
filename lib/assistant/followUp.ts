import type { AssistantChoice } from "../types/assistant";

export function resolveChoiceFromText(
  text: string,
  choices: AssistantChoice[],
): AssistantChoice | undefined {
  if (!choices.length) return undefined;
  const raw = text.toLowerCase().replace(/[’']/g, "'").trim();
  if (!raw) return undefined;

  if (/\b(first|earliest)\b/.test(raw)) return choices[0];
  if (/\bsecond\b/.test(raw) && choices[1]) return choices[1];
  if (/\bthird\b/.test(raw) && choices[2]) return choices[2];
  if (/\b(evening|night)\b/.test(raw)) {
    return (
      [...choices].reverse().find((choice) => /\b([6-9]|1[0-1])(?::\d{2})?\s*PM\b/i.test(choice.label)) ??
      [...choices].reverse().find((choice) => /\bPM\b/i.test(choice.label) && !/\bAM\b/i.test(choice.label.split("–")[0] ?? ""))
    );
  }
  if (/\b(last|latest)\b/.test(raw)) return choices[choices.length - 1];
  if (/\bafternoon\b/.test(raw)) {
    return [...choices].reverse().find((choice) => /PM/i.test(choice.label) && !/6:|7:|8:|9:/.test(choice.label))
      ?? choices[Math.min(1, choices.length - 1)];
  }
  if (/\bmorning\b/.test(raw)) return choices[0];

  const clock = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (clock) {
    const needle = `${Number(clock[1])}:${clock[2] ?? "00"} ${clock[3].toLowerCase()}`;
    const compact = needle.replace(":00", "");
    return choices.find((choice) => {
      const label = choice.label.toLowerCase();
      return label.includes(needle) || label.includes(compact);
    });
  }

  return undefined;
}
