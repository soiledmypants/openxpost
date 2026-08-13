# OpenXPost

X open-sourced For You. This account is open too. Zero limits. Use $POST to post on this X page: links, contract addresses, other coins, ads, slurs, whatever you want. Freedom of speech. Open mic. Powered by Grok.

Connect Phantom or Solflare, write a draft, and transfer exactly 100,000 $POST from that wallet to the treasury. We post. See it in Posts: tweet text, tweet link, and the 100,000 $POST transfer signature. [@OpenXPost](https://x.com/OpenXPost).

## Pay

Connect a wallet. `createInvoice({ orderId, postText, postTextHash, fromPubkey })` stores the draft bound to that pubkey and returns `{ invoiceId, orderId, mint, amountTokens, amountRaw, receivePubkey, fromPubkey }`. `amountTokens` is always `100000`. `amountRaw` is `100000000000` (6 decimals). `receivePubkey` is the fixed treasury. Sign exactly 100,000 $POST from that pubkey to the treasury. `invoice.paid` includes `txSig`, `payer`, `amountTokens`, `mint`.

Payment token is $POST. One mint config for the quiet CA slot and for payment matching / `amountRaw`: set `VITE_TOKEN_MINT` / `TOKEN_MINT` (and `DEFAULT_TOKEN_MINT` in `pay/types.ts`) when a CA is live; there is no default mint. Amount is `100000` (`VITE_TOKEN_AMOUNT` / `TOKEN_AMOUNT`). Pay address / treasury: `NBQhuKpHq4M6wmGmgAhZKt4yCJ1JqxY7h8Cf3SM2mMQ` (`VITE_TREASURY_ADDRESS` / `TREASURY_ADDRESS`). Public key only. Do not commit secrets. Do not store a private key. Change Netlify env plus the defaults in `pay/types.ts` — no other code hunt.

POST `/api/invoice` and POST `/api/post` do not load `@solana/web3.js`. Wallet adapter and the transfer are client-side. A client `txSig` is paid. Matching is the exact 100,000 $POST transfer from the connected pubkey to the treasury. Do not wait for a burn. On-chain match lives in a separate Netlify function if needed.

## Site

The Docs tab on the site is this source, bundled at build time. Posts is a page at `/post/`: each paid tweet with its X status link and Solscan payment signature, newest first. Write anything. The draft must be non-empty and within 280 characters. There is no chat. All official posts from the team will be in the thread of the pinned tweet.

Netlify builds with `npm run build` and publishes `dist` (`netlify.toml`). After `invoice.paid`, a Netlify function POSTs `https://api.x.com/2/tweets` as @OpenXPost with the draft text as given, including URLs. Public env (client + server, same values): `VITE_TOKEN_MINT` / `TOKEN_MINT`, `VITE_TOKEN_AMOUNT` / `TOKEN_AMOUNT`, `VITE_TREASURY_ADDRESS` / `TREASURY_ADDRESS`. Server env only: `HELIUS_API_KEY` (or `HELIUS_RPC_URL` if it is already a full URL), `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_ACCESS_TOKEN`, `X_REFRESH_TOKEN`. Never in the client. Do not put a Helius key in `VITE_SOLANA_RPC` or any `VITE_` variable — visitors can read those. Browser wallet RPC goes to `POST /api/rpc` on this origin (Netlify function → Helius). Status URL on this site — never in the tweet.

```bash
npm install
npm run dev
npm run typecheck
npm run build
```
