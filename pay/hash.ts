export async function postTextHash(postText: string): Promise<string> {
  const bytes = new TextEncoder().encode(postText);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function newOrderId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ord_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
}
