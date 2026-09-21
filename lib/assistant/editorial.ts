export function splitEditorial(message: string): { title: string; body?: string } {
  const trimmed = message.trim();
  if (!trimmed) return { title: "" };
  const match = trimmed.match(/^(.+?[.!?])(?:\s+([\s\S]+))?$/);
  if (!match?.[1]) return { title: trimmed };
  const body = match[2]?.trim();
  return body ? { title: match[1], body } : { title: match[1] };
}
