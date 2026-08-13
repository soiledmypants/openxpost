import {
  createBurnCheckedInstruction,
  getAccount,
  getAssociatedTokenAddress,
  getMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  type ParsedInstruction,
  type ParsedTransactionWithMeta,
} from "@solana/web3.js";
import type { InvoicePaid } from "../pay/types";
import { envTrim, solanaRpc } from "./env";
import type { StoredInvoice } from "./store";

function connection(): Connection {
  return new Connection(solanaRpc(), "confirmed");
}

function keypairFromSecret(secretKey: string): Keypair {
  return Keypair.fromSecretKey(Buffer.from(secretKey, "base64"));
}

function feePayer(): Keypair | null {
  const raw = envTrim("FEE_PAYER_SECRET");
  if (!raw) return null;
  try {
    return keypairFromSecret(raw);
  } catch {
    return null;
  }
}

function asPaid(invoice: StoredInvoice): InvoicePaid | null {
  if (!invoice.txSig || !invoice.burnSignature || !invoice.payer || !invoice.paidAt) {
    return null;
  }
  return {
    type: "invoice.paid",
    invoiceId: invoice.invoiceId,
    orderId: invoice.orderId,
    txSig: invoice.txSig,
    paidAt: invoice.paidAt,
    payer: invoice.payer,
    amountTokens: invoice.amountTokens,
    mint: invoice.mint,
    burnSignature: invoice.burnSignature,
    slot: invoice.slot ?? 0,
  };
}

async function tokenProgramOf(conn: Connection, mint: PublicKey): Promise<PublicKey> {
  const info = await conn.getAccountInfo(mint);
  if (info?.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  return TOKEN_PROGRAM_ID;
}

function collectParsed(tx: ParsedTransactionWithMeta): ParsedInstruction[] {
  const top = tx.transaction.message.instructions.filter(
    (ix): ix is ParsedInstruction => "parsed" in ix,
  );
  const inner =
    tx.meta?.innerInstructions?.flatMap((group) =>
      group.instructions.filter((ix): ix is ParsedInstruction => "parsed" in ix),
    ) ?? [];
  return [...top, ...inner];
}

function readTransfer(
  tx: ParsedTransactionWithMeta,
  mint: string,
  destAta: string,
  rawAmount: bigint,
): { payer: string } | null {
  for (const ix of collectParsed(tx)) {
    const parsed = ix.parsed;
    if (!parsed || typeof parsed !== "object") continue;
    const type = (parsed as { type?: string }).type;
    if (type !== "transfer" && type !== "transferChecked") continue;
    const info = (parsed as { info?: Record<string, unknown> }).info;
    if (!info) continue;
    const destination = String(info.destination ?? "");
    const mintIx = String(info.mint ?? mint);
    const tokenAmount = info.tokenAmount as { amount?: string } | undefined;
    const amount = BigInt(String(tokenAmount?.amount ?? info.amount ?? "0"));
    if (destination === destAta && mintIx === mint && amount === rawAmount) {
      return { payer: String(info.authority ?? info.source ?? "") };
    }
  }
  return null;
}

export async function settleInvoice(invoice: StoredInvoice): Promise<InvoicePaid | null> {
  const already = asPaid(invoice);
  if (already) return already;

  const conn = connection();
  const mint = new PublicKey(invoice.mint);
  const owner = new PublicKey(invoice.receivePubkey);
  const programId = await tokenProgramOf(conn, mint);
  const ata = await getAssociatedTokenAddress(mint, owner, false, programId);
  const mintInfo = await getMint(conn, mint, "confirmed", programId);
  const rawAmount = BigInt(invoice.amountTokens) * 10n ** BigInt(mintInfo.decimals);

  let account;
  try {
    account = await getAccount(conn, ata, "confirmed", programId);
  } catch {
    return null;
  }
  if (account.amount < rawAmount) {
    return null;
  }

  const sigs = await conn.getSignaturesForAddress(ata, { limit: 20 });
  let payer = "";
  let txSig = "";
  let slot = 0;
  for (const info of sigs) {
    if (info.err) continue;
    const tx = await conn.getParsedTransaction(info.signature, {
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) continue;
    const hit = readTransfer(tx, invoice.mint, ata.toBase58(), rawAmount);
    if (hit) {
      payer = hit.payer;
      txSig = info.signature;
      slot = tx.slot;
      break;
    }
  }
  if (!txSig) {
    payer = String(account.owner.toBase58());
    const first = sigs[0];
    if (!first) return null;
    txSig = first.signature;
    slot = first.slot;
  }

  const ownerKey = keypairFromSecret(invoice.secretKey);
  const relayer = feePayer();
  const payerKey = relayer ?? ownerKey;
  const burnIx = createBurnCheckedInstruction(
    ata,
    mint,
    owner,
    rawAmount,
    mintInfo.decimals,
    [],
    programId,
  );
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction({
    feePayer: payerKey.publicKey,
    blockhash,
    lastValidBlockHeight,
  }).add(burnIx);
  tx.sign(ownerKey);
  if (relayer) tx.partialSign(relayer);
  const burnSignature = await conn.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
  });
  await conn.confirmTransaction({ signature: burnSignature, blockhash, lastValidBlockHeight });

  return {
    type: "invoice.paid",
    invoiceId: invoice.invoiceId,
    orderId: invoice.orderId,
    txSig,
    paidAt: new Date().toISOString(),
    payer,
    amountTokens: invoice.amountTokens,
    mint: invoice.mint,
    burnSignature,
    slot,
  };
}
