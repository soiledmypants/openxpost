export function paidEvent(inv) {
  return {
    type: "invoice.paid",
    invoiceId: inv.id ?? inv.invoiceId,
    orderId: inv.orderId,
    amountTokens: 10000,
    mint: inv.mint,
    fromPubkey: inv.fromPubkey,
    signature: inv.signature,
    burnSignature: inv.burnSignature,
    paidAt: inv.paidAt,
    postText: inv.postText,
    postTextHash: inv.postTextHash,
  };
}
