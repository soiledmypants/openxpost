import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import handleRpc from "./netlify/functions/rpc";
import { handleInvoice } from "./server/invoice-http";
import { handlePost } from "./server/post";
import { handleInvoicePaid } from "./server/status-http";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

function attach(use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void): void {
  use((req, res, next) => {
    const path = req.url?.split("?")[0];
    if (path === "/api/rpc") {
      void handleRpcNode(req, res);
      return;
    }
    if (path === "/api/post" || path === "/api/invoice") {
      void handleNode(req, res, path === "/api/post" ? "post" : "invoice");
      return;
    }
    next();
  });
}

export function apiPlugin(): Plugin {
  return {
    name: "openxpost-api",
    configureServer(server) {
      attach(server.middlewares.use.bind(server.middlewares));
    },
    configurePreviewServer(server) {
      attach(server.middlewares.use.bind(server.middlewares));
    },
  };
}

async function handleRpcNode(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const write = (status: number, body: unknown): void => {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  };
  try {
    const host = req.headers.host ?? "localhost";
    const method = req.method ?? "POST";
    const init: RequestInit = {
      method,
      headers: { "content-type": req.headers["content-type"] ?? "application/json" },
    };
    if (method !== "GET" && method !== "HEAD") {
      init.body = await readBody(req);
    }
    const request = new Request(`http://${host}/api/rpc`, init);
    const response = await handleRpc(request);
    res.statusCode = response.status;
    res.setHeader("content-type", response.headers.get("content-type") ?? "application/json");
    res.end(await response.text());
  } catch (error) {
    write(500, {
      jsonrpc: "2.0",
      error: { code: -32000, message: error instanceof Error ? error.message : "RPC proxy failed." },
      id: null,
    });
  }
}

async function handleNode(
  req: IncomingMessage,
  res: ServerResponse,
  kind: "post" | "invoice",
): Promise<void> {
  const write = (status: number, body: unknown): void => {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  };
  try {
    const host = req.headers.host ?? "localhost";
    const url = new URL(req.url ?? "/", `http://${host}`);
    const raw = req.method === "GET" ? "" : await readBody(req);
    const body = raw ? (JSON.parse(raw) as unknown) : {};
    if (kind === "invoice") {
      const id = url.searchParams.get("id")?.trim() ?? "";
      if (req.method !== "POST" && id) {
        const result = await handleInvoicePaid(req.method ?? "GET", url);
        write(result.status, result.body);
        return;
      }
      const result = await handleInvoice(req.method ?? "GET", url, body);
      write(result.status, result.body);
      return;
    }
    if (req.method !== "POST") {
      write(405, { ok: false, error: "POST only." });
      return;
    }
    const result = await handlePost(body);
    write(result.status, result.body);
  } catch (error) {
    write(500, {
      ok: false,
      error: error instanceof Error ? error.message : "Server error.",
      retry: true,
    });
  }
}
