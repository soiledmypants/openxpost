import { amountRawFromTokens } from "../pay/amount";
import { postTextHash } from "../pay/hash";
import { DEFAULT_AMOUNT_TOKENS, DEFAULT_RECEIVE_PUBKEY, DEFAULT_TOKEN_MINT } from "../pay/types";
import { getStore, type StoredInvoice } from "./store";

/** Already-published @OpenXPost tweets. Seed the board; never tweet these again. */
type RestoreSeed = {
  tweetId: string;
  tweetUrl: string;
  txSig: string;
  paidAt: string;
  postText: string;
};

const RESTORE_SEEDS: RestoreSeed[] = [
  {
    tweetId: "2088107102757585019",
    tweetUrl: "https://x.com/OpenXPost/status/2088107102757585019",
    txSig: "5cbJAp4CQhHjLNsFEzBmzrWP4EknpWFTEzm7x2JKYbm8jGXXontCrXt8fJyuto865Gv3GhzMRmQJoVE7kEHvkGUD",
    paidAt: "2026-08-14T03:35:02.000Z",
    postText: "Just in case it tun hard follow \nJ9sgHRc8LbU9PqrNUXJ3opViFJQZUioJqN6CKiA3pump\nZby mean my dick in arabic",
  },
  {
    tweetId: "2088106971731804630",
    tweetUrl: "https://x.com/OpenXPost/status/2088106971731804630",
    txSig: "2BqQePZv1XSRvJSjiJHqb9QJFDTGL63vszX7ZYVNWVK7yTut5w9VqbzDrRewxxpfumcLN1E2DgjpP8qhZFTYcLUG",
    paidAt: "2026-08-14T03:34:30.000Z",
    postText: "Hi",
  },
  {
    tweetId: "2088106281609404419",
    tweetUrl: "https://x.com/OpenXPost/status/2088106281609404419",
    txSig: "2NS4oLziM8zrmdhTuktpA11RRkvfUwPsW5hh6EL3hqPQwhe73Y9QNKTQweVUAj2RTDWaEVnh5Q9NBvCg8BPnwkzP",
    paidAt: "2026-08-14T03:31:46.000Z",
    postText: "so i can post ANY ca?? \n\n9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump\n\nbuy the black nigger ansmem coin",
  },
  {
    tweetId: "2088105526877958181",
    tweetUrl: "https://x.com/OpenXPost/status/2088105526877958181",
    txSig: "2GGwpnbiH73gKcAaniMeg5qYRg5m13yDqwnGfVjWmUyd5FzmjuvdYLxk44b9zux6Dd7WfPBXQhAkRwVgPA6CeUFr",
    paidAt: "2026-08-14T03:28:46.000Z",
    postText: "We are livr ca: \nJ9sgHRc8LbU9PqrNUXJ3opViFJQZUioJqN6CKiA3pump",
  },
  {
    tweetId: "2088105132311417335",
    tweetUrl: "https://x.com/OpenXPost/status/2088105132311417335",
    txSig: "3UDDqTDJNE8iCQc9o9r4qji8R8qc9VuJXmhGC2uaF32r5j3jW7ys11cw9Wt7QbUNfh9cnZdnP8YLqTQiDMSiAK52",
    paidAt: "2026-08-14T03:27:12.000Z",
    postText: "okay so i just pay 100k tokens and can say and post and do WHATEVER i wanna say?? like ZERO restrictions?",
  },
  {
    tweetId: "2088104878455378166",
    tweetUrl: "https://x.com/OpenXPost/status/2088104878455378166",
    txSig: "4i46xZuAbFEbjtmKcyMWnLVDfzzH4gM4hqsxn9vDd3xUZHZAWxKCzrGMuGAK1SjH5ip95TqqZuFb4BDse1hMUoCK",
    paidAt: "2026-08-14T03:26:11.000Z",
    postText: "so it works??",
  },
];

export function restoreInvoiceId(tweetId: string): string {
  return `restore-${tweetId}`;
}

async function restoreRecord(seed: RestoreSeed): Promise<StoredInvoice> {
  const invoiceId = restoreInvoiceId(seed.tweetId);
  return {
    invoiceId,
    orderId: invoiceId,
    postText: seed.postText,
    postTextHash: await postTextHash(seed.postText),
    fromPubkey: "paid",
    receivePubkey: DEFAULT_RECEIVE_PUBKEY,
    mint: DEFAULT_TOKEN_MINT,
    amountTokens: DEFAULT_AMOUNT_TOKENS,
    amountRaw: amountRawFromTokens(DEFAULT_AMOUNT_TOKENS).toString(),
    createdAt: Date.parse(seed.paidAt),
    txSig: seed.txSig,
    payer: "paid",
    paidAt: seed.paidAt,
    tweetId: seed.tweetId,
    tweetUrl: seed.tweetUrl,
  };
}

async function upsertRestoreRecord(record: StoredInvoice): Promise<void> {
  const store = await getStore();
  const existing = await store.getInvoice(record.invoiceId);
  if (existing) return;
  await store.putInvoice(record);
}

let seeded: Promise<void> | undefined;

/** Idempotent putInvoice of already-published posts. Does not call X. */
export async function restorePublishedBoard(): Promise<void> {
  if (!seeded) {
    seeded = (async () => {
      const records = await Promise.all(RESTORE_SEEDS.map(restoreRecord));
      for (const record of records) {
        await upsertRestoreRecord(record);
      }
    })().catch((error: unknown) => {
      seeded = undefined;
      throw error;
    });
  }
  await seeded;
}

export function resetRestoreCache(): void {
  seeded = undefined;
}
