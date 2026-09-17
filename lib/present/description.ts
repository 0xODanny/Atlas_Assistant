const BOILERPLATE =
  /to see detailed information for automatically created events|g\.co\/calendar|automatically created event/i;

export function sanitizeListCopy(text: string | undefined): string | undefined {
  if (!text?.trim()) return undefined;
  const withoutUrls = text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\bg\.co\/\S+/gi, " ")
    .replace(BOILERPLATE, " ")
    .replace(/\b(visit|see|click|details|automatically created events?)\b/gi, " ")
    .replace(/^[\s,.;:–—-]+|[\s,.;:–—-]+$/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:]+|[\s,.;:]+$/g, "")
    .trim();
  if (!withoutUrls || withoutUrls.length < 12) return undefined;
  if (withoutUrls.length > 90) return undefined;
  if (/^(and also|and|also|or|to|for|the|a|an)$/i.test(withoutUrls)) return undefined;
  return withoutUrls;
}

export function descriptionSegments(text: string): Array<{ type: "text" | "link"; value: string }> {
  const parts = text.split(/(https?:\/\/[^\s]+)/gi);
  return parts
    .filter(Boolean)
    .map((part) =>
      /^https?:\/\//i.test(part) ? { type: "link" as const, value: part } : { type: "text" as const, value: part },
    );
}
