import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type StoredInvoice = {
  invoiceId: string;
  orderId: string;
  postText: string;
  postTextHash: string;
  receivePubkey: string;
  secretKey: string;
  mint: string;
  amountTokens: number;
  createdAt: number;
  txSig?: string;
  payer?: string;
  burnSignature?: string;
  slot?: number;
  paidAt?: string;
  tweetId?: string;
  tweetUrl?: string;
  lastError?: string;
};

export type OauthRecord = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type Store = {
  putInvoice(record: StoredInvoice): Promise<void>;
  getInvoice(invoiceId: string): Promise<StoredInvoice | null>;
  getOauth(): Promise<OauthRecord | null>;
  putOauth(record: OauthRecord): Promise<void>;
};

const FILE = join(process.cwd(), ".data", "openxpost.json");

type FileShape = {
  invoices?: Record<string, StoredInvoice>;
  oauth?: OauthRecord;
};

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
        invoices: { ...data.invoices, [record.invoiceId]: record },
      });
    },
    async getInvoice(invoiceId) {
      const data = await readFileStore();
      return data.invoices?.[invoiceId] ?? null;
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

function blobStore(raw: {
  get: (key: string, opts: { type: "json" }) => Promise<unknown>;
  setJSON: (key: string, value: unknown) => Promise<unknown>;
}): Store {
  return {
    async putInvoice(record) {
      await raw.setJSON(`inv:${record.invoiceId}`, record);
    },
    async getInvoice(invoiceId) {
      return ((await raw.get(`inv:${invoiceId}`, { type: "json" })) as StoredInvoice | null) ?? null;
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
