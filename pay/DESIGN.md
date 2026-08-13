# OpenXPost Pay — unique-amount SOL invoices

Observe-only live mainnet watcher. No wallet connect. This process never
asks for a private key, never signs, and never broadcasts. `DRY_RUN`
defaults off (`DRY_RUN=1` only for local tests).

The site holds `postText` by `orderId`. Do **not** put `postText` on the
paid event. Do not rename or add paid-event keys.

## Locked quote JSON

`createInvoice({ orderId })` returns exactly:

```json
{
  "invoiceId": "...",
  "treasury": "...",
  "lamports": 0,
  "amountSol": "0.000000000",
  "expiresAt": "2026-01-01T00:00:00.000Z",
  "payUri": "solana:..."
}
```

`amountSol` is always 9 decimal places (`lamports / 1e9`).

## Locked paid event

`paidEvent()` returns exactly these keys, in this order:

```json
{
  "type": "invoice.paid",
  "invoiceId": "...",
  "orderId": "...",
  "txSig": "...",
  "paidAt": "2026-01-01T00:00:00.000Z",
  "payer": "...",
  "lamports": 0,
  "slot": 0
}
```

## Uniqueness

Price: Jupiter v3 `usdPrice` for wrapped SOL
`So11111111111111111111111111111111111111112`, CoinGecko `solana`/`usd`
fallback.

For `$AMOUNT_USD` (product default `$1`):

```
bucket = floor(floor(AMOUNT_USD * 1e9 / solUsd) / 10000) * 10000
lamports = bucket + suffix
```

`suffix` is an unused integer in `1..9999` on that 10_000-lamport bucket
(`SUFFIX_MOD=10000`). Open invoices uniquely occupy a `lamports` value.
A suffix may be reused after the previous invoice is paid or past
expiry + grace. If every suffix in the bucket is taken, quote fails.

## Expiry

- Pay window: 15 minutes (`PAY_WINDOW_SEC=900`). `expiresAt` is
  `createdAt + PAY_WINDOW_SEC`.
- Grace: 10 minutes (`GRACE_SEC=600`) so a transfer sent near expiry can
  still finalize and match.
- Match window: finalized `blockTime` in `[createdAt, expiresAt + grace]`.

## Finalized matching

`@solana/web3.js` `Connection` at commitment `"finalized"`.

1. `getSignaturesForAddress(treasury)`
2. `getTransaction(..., { encoding: "jsonParsed", commitment: "finalized" })`
3. If `getTransaction` returns `null`, do **not** mark the signature seen
   (RPC lag). Skip failed txs (`err` set).
4. Extract `program === "system"` && `parsed.type === "transfer"` &&
   `destination === treasury` (native `SystemProgram.transfer` only).
5. Match **exact** `lamports` to an invoice with `status === "open"` (CAS).
6. Never double-match: unique `txSig` / signature, open-status CAS.

JSON file store is v1 (`src/store.mjs`, `data/` gitignored). `schema.sql`
is the postgres shape for later.
