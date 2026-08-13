# OpenXPost

Pay exactly 100,000 tokens to post on [@OpenXPost](https://x.com/OpenXPost). Those tokens are burned.

Not a For You slot. An open microphone on our account. The tweet link is returned on this site — never in the tweet.

## Pay

`pay/` builds createInvoice-style quotes:

`{ invoiceId, orderId, mint, amountTokens: 100000, receivePubkey, expiresAt }`

The user connects a wallet (Phantom, Solflare, or a wallet-standard wallet) and signs a transfer of exactly 100,000 tokens to that receive pubkey. Mint decimals are read from chain — not assumed to be 6 or 9.

The test mint `CniGxmdBgiPivEYyY3eLJYTLsU3agGXVY6T23wncpump` is Token-2022 with 6 decimals, so 100,000 whole tokens = `100_000_000_000` raw.

Those tokens are then burned (real SPL / Token-2022 burn). The browser never holds invoice private keys. `receivePubkey` comes from `VITE_PAY_API`. If that API is unset, local/dev shows a labeled demo receive pubkey and “pay watcher not connected.” Production does not invent a funded treasury.

After send, the site polls the receive ATA: waiting → paid → burning → done. Posting is still mocked until the X API is wired.

Later `invoice.paid` shape:

`{ type: "invoice.paid", invoiceId, orderId, amountTokens, mint, fromPubkey, signature, burnSignature, paidAt, postText, postTextHash }`

Optional public env:

- `VITE_TOKEN_MINT` (defaults to the test mint `CniGxmdBgiPivEYyY3eLJYTLsU3agGXVY6T23wncpump`)
- `VITE_TOKEN_AMOUNT` (default `100000`)
- `VITE_SOLANA_RPC` (defaults to public mainnet)
- `VITE_PAY_API` (invoice create/status; omit for demo/offline)

## Site

The Docs tab on the site is this source, bundled at build time.

Netlify builds with `npm run build` and publishes `dist` (`netlify.toml`).

```bash
npm install
npm run dev
npm run typecheck
npm run build
```
