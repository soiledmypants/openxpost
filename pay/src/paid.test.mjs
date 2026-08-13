import assert from "node:assert/strict";
import { paidEvent } from "./notify.mjs";

const ev = paidEvent({
  id: "inv_1",
  orderId: "ord_1",
  mint: "CniGxmdBgiPivEYyY3eLJYTLsU3agGXVY6T23wncpump",
  fromPubkey: "From111111111111111111111111111111111111111",
  signature: "paySig",
  burnSignature: "burnSig",
  paidAt: "2026-01-01T00:00:00.000Z",
  postText: "hello",
  postTextHash: "hash",
});

assert.deepEqual(Object.keys(ev), [
  "type",
  "invoiceId",
  "orderId",
  "amountTokens",
  "mint",
  "fromPubkey",
  "signature",
  "burnSignature",
  "paidAt",
  "postText",
  "postTextHash",
]);
assert.equal(ev.type, "invoice.paid");
assert.equal(ev.invoiceId, "inv_1");
assert.equal(ev.orderId, "ord_1");
assert.equal(ev.amountTokens, 10000);
assert.equal(ev.mint, "CniGxmdBgiPivEYyY3eLJYTLsU3agGXVY6T23wncpump");
assert.equal(ev.fromPubkey, "From111111111111111111111111111111111111111");
assert.equal(ev.signature, "paySig");
assert.equal(ev.burnSignature, "burnSig");
assert.equal(ev.paidAt, "2026-01-01T00:00:00.000Z");
assert.equal(ev.postText, "hello");
assert.equal(ev.postTextHash, "hash");
assert.equal("lamports" in ev, false);
assert.equal("txSig" in ev, false);

console.log("paid.test.mjs ok");
