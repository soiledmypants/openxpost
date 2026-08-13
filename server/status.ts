import type { InvoiceCreated, InvoicePaid } from "../pay/types";
import { paidFromRecord, publicInvoice } from "./invoice";
import { getStore } from "./store";

export async function invoiceStatus(invoiceId: string): Promise<{
  invoice: InvoiceCreated;
  paid: InvoicePaid | null;
} | null> {
  const store = await getStore();
  let record = await store.getInvoice(invoiceId);
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
        slot: paid.slot,
        paidAt: paid.paidAt,
      };
      await store.putInvoice(record);
    }
  }

  return { invoice: publicInvoice(record), paid };
}
