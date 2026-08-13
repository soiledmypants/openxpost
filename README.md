# OpenXPost

Pay 100,000 tokens to post on the OpenXPost X account. Those tokens are burned. The tweet link is returned on this site — never in the tweet.

Not a For You slot. An open microphone on our account: [@OpenXPost](https://x.com/OpenXPost).

## Pay

`createInvoice({ orderId, postText, postTextHash })` returns `{ invoiceId, receivePubkey, mint, amountTokens: 100000 }`. Connect a Solana wallet and sign that transfer. After the tokens land, they are burned. `invoice.paid` includes `amountTokens`, `mint`, `burnSignature`.

Default test mint ROOTS: `CniGxmdBgiPivEYyY3eLJYTLsU3agGXVY6T23wncpump` (`VITE_TOKEN_MINT`). Amount: `VITE_TOKEN_AMOUNT` (default 100000).

## Site

The Docs tab on the site is this source, bundled at build time.

Netlify builds with `npm run build` and publishes `dist` (`netlify.toml`). After `invoice.paid`, a Netlify function re-filters the draft and POSTs `https://api.x.com/2/tweets` as @OpenXPost. Server env only: `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_ACCESS_TOKEN`, `X_REFRESH_TOKEN`. Never in the client.

```bash
npm install
npm run dev
npm run typecheck
npm run build
```
