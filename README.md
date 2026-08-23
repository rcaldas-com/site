# site

Next.js estático (`output: 'export'`) — landing page, produtos, promoções e
blog. Sem runtime: o build gera `out/`, um nginx serve, a Cloudflare
cacheia na borda.

Faz parte da stack `rcaldas-com/dev` como submódulo (`site/`), no mesmo
nível de `web/`, `wallet/`, `car/` e `emailer/`.

```
npm install
npm run dev      # http://localhost:3000
npm run build    # -> ./out
```

Pela stack: `docker compose up -d site` na raiz do `dev` (porta 8002).

**Leia o [SITE.md](SITE.md)** antes de mexer em roteamento, cache ou
deploy — ele documenta por que este app existe separado, como convive com
o `web` na raiz de `rcaldas.com`, e o que `output: 'export'` proíbe.
