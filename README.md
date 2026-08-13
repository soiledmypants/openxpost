# OpenXPost

Pay 100,000 $POST to post on the OpenXPost X account. Connect Phantom or Solflare, write a draft, and transfer exactly 100,000 $POST from that wallet to the treasury. Those tokens are burned. The tweet link is returned on this site, paired with the burn transaction — never in the tweet.

Not a For You slot. An open microphone on our account: [@OpenXPost](https://x.com/OpenXPost).

## Pay

Connect a wallet. `createInvoice({ orderId, postText, postTextHash, fromPubkey })` stores the draft bound to that pubkey and returns `{ invoiceId, orderId, mint, amountTokens, amountRaw, receivePubkey, fromPubkey }`. `amountTokens` is always `100000`. `amountRaw` is `100000000000` (6 decimals). `receivePubkey` is the fixed treasury. Sign exactly 100,000 $POST from that pubkey. After it lands, it is burned. `invoice.paid` includes `txSig`, `burnSignature`, `payer`, `amountTokens`, `mint`.

Payment token is $POST. Default mint: `CniGxmdBgiPivEYyY3eLJYTLsU3agGXVY6T23wncpump` (`VITE_TOKEN_MINT`). Receive: `2qd5pRQJQcyBJFkd4P9BGeXoS1zDcwMArRgaTu2zLoMJ`. Burn signing uses server-only `RECEIVE_SECRET` or `FEE_PAYER_SECRET`. Do not commit secrets.

POST `/api/invoice` does not load `@solana/web3.js`. Wallet adapter and the transfer are client-side. On-chain match and burn live in a separate Netlify function. Matching is the exact 100,000 $POST transfer from the connected pubkey.

## Site

The Docs tab on the site is this source, bundled at build time. Draft rules are a silent filter as you type — no chat.

Netlify builds with `npm run build` and publishes `dist` (`netlify.toml`). After `invoice.paid`, a Netlify function re-filters the draft and POSTs `https://api.x.com/2/tweets` as @OpenXPost. Server env only: `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_ACCESS_TOKEN`, `X_REFRESH_TOKEN`. Never in the client. Status URL on this site — never in the tweet. Do not put the CA in tweets.

```bash
npm install
npm run dev
npm run typecheck
npm run build
```
