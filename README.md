# OpenXPost

Pay ~$1 in SOL to post on the OpenXPost X account.

Not a For You slot. An open microphone on our account. The tweet link is returned on this site — never in the tweet.

## Pay

`pay/` builds unique-amount SOL invoices: ~$1 plus a 1–9999 lamport suffix, always 9 decimal places. Observe-only watcher. No wallet connect.

Treasury is `TREASURY_NOT_SET` until a public receiving address is configured. Do not send funds before that.

Optional public env:

- `VITE_TREASURY_ADDRESS`
- `VITE_SOLANA_RPC` (defaults to public mainnet)

## Site

The Docs tab on the site is this source, bundled at build time.

Netlify builds with `npm run build` and publishes `dist` (`netlify.toml`).

```bash
npm install
npm run dev
npm run typecheck
npm run build
```
