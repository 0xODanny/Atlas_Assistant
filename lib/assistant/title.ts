function normalize(text: string): string {
  return text.toLowerCase().replace(/[’']/g, "'").trim();
}

export function titleFromRequest(text: string): string | undefined {
  const raw = text.trim().replace(/[.?!]+$/, "");
  const quoted = raw.match(/[“"]([^”"]+)[”"]/);
  if (quoted?.[1]?.trim()) return quoted[1].trim();

  const scheduled = raw.match(/^(?:please\s+)?(?:schedule|add|book|create|put)\s+(.+)$/i);
  if (!scheduled?.[1]) return undefined;
  const rest = stripScheduleLanguage(scheduled[1]);
  if (!rest || rest.length < 2) return undefined;
  if (normalize(rest) === normalize(raw)) return undefined;
  if (/^(training|workout|event|something|it)$/i.test(rest)) return undefined;
  return namedActivityTitle(rest) ?? sportOnlyTitle(rest) ?? rest;
}

const NAMED_ACTIVITIES: Record<string, string> = {
  yoga: "Yoga",
  pilates: "Pilates",
  meditation: "Meditation",
  stretching: "Stretching",
};

function namedActivityTitle(rest: string): string | undefined {
  const match = rest.match(/\b(yoga|pilates|meditation|stretching)\b/i);
  if (!match?.[1]) return undefined;
  return NAMED_ACTIVITIES[match[1].toLowerCase()];
}

function sportOnlyTitle(rest: string): string | undefined {
  const match = rest.match(/^(?:\d+[-\s]*(?:minutes?|hours?|mins?|hrs?)\s+)?(swim|bike|run|ride|strength|recovery|workout)$/i);
  if (!match?.[1]) return undefined;
  const sport = match[1].toLowerCase();
  if (sport === "ride") return "Bike";
  if (sport === "workout") return undefined;
  return sport.charAt(0).toUpperCase() + sport.slice(1);
}

export function stripDanglingScheduleTokens(title: string): string {
  return title
    .replace(/\s+(?:for|at|on|from|tonight|today|tomorrow)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripScheduleLanguage(text: string): string {
  return text
    .replace(/\s+for\s+(?:tonight|today|tomorrow|this\s+(?:morning|afternoon|evening))\b[\s\S]*$/i, "")
    .replace(/\s+(?:tomorrow|today|tonight)\b[\s\S]*$/i, "")
    .replace(/\s+this\s+(?:morning|afternoon|evening)\b[\s\S]*$/i, "")
    .replace(/\s+on\s+[a-z]+(?:\s+\d{1,2})?[\s\S]*$/i, "")
    .replace(/\s+at\s+\d[\s\S]*$/i, "")
    .replace(/\s+for\s+\d[\s\S]*$/i, "")
    .replace(/\s+from\s+\d[\s\S]*$/i, "")
    .replace(/\s+(?:for|at|on|from)\s*$/i, "")
    .replace(/^(?:a|an|the)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeEventTitle(title: string | undefined, userText: string): string | undefined {
  const extracted = titleFromRequest(userText);
  if (!title?.trim()) return extracted;
  const normalizedTitle = normalize(title);
  const normalizedUser = normalize(userText);
  if (extracted && normalize(extracted) === normalizedTitle) return extracted;
  if (normalizedTitle === normalizedUser) return extracted ?? title.trim();
  if (normalizedUser.startsWith(normalizedTitle) && /schedule|tomorrow|minutes|at\s+\d/i.test(title)) {
    return extracted ?? title.trim();
  }
  if (/schedule .+ at \d/i.test(title) || /for \d+ min/i.test(title)) return extracted ?? title.trim();
  const cleaned = stripDanglingScheduleTokens(title);
  if (extracted && /(?:\s|^)(for|at|on|from)$/i.test(title)) return extracted;
  return cleaned || title.trim();
}
