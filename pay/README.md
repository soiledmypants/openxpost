# OpenXPost Pay

Token-2022 ROOTS invoices. Price is exactly 100,000 tokens. No wallet connect.

`createInvoice` mints a fresh receive keypair. The watcher observes the Token-2022 ATA at commitment `finalized`, then **burns** the tokens in place (`BurnChecked` + `CloseAccount`). It does not forward tokens to a burner address.

```
SOLANA_RPC=<rpc> node src/index.mjs --quote
SOLANA_RPC=<rpc> node src/index.mjs          # watch + burn, DRY_RUN off
```

Put the fee-payer JSON secret array at `data/feepayer.key` (gitignored). The AES wrap key is `data/.wrapkey` (mode 0600, auto-created). Never put a private key in `.env` or chat. Never print secrets.
