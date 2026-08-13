import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type StoredInvoice = {
  invoiceId: string;
  orderId: string;
  postText: string;
  postTextHash: string;
  receivePubkey: string;
  mint: string;
  amountTokens: number;
  amountUi?: string;
  amountRaw?: string;
  createdAt: number;
  txSig?: string;
  payer?: string;
  burnSignature?: string;
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
  listInvoices(): Promise<StoredInvoice[]>;
  getOauth(): Promise<OauthRecord | null>;
  putOauth(record: OauthRecord): Promise<void>;
};

const FILE = join(process.cwd(), ".data", "openxpost.json");
const INDEX_KEY = "inv-index";

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
  get: (key: string, opts: { type: "json" }) => Promise<unknown>;
  setJSON: (key: string, value: unknown) => Promise<unknown>;
  list?: (opts?: { prefix?: string }) => Promise<{ blobs?: { key: string }[] }>;
};

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function blobStore(raw: BlobRaw): Store {
  async function readIndex(): Promise<string[]> {
    return asIdList(await raw.get(INDEX_KEY, { type: "json" }));
  }

  async function listedIds(): Promise<string[]> {
    const ids = new Set<string>(await readIndex());
    if (typeof raw.list === "function") {
      try {
        const result = await raw.list({ prefix: "inv:" });
        for (const blob of result.blobs ?? []) {
          if (blob.key.startsWith("inv:")) ids.add(blob.key.slice(4));
        }
      } catch {
        // Index is enough when list is unavailable.
      }
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
      return ((await raw.get(`inv:${invoiceId}`, { type: "json" })) as StoredInvoice | null) ?? null;
    },
    async listInvoices() {
      const ids = await listedIds();
      const records = await Promise.all(
        ids.map(async (id) => {
          return ((await raw.get(`inv:${id}`, { type: "json" })) as StoredInvoice | null) ?? null;
        }),
      );
      return records.filter((record): record is StoredInvoice => record !== null);
    },
    async getOauth() {
      return ((await raw.get("oauth:x", { type: "json" })) as OauthRecord | null) ?? null;
    },
    async putOauth(record) {
      await raw.setJSON("oauth:x", record);
    },
  };
}

let cached: Store | undefined;

export async function getStore(): Promise<Store> {
  if (cached) return cached;
  try {
    const mod = await import("@netlify/blobs");
    cached = blobStore(mod.getStore("openxpost"));
    return cached;
  } catch {
    cached = fileStore();
    return cached;
  }
}
