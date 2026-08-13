/** Thin JSON-RPC proxy. Do not import @solana/web3.js or spl-token here (that 502'd invoice). */

function rpcTarget(): string {
  const key = typeof process.env.HELIUS_API_KEY === "string" ? process.env.HELIUS_API_KEY.trim() : "";
  const url = typeof process.env.HELIUS_RPC_URL === "string" ? process.env.HELIUS_RPC_URL.trim() : "";
  const raw = key || url;
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(raw)}`;
}

function rpcError(status: number, message: string): Response {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message }, id: null },
    { status },
  );
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return rpcError(405, "POST only.");
  }
  const target = rpcTarget();
  if (!target) {
    return rpcError(500, "RPC is not configured. Set HELIUS_API_KEY on the server.");
  }
  const body = await req.text();
  try {
    const upstream = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RPC proxy failed.";
    return rpcError(502, message);
  }
};
