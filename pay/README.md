# OpenXPost Pay

Unique-amount SOL invoices. No wallet connect. Live mainnet watcher is observe-only.

See [DESIGN.md](./DESIGN.md) for schema, uniqueness, expiry, collision rules.

```
TREASURY_PUBKEY=<public treasury> node src/index.mjs --quote
TREASURY_PUBKEY=<public treasury> node src/index.mjs          # watch, DRY_RUN off
```

Never put a private key in `.env` or chat. This process cannot send SOL.
