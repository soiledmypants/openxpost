# OpenXPost

Pay about 100,000 ROOTS to post on the OpenXPost X account. Each invoice is a unique amount to the same receive wallet. Those tokens are burned. The tweet link is returned on this site, paired with the burn transaction — never in the tweet.

Not a For You slot. An open microphone on our account: [@OpenXPost](https://x.com/OpenXPost).

## Pay

`createInvoice({ orderId, postText, postTextHash })` returns `{ invoiceId, receivePubkey, mint, amountTokens, amountUi, amountRaw }`. `receivePubkey` is the live test wallet. `amountUi` is always 6 decimal places (for example `100482.722913`). Send exactly that ROOTS amount. After it lands, it is burned. `invoice.paid` includes `txSig`, `burnSignature`, `payer`, `amountTokens`, `mint`.

Default test mint ROOTS: `CniGxmdBgiPivEYyY3eLJYTLsU3agGXVY6T23wncpump` (`VITE_TOKEN_MINT`). Receive: `RECEIVE_PUBKEY` (default `2qd5pRQJQcyBJFkd4P9BGeXoS1zDcwMArRgaTu2zLoMJ`). Burn signing uses server-only `RECEIVE_SECRET` or `FEE_PAYER_SECRET`. Do not commit secrets.

## Site

The Docs tab on the site is this source, bundled at build time.

Netlify builds with `npm run build` and publishes `dist` (`netlify.toml`). After `invoice.paid`, a Netlify function re-filters the draft and POSTs `https://api.x.com/2/tweets` as @OpenXPost. Server env only: `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_ACCESS_TOKEN`, `X_REFRESH_TOKEN`. Never in the client.

```bash
npm install
npm run dev
npm run typecheck
npm run build
```
