function normalize(text: string): string {
  return text.toLowerCase().replace(/[’']/g, "'").trim();
}

export function titleFromRequest(text: string): string | undefined {
  const raw = text.trim().replace(/[.?!]+$/, "");
  const quoted = raw.match(/[“"]([^”"]+)[”"]/);
  if (quoted?.[1]?.trim()) return quoted[1].trim();

  const scheduled = raw.match(/^(?:please\s+)?(?:schedule|add|book|create|put)\s+(.+)$/i);
  if (!scheduled?.[1]) return undefined;
  const rest = scheduled[1]
    .replace(/\s+(?:tomorrow|today|tonight)\b[\s\S]*$/i, "")
    .replace(/\s+on\s+[a-z]+(?:\s+\d{1,2})?[\s\S]*$/i, "")
    .replace(/\s+at\s+\d[\s\S]*$/i, "")
    .replace(/\s+for\s+\d[\s\S]*$/i, "")
    .replace(/\s+from\s+\d[\s\S]*$/i, "")
    .replace(/^(?:a|an|the)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!rest || rest.length < 2) return undefined;
  if (normalize(rest) === normalize(raw)) return undefined;
  if (/^(training|workout|event|something|it)$/i.test(rest)) return undefined;
  return rest;
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
  return title.trim();
}
