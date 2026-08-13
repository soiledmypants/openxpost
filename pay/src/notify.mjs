export function paidEvent(inv) {
  return {
    type: "invoice.paid",
    invoiceId: inv.id,
    orderId: inv.orderId || inv.id,
    txSig: inv.signature,
    paidAt: inv.paidAt,
    payer: inv.payer,
    lamports: inv.lamports,
    slot: inv.slot,
  };
}
