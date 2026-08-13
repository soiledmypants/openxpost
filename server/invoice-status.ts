import type { InvoiceCreated, InvoicePaid } from "../pay/types";
import { loadInvoice, paidFromRecord, publicInvoice } from "./invoice";
import { getStore } from "./store";

/** Paid/settle path. Lazy-imports onchain so createInvoice never loads web3. */
export async function invoiceStatus(invoiceId: string): Promise<{
  invoice: InvoiceCreated;
  paid: InvoicePaid | null;
} | null> {
  const store = await getStore();
  let record = await loadInvoice(invoiceId);
  if (!record) return null;

  let paid = paidFromRecord(record);
  if (!paid) {
    const { settleInvoice } = await import("./onchain");
    paid = await settleInvoice(record);
    if (paid) {
      record = {
        ...record,
        txSig: paid.txSig,
        payer: paid.payer,
        burnSignature: paid.burnSignature,
        slot: paid.slot,
        paidAt: paid.paidAt,
      };
      await store.putInvoice(record);
    }
  }

  return { invoice: publicInvoice(record), paid };
}
