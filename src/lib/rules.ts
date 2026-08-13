/**
 * Draft check used in the UI and on the server.
 * Empty text and the X character limit only. No content denylist here.
 */
export type RuleId = "empty" | "length";

export type RuleHit = {
  id: RuleId;
  message: string;
};

export const MAX_CHARS = 280;

export function checkDraft(text: string): RuleHit[] {
  const hits: RuleHit[] = [];
  const trimmed = text.trim();

  if (!trimmed) {
    hits.push({ id: "empty", message: "Write the post first." });
    return hits;
  }

  if (trimmed.length > MAX_CHARS) {
    hits.push({ id: "length", message: `Keep it to ${MAX_CHARS} characters.` });
  }

  return hits;
}

export function isDraftClean(text: string): boolean {
  return checkDraft(text).length === 0;
}
