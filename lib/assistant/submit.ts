export function canSubmitAssistant(pending: boolean, text: string): boolean {
  return !pending && Boolean(text.trim());
}
