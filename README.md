# OpenXPost

Pay a unique $POST amount (about 100,000) to post on the OpenXPost X account. Those tokens are burned. The tweet link is returned on this site — never in the tweet.

Not a For You slot. An open microphone on our account: [@OpenXPost](https://x.com/OpenXPost).

## Pay

`createInvoice({ orderId, postText, postTextHash })` returns `{ invoiceId, receivePubkey, mint, amountTokens, amountUi, amountRaw }`. `receivePubkey` is the treasury (`VITE_TREASURY_ADDRESS`). `amountUi` is always 6 decimal places (for example `100000.722913`). Copy that full string — do not round. Send exactly that $POST amount. We match the exact raw amount on the treasury ATA, burn the tokens, then post on @OpenXPost.

No wallet connect. The browser does not hold secrets.

Payment token is $POST. Default mint: `CniGxmdBgiPivEYyY3eLJYTLsU3agGXVY6T23wncpump` (`VITE_TOKEN_MINT`, Token-2022, 6 decimals). Base amount: `VITE_TOKEN_AMOUNT` (default 100000) plus a unique suffix `1..999999` at 6 decimal places. Burn signing uses server-only `TREASURY_SECRET` or `FEE_PAYER_SECRET`. Do not commit secrets.

## Site

The Docs tab on the site is this source, bundled at build time.

Netlify builds with `npm run build` and publishes `dist` (`netlify.toml`). After `invoice.paid`, a Netlify function re-filters the draft and POSTs `https://api.x.com/2/tweets` as @OpenXPost. Server env only: `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_ACCESS_TOKEN`, `X_REFRESH_TOKEN`. Never in the client.

```bash
npm install
npm run dev
npm run typecheck
npm run build
```
