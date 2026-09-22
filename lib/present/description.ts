const BOILERPLATE =
  /to see detailed information for automatically created events|g\.co\/calendar|automatically created event/i;

const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X" ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITY_MAP[entity.toLowerCase()] ?? match;
  });
}

export function normalizeEventDescription(text: string | undefined): string {
  if (!text?.trim()) return "";
  let value = decodeHtmlEntities(text);
  value = value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  value = value.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  value = value.replace(/<br\b[^>]*\/?>/gi, "\n");
  value = value.replace(/<\/(p|div|li|h[1-6]|tr|blockquote|section)>/gi, "\n");
  value = value.replace(/<\/?[a-zA-Z][^>]*>/g, "");
  value = decodeHtmlEntities(value);
  value = value.replace(/\u00a0/g, " ");
  value = value.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n");
  value = value.replace(/\n{3,}/g, "\n\n");
  return value.trim();
}

export function sanitizeListCopy(text: string | undefined): string | undefined {
  if (!text?.trim()) return undefined;
  const withoutUrls = normalizeEventDescription(text)
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
  const parts = normalizeEventDescription(text).split(/(https?:\/\/[^\s]+)/gi);
  return parts
    .filter(Boolean)
    .map((part) =>
      /^https?:\/\//i.test(part) ? { type: "link" as const, value: part } : { type: "text" as const, value: part },
    );
}
