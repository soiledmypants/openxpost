import assert from "node:assert/strict";
import { paidEvent } from "./notify.mjs";

const ev = paidEvent({
  id: "inv_1",
  orderId: "ord_1",
  signature: "5sig",
  paidAt: "2026-01-01T00:00:00.000Z",
  payer: "Payer1111111111111111111111111111111111111",
  lamports: 123456789,
  slot: 42,
});

assert.deepEqual(Object.keys(ev), [
  "type",
  "invoiceId",
  "orderId",
  "txSig",
  "paidAt",
  "payer",
  "lamports",
  "slot",
]);
assert.equal(ev.type, "invoice.paid");
assert.equal(ev.invoiceId, "inv_1");
assert.equal(ev.orderId, "ord_1");
assert.equal(ev.txSig, "5sig");
assert.equal(ev.paidAt, "2026-01-01T00:00:00.000Z");
assert.equal(ev.payer, "Payer1111111111111111111111111111111111111");
assert.equal(ev.lamports, 123456789);
assert.equal(ev.slot, 42);
assert.equal("postText" in ev, false);

console.log("paid.test.mjs ok");
