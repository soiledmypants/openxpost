# OpenXPost

Pay about 100,000 $POST to post on the OpenXPost X account. Each invoice is a unique amount to the same receive wallet. Those tokens are burned. The tweet link is returned on this site, paired with the burn transaction — never in the tweet.

Not a For You slot. An open microphone on our account: [@OpenXPost](https://x.com/OpenXPost).

## Pay

`createInvoice({ orderId, postText, postTextHash })` returns `{ invoiceId, orderId, mint, amountTokens, amountRaw, receivePubkey }`. `amountTokens` and `amountUi` are always 6 decimal places (for example `100482.722913`). `receivePubkey` is the fixed treasury. Send exactly that $POST amount. After it lands, it is burned. `invoice.paid` includes `txSig`, `burnSignature`, `payer`, `amountTokens`, `mint`.

Payment token is $POST. Default mint: `CniGxmdBgiPivEYyY3eLJYTLsU3agGXVY6T23wncpump` (`VITE_TOKEN_MINT`). Receive: `2qd5pRQJQcyBJFkd4P9BGeXoS1zDcwMArRgaTu2zLoMJ`. Burn signing uses server-only `RECEIVE_SECRET` or `FEE_PAYER_SECRET`. Do not commit secrets.

POST `/api/invoice` does not load `@solana/web3.js`. On-chain match and burn live in a separate Netlify function.

## Site

The Docs tab on the site is this source, bundled at build time.

Netlify builds with `npm run build` and publishes `dist` (`netlify.toml`). After `invoice.paid`, a Netlify function re-filters the draft and POSTs `https://api.x.com/2/tweets` as @OpenXPost. Server env only: `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_ACCESS_TOKEN`, `X_REFRESH_TOKEN`. Never in the client. Status URL on this site — never in the tweet. Do not put the CA in tweets.

```bash
npm install
npm run dev
npm run typecheck
npm run build
```
