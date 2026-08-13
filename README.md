# OpenXPost

Pay 100,000 $POST to post on the OpenXPost X account. Connect Phantom or Solflare, write a draft, and transfer exactly 100,000 $POST from that wallet to the treasury. We post. See it in Posts: tweet text, tweet link, and the 100,000 $POST transfer signature.

Not a For You slot. An open microphone on our account: [@OpenXPost](https://x.com/OpenXPost).

## Pay

Connect a wallet. `createInvoice({ orderId, postText, postTextHash, fromPubkey })` stores the draft bound to that pubkey and returns `{ invoiceId, orderId, mint, amountTokens, amountRaw, receivePubkey, fromPubkey }`. `amountTokens` is always `100000`. `amountRaw` is `100000000000` (6 decimals). `receivePubkey` is the fixed treasury. Sign exactly 100,000 $POST from that pubkey to the treasury. `invoice.paid` includes `txSig`, `payer`, `amountTokens`, `mint`.

Payment token is $POST. Default mint: `CniGxmdBgiPivEYyY3eLJYTLsU3agGXVY6T23wncpump` (`VITE_TOKEN_MINT`). Receive: `8MSPPTBff7jamWFQHQUjTMmt24Yv9LdWBpm3sizjziup`. Do not commit secrets. Do not store a private key.

POST `/api/invoice` and POST `/api/post` do not load `@solana/web3.js`. Wallet adapter and the transfer are client-side. A client `txSig` is paid. Matching is the exact 100,000 $POST transfer from the connected pubkey to the treasury. Do not wait for a burn. On-chain match lives in a separate Netlify function if needed.

## Site

The Docs tab on the site is this source, bundled at build time. The Posts tab lists each tweet with its payment signature. Draft rules are a silent filter as you type — no chat.

Netlify builds with `npm run build` and publishes `dist` (`netlify.toml`). After `invoice.paid`, a Netlify function re-filters the draft and POSTs `https://api.x.com/2/tweets` as @OpenXPost. Server env only: `HELIUS_API_KEY` (or `HELIUS_RPC_URL` if it is already a full URL), `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_ACCESS_TOKEN`, `X_REFRESH_TOKEN`. Never in the client. Do not put a Helius key in `VITE_SOLANA_RPC` or any `VITE_` variable — visitors can read those. Browser wallet RPC goes to `POST /api/rpc` on this origin (Netlify function → Helius). Status URL on this site — never in the tweet. Do not put the CA in tweets.

```bash
npm install
npm run dev
npm run typecheck
npm run build
```
