# Daybreak HQ

Research dashboard for the dog product store. Lives at `/dashboard/` on this repo's GitHub Pages site.

- Sign in with the shared password (Aditya has it). The research data in `data.enc.json` is encrypted with it, so the public repo doesn't expose it.
- Ads, price checks and products you add are saved in your browser. Use **Setup > Export** to send them to your partner.
- **Store metrics** is demo data until Shopify and Meta are connected through a small backend.

## Updating the research data

The plain JSON is kept out of the repo. Edit it, then re-encrypt:

```
node tools/encrypt.mjs path/to/data.json "<password>" data.enc.json
```

Changing the password works the same way: encrypt with the new one and commit `data.enc.json`.
