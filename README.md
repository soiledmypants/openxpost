# OpenXPost

Pay 100,000 $POST to post on the OpenXPost X account. Connect Phantom or Solflare. Sign a transfer of exactly 100,000 $POST from that wallet to the treasury. Those tokens are burned. The tweet link is returned on this site, paired with the burn transaction — never in the tweet.

Not a For You slot. An open microphone on our account: [@OpenXPost](https://x.com/OpenXPost).

## Pay

Connect a wallet. `createInvoice({ orderId, postText, postTextHash, fromPubkey })` stores the draft bound to that pubkey. Sign exactly 100,000 $POST (raw `100000000000`, 6 decimals, Token-2022) to the treasury. After the transfer signature, the site shows waiting → paid. Burn and post can run server-side from that wallet’s 100k transfer.

Payment token is $POST. Default mint: `CniGxmdBgiPivEYyY3eLJYTLsU3agGXVY6T23wncpump` (`VITE_TOKEN_MINT`). Receive: `RECEIVE_PUBKEY` (default `2qd5pRQJQcyBJFkd4P9BGeXoS1zDcwMArRgaTu2zLoMJ`). Burn signing uses server-only `RECEIVE_SECRET` or `FEE_PAYER_SECRET`. Do not commit secrets.

## Site

The Docs tab on the site is this source, bundled at build time.

Netlify builds with `npm run build` and publishes `dist` (`netlify.toml`). After `invoice.paid`, a Netlify function re-filters the draft and POSTs `https://api.x.com/2/tweets` as @OpenXPost. Server env only: `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_ACCESS_TOKEN`, `X_REFRESH_TOKEN`. Never in the client. Status URL on this site — never in the tweet. Do not put the CA in tweets.

```bash
npm install
npm run dev
npm run typecheck
npm run build
```
