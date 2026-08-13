# OpenXPost Pay — Token-2022 ROOTS burn loop

v1 storage is JSON files under `data/` (gitignored). No postgres.

- `invoices.json` — public rows only. No secret keys.
- `secrets.enc.json` — AES-256-GCM wrapped invoice secrets.
- `.wrapkey` — 32-byte wrap key, mode `0600`.
- `feepayer.key` — fee payer JSON secret array, mode `0600`.

This process never logs or prints secrets. `DRY_RUN` defaults off (`DRY_RUN=1` only for local tests). Live mode observes mainnet, burns, and closes. It never asks for a wallet connect.

## Mint (locked)

| Field | Value |
| --- | --- |
| mint | `CniGxmdBgiPivEYyY3eLJYTLsU3agGXVY6T23wncpump` |
| program | Token-2022 `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` (detect from mint owner) |
| decimals | 6 |
| symbol | ROOTS |
| amountTokens | `100000` |
| amountRaw | `100000000000` |

## Quote

`createInvoice({ orderId, postText, postTextHash })`:

1. `Keypair.generate()` for this invoice.
2. Wrap `secretKey` with AES-256-GCM into `data/secrets.enc.json` using `data/.wrapkey`.
3. Public row in `data/invoices.json` (no secrets).

Return exactly:

```json
{
  "invoiceId": "...",
  "orderId": "...",
  "mint": "CniGxmdBgiPivEYyY3eLJYTLsU3agGXVY6T23wncpump",
  "amountTokens": 100000,
  "receivePubkey": "..."
}
```

Payer sends 100,000 ROOTS to the Token-2022 ATA of `receivePubkey`.

## Watch

`@solana/web3.js` `Connection` at commitment `"finalized"`.

1. Derive ATA (`ataFor`) using the token program taken from the mint account owner.
2. `getSignaturesForAddress(ata)` then `getTransaction` `jsonParsed`.
3. If `getTransaction` returns `null`, do not mark the signature seen. Skip failed txs.
4. `tokenInflows`: `transfer` / `transferChecked` into that ATA with amount `100000000000`.
5. Match once: unique payment signature + `status === "open"` CAS.

## Burn (not a forward)

On match, **do not** send tokens to a burner address. Burn in place, then close the ATA:

1. `createBurnCheckedInstruction(ata, mint, owner=invoice, amount=100000000000, decimals=6)` on Token-2022.
2. `createCloseAccountInstruction` — remaining SOL rent goes to the fee payer.
3. Fee payer: local `data/feepayer.key` JSON secret array. Invoice keypair co-signs.
4. Wipe the invoice secret after a successful burn.
5. Emit once:

```json
{
  "type": "invoice.paid",
  "invoiceId": "...",
  "orderId": "...",
  "amountTokens": 100000,
  "mint": "CniGxmdBgiPivEYyY3eLJYTLsU3agGXVY6T23wncpump",
  "fromPubkey": "...",
  "signature": "...",
  "burnSignature": "...",
  "paidAt": "...",
  "postText": "...",
  "postTextHash": "..."
}
```
