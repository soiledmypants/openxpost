import { getStore as getBlobStore } from "@netlify/blobs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type StoredInvoice = {
  invoiceId: string;
  orderId: string;
  postText: string;
  postTextHash: string;
  fromPubkey?: string;
  receivePubkey: string;
  mint: string;
  amountTokens: number;
  amountUi?: string;
  amountRaw?: string;
  expectedPayer?: string;
  createdAt: number;
  txSig?: string;
  payer?: string;
  slot?: number;
  paidAt?: string;
  tweetId?: string;
  tweetUrl?: string;
  lastError?: string;
  /** @deprecated Legacy per-invoice secrets. Never persist. */
  secretKey?: string;
};

export type OauthRecord = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type Store = {
  putInvoice(record: StoredInvoice): Promise<void>;
  getInvoice(invoiceId: string): Promise<StoredInvoice | null>;
  deleteInvoice(invoiceId: string): Promise<void>;
  listInvoices(): Promise<StoredInvoice[]>;
  getOauth(): Promise<OauthRecord | null>;
  putOauth(record: OauthRecord): Promise<void>;
};

const FILE = join(process.cwd(), ".data", "openxpost.json");
const INDEX_KEY = "inv-index";
const STORE_NAME = "openxpost";

type FileShape = {
  invoices?: Record<string, StoredInvoice>;
  oauth?: OauthRecord;
};

function persistable(record: StoredInvoice): StoredInvoice {
  const copy: StoredInvoice = { ...record };
  delete copy.secretKey;
  return copy;
}

async function readFileStore(): Promise<FileShape> {
  try {
    const raw = await readFile(FILE, "utf8");
    return JSON.parse(raw) as FileShape;
  } catch {
    return {};
  }
}

async function writeFileStore(data: FileShape): Promise<void> {
  await mkdir(dirname(FILE), { recursive: true });
  await writeFile(FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function fileStore(): Store {
  return {
    async putInvoice(record) {
      const data = await readFileStore();
      await writeFileStore({
        ...data,
        invoices: { ...data.invoices, [record.invoiceId]: persistable(record) },
      });
    },
    async getInvoice(invoiceId) {
      const data = await readFileStore();
      return data.invoices?.[invoiceId] ?? null;
    },
    async deleteInvoice(invoiceId) {
      const data = await readFileStore();
      if (!data.invoices?.[invoiceId]) return;
      const invoices = { ...data.invoices };
      delete invoices[invoiceId];
      await writeFileStore({ ...data, invoices });
    },
    async listInvoices() {
      const data = await readFileStore();
      return Object.values(data.invoices ?? {});
    },
    async getOauth() {
      const data = await readFileStore();
      return data.oauth ?? null;
    },
    async putOauth(record) {
      const data = await readFileStore();
      await writeFileStore({ ...data, oauth: record });
    },
  };
}

type BlobRaw = {
  get: (
    key: string,
    opts: { type: "json"; consistency?: "strong" | "eventual" },
  ) => Promise<unknown>;
  setJSON: (key: string, value: unknown) => Promise<unknown>;
  delete?: (key: string) => Promise<unknown>;
  list?: (opts?: { prefix?: string }) => Promise<{ blobs?: { key: string }[] }>;
};

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function blobStore(raw: BlobRaw): Store {
  async function readIndex(): Promise<string[]> {
    return asIdList(await raw.get(INDEX_KEY, { type: "json", consistency: "strong" }));
  }

  async function listedFromBlobs(): Promise<string[]> {
    if (typeof raw.list !== "function") return [];
    const result = await raw.list({ prefix: "inv:" });
    const ids: string[] = [];
    for (const blob of result.blobs ?? []) {
      if (blob.key.startsWith("inv:")) ids.push(blob.key.slice(4));
    }
    return ids;
  }

  async function listedIds(): Promise<string[]> {
    const ids = new Set<string>(await readIndex());
    try {
      for (const id of await listedFromBlobs()) ids.add(id);
    } catch (error) {
      if (ids.size === 0) throw error;
    }
    return [...ids];
  }

  return {
    async putInvoice(record) {
      const saved = persistable(record);
      await raw.setJSON(`inv:${record.invoiceId}`, saved);
      const index = await readIndex();
      if (!index.includes(record.invoiceId)) {
        await raw.setJSON(INDEX_KEY, [...index, record.invoiceId]);
      }
    },
    async getInvoice(invoiceId) {
      return (
        ((await raw.get(`inv:${invoiceId}`, { type: "json", consistency: "strong" })) as
          | StoredInvoice
          | null) ?? null
      );
    },
    async deleteInvoice(invoiceId) {
      if (typeof raw.delete === "function") {
        await raw.delete(`inv:${invoiceId}`);
      }
      const index = await readIndex();
      const next = index.filter((id) => id !== invoiceId);
      if (next.length !== index.length) {
        await raw.setJSON(INDEX_KEY, next);
      }
    },
    async listInvoices() {
      const ids = await listedIds();
      const records = await Promise.all(
        ids.map(async (id) => {
          return (
            ((await raw.get(`inv:${id}`, { type: "json", consistency: "strong" })) as
              | StoredInvoice
              | null) ?? null
          );
        }),
      );
      return records.filter((record): record is StoredInvoice => record !== null);
    },
    async getOauth() {
      return ((await raw.get("oauth:x", { type: "json", consistency: "strong" })) as OauthRecord | null) ?? null;
    },
    async putOauth(record) {
      await raw.setJSON("oauth:x", record);
    },
  };
}

/** File fallback is local/dev only. Deployed Netlify functions must use Blobs. */
export function allowFileFallback(): boolean {
  if (process.env.NETLIFY_DEV === "true") return true;
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return false;
  const context = process.env.CONTEXT;
  if (context === "production" || context === "deploy-preview" || context === "branch-deploy") {
    return false;
  }
  return true;
}

function openBlobStore(): Store {
  const raw = getBlobStore({ name: STORE_NAME, consistency: "strong" });
  return blobStore(raw);
}

let cached: Store | undefined;

export function resetStoreCache(): void {
  cached = undefined;
}

export async function getStore(): Promise<Store> {
  if (cached) return cached;
  try {
    cached = openBlobStore();
    return cached;
  } catch (error) {
    if (!allowFileFallback()) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Netlify Blobs is required for invoices in production (${STORE_NAME}). ${detail}`);
    }
    cached = fileStore();
    return cached;
  }
}
