# Site — app estático de conteúdo público

> Documento de partida pra abrir um chat dedicado ao `site` sem
> redescobrir a infra. O que está marcado como **medido** foi verificado
> em produção em 21–22/08/2026; o resto é decisão tomada ou proposta.

## O que é

Um Next.js **totalmente estático** (`output: 'export'`) pra landing page,
produtos, promoções, chamadas pra vídeo e blog. Sem Node em runtime: o
build gera HTML/CSS/JS, um nginx serve, a Cloudflare cacheia tudo na
borda. Conteúdo mudou → imagem nova → sobe → purga o cache.

É mais um projeto do `dev` (`github.com/rcaldas-com/dev`), no mesmo nível
de `web`, `wallet` e `emailer`: submódulo git + serviço no compose.

## Por que existe separado do `web`

Não é preferência de organização — os dois têm requisitos de cache
**opostos**, e isso é medido:

| | `site` | `web`/`car`/`wallet` |
|---|---|---|
| HTML | idêntico pra todo mundo, cacheável eternamente | por sessão, `private, no-cache, no-store` |
| runtime | nenhum | Node + Mongo + Redis |
| deploy | imagem nova = conteúdo novo | imagem nova = código novo |
| TTFB alvo | ~0 (borda) | ida à origem, sempre |

Misturar os dois num app só significa que o conteúdo público herda a
dinamicidade da sessão e nunca fica cacheável. Separar por hostname é o
que já foi feito pro upload (ver `up.rcaldas.com` abaixo) e é o mesmo
raciocínio.

## Domínios — divisão já definida

| hostname | Cloudflare | serve |
|---|---|---|
| `rcaldas.com` | proxied | **`site`** (raiz) + `/static/` + links curtos |
| `car.rcaldas.com` | proxied | **`site`** do car na raiz, app em `/dashboard` |
| `web.rcaldas.com` | proxied | app dinâmico (Monitor, DigitaR, finance) |
| `wallet.rcaldas.com` | proxied | app dinâmico |
| `up.rcaldas.com` | **DNS-only** | só `/upload` e `/digitar` (+ suas APIs) |

O `up` não é "o hostname do upload", é **o hostname sem Cloudflare**: ele
existe pros endpoints que esbarram em limite da *borda*, e são dois —
corpo acima de 100MB (413) e resposta acima de 100s (524). O upload bate
no primeiro, o OCR de PDF do DigitaR no segundo. Qualquer coisa nova com
um desses perfis entra ali; o resto nunca.

Raciocínio: o domínio curto e amigável é o que se divulga, e o que se
divulga é conteúdo estático. Ao entrar no sistema, a URL é **forçada**
pro hostname do app. Isso já está implementado no HAProxy pro `/upload`;
o mesmo padrão de `http-request redirect` serve pra qualquer outra
fronteira.

O `car.rcaldas.com` é o caso mais delicado: **um hostname, dois
backends**, separados por path. O HAProxy já faz exatamente isso pro
`patriciacaldas.com` (`patty-app` em `/dashboard`, `/login`, `/_next`,
`/favicon.ico`; `patty-redirect` no resto) — copiar esse padrão, prestando
atenção que `/_next` **tem que ir pro app**, senão o app carrega sem JS.

## Onde encaixa no repositório raiz

```
dev/                          github.com/rcaldas-com/dev
├── docker-compose.prod.yml   +1 servico: site
├── web/                      submodulo -> rcaldas-com/web
├── wallet/                   submodulo -> rcaldas-com/wallet
├── emailer/                  submodulo -> rcaldas-com/mailer
└── site/                     submodulo -> rcaldas-com/site   (novo)
```

Serviço novo no `docker-compose.prod.yml`:

```yaml
  site:
    image: registry.rcaldas.com/rcaldas/site:0.1
    restart: unless-stopped
    ports:
      - "8615:80"          # 8614 ja e' o rcaldas-static
    deploy:
      resources:
        limits:
          memory: 128M     # nginx servindo arquivo: nao precisa de mais
        reservations:
          memory: 16M
```

Sem `env_file`, sem rede `mailu_default`, sem `depends_on`. Um site
estático que precisa de variável de ambiente em runtime não é estático —
se aparecer essa necessidade, é sinal de que aquilo pertence ao `web`.

E o backend no `us.haproxy`:

```
### Site estatico
backend		rcaldas-site
	mode	http
	server	US	127.0.0.1:8615
```

### Sobre juntar o `car` aqui

Faz sentido e o argumento mais forte não é organização, é o `dev` host:
hoje o `car` roda num repo raiz próprio e **duplica redis, mongo e minio**.
Um compose só elimina três containers de uma vez e acaba com a divergência
de versão entre eles (o `car-redis` em produção já roda de uma imagem sem
tag — `cc48e0fe25c0` — enquanto o `rcweb-redis` é `redis:8-alpine`).

O que precisa de cuidado na fusão:
- **Mongo compartilhado já é fato** (car e web usam o mesmo banco e o mesmo
  cookie de sessão), então isso não é mudança, é reconhecer o que já é.
- **Minio/S3 do car guarda dado de produção.** O backup precisa continuar
  com bucket e credenciais separados (`BACKUP_S3_*`), nunca o mesmo bucket
  que guarda o dado copiado.
- O `.env` viraria um só, compartilhado por mais serviços. Hoje `web`,
  `wallet` e `emailer` já dividem um — o car entra no mesmo padrão.
- Emailer duplicado (`rcaldas-emailer-1` e `car-emailer-1`) também some.

Não é pré-requisito do `site`. É um trabalho independente e vale um chat
próprio.

---

## O app em si

### Config

```js
/** @type {import('next').NextConfig} */
module.exports = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,   // casa com o try_files do nginx
};
```

O que `output: 'export'` **não** permite, e precisa estar decidido antes
de escrever a primeira página:

- nada de Server Actions, route handlers (`app/api/*`) ou middleware
- nada de `cookies()`, `headers()`, `searchParams` no servidor
- `next/image` sem otimização sob demanda (daí o `unoptimized: true`) —
  as imagens precisam já sair otimizadas do build (webp/avif, tamanhos
  certos). É onde mais se ganha peso num site de vendas.
- formulário de contato não pode ser Server Action: aponta pro `web`
  (`https://web.rcaldas.com/api/...`, o que exige CORS explícito lá) ou
  pra um serviço externo

Blog em MDX lido do disco em build time (`@next/mdx` ou `content-collections`).

### Dockerfile

Conteúdo **dentro da imagem**, não bind-mount — é o que faz "subir versão"
ser só `docker compose up -d`:

```dockerfile
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build          # output: 'export' -> ./out

FROM nginx:alpine
COPY --from=builder /app/out /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

⚠️ Não repetir o bind-mount de arquivo único que o `rcaldas-static` usa
(`/var/rcaldas/live/static/nginx.conf` montado como arquivo). Editor que
grava por temp+rename troca o inode e o container continua com o conteúdo
velho até um `--force-recreate` — isso já custou tempo neste sistema.

### nginx.conf — dois regimes de cache, só dois

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;

    # assets hasheados pelo build: o nome muda quando o conteudo muda,
    # entao cache eterno e imutavel e' seguro por construcao
    location /_next/static/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # HTML: a borda segura por muito tempo (purgamos no deploy), o
    # navegador nao (senao uma correcao urgente fica presa no cliente)
    location / {
        try_files $uri $uri.html $uri/index.html /404.html;
        add_header Cache-Control "public, max-age=60, s-maxage=31536000";
    }
}
```

`s-maxage` alto + purge no deploy é o que deixa o site 100% na borda sem
risco de servir conteúdo velho.

**Isto depende do `Browser Cache TTL` da zona estar em "Respect Existing
Headers"** (já ajustado em 22/08/2026). Antes disso a Cloudflare
reescrevia o `max-age` da origem pra 4h — medido: o nginx do `/static/`
mandava `max-age=300` e chegava `max-age=14400` no cliente.

### Cache Rule na Cloudflare — aqui é obrigatória

Diferente dos assets: HTML **não tem extensão cacheável**, então a
Cloudflare não cacheia por padrão, por mais generoso que seja o
`Cache-Control` da origem.

- Caching → Cache Rules → Create rule
- `Hostname equals rcaldas.com` (escopar por hostname; path sozinho pega
  os outros sistemas)
- Cache eligibility: **Eligible for cache**
- Edge TTL: **Use cache-control header if present**

Sem essa regra o site fica `DYNAMIC` e todo acesso vai na origem — o
oposto do objetivo.

### Purge no deploy

O purge é o **último** passo, depois do container novo estar no ar. Purgar
antes só faz a borda recachear o conteúdo velho.

```bash
docker compose up -d site
until curl -fsS -o /dev/null http://127.0.0.1:8615/; do sleep 1; done
curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/purge_cache" \
  -H "Authorization: Bearer $CF_PURGE_TOKEN" -H "Content-Type: application/json" \
  --data '{"hosts":["rcaldas.com"]}'
```

Purge por `hosts` e não `purge_everything`: não faz sentido derrubar o
cache do `car`/`wallet`/`/static/` porque o site publicou um post.

**O `CF_TOKEN` que já existe NÃO serve pra isso** — testado em 22/08/2026:
uma chamada de purge com ele devolve `Authentication error` (code 10000).
Ele é o token do DDNS do Monitor e tem só escopo de DNS.

Criar um token novo (My Profile → API Tokens), permissão **`Zone → Cache
Purge → Purge`**, escopado só na zona `rcaldas.com`, e gravar como
`CF_PURGE_TOKEN` no `.env` do `us`. Token separado em vez de ampliar o do
DDNS: o do DDNS é distribuído pelo caminho do Monitor e não deve ganhar
poderes novos.

---

## Antes de virar a raiz `rcaldas.com` pro site

Hoje `hosts.map` manda `rcaldas.com` → `rcaldas-web`. A virada tem um
risco real de regressão, e é este:

**`rcaldas.com` é domínio de link curto.** `app/[slug]/route.ts` no `web`
resolve `rcaldas.com/<slug>` contra a coleção `short_links`. Se a raiz
passar a servir o `site`, **todo link curto já distribuído morre**.

Saídas, em ordem de preferência:
1. `use_backend rcaldas-web if rcaldas_url { path_reg ^/[A-Za-z0-9_-]{1,32}$ }`
   antes do backend do site — casa slug e não casa caminho com barra
   interna. Exige que as rotas de primeiro nível do site (`/blog`,
   `/produtos`) estejam na `RESERVED_SLUGS` do `web`, senão um slug pode
   sequestrar uma página.
2. Mover os links curtos pra um domínio próprio e curto — que é o que o
   `HOME.md` já anotou como pendência ("criador de links curtos, com
   suporte a domínios adicionais... quanto mais curto o domínio, melhor").
   Mais limpo, mas quebra os links existentes do mesmo jeito.

A opção 1 é a única que não quebra nada hoje. Decidir isso **antes** de
escrever a primeira rota do site, porque define quais caminhos de primeiro
nível o site pode usar.

Também conferir (já verificado, não afeta): `/static/`, `/ip` e `/rd` têm
`use_backend` próprio antes do map, e `/upload` já redireciona pro `up`.

---

## CI/CD — o alvo

Hoje o deploy é manual: build local → push pro `registry.rcaldas.com` →
`docker compose up -d` no `us`. O `site` é o melhor candidato pra
automatizar primeiro, porque errar nele não derruba sistema nenhum.

Desenho que reaproveita o que já existe na casa:

1. **Push no repo** → GitHub Actions builda e publica
   `registry.rcaldas.com/rcaldas/site:<sha>`.
2. **Homolog automático** — um `hom.rcaldas.com` fixo apontando pro
   serviço `site-hom` (mesma imagem, tag `:<sha>`), sem aprovação nenhuma.
   Um hostname fixo e não um por commit: por commit exigiria wildcard DNS
   **e** wildcard cert (os certs aqui são um por hostname, via certbot
   standalone na 8889). Se um dia quiser por commit, o caminho barato é um
   **Cloudflare Origin Certificate** wildcard `*.rcaldas.com` (grátis, 15
   anos, válido só entre a Cloudflare e a origem) — resolve o cert de
   qualquer hostname novo de uma vez.
3. **Email de aprovação pra produção** — mesmo padrão do
   `approve-tunnel-key` que já existe no `web`: link assinado no email, um
   clique promove a tag pra produção. Reusa o `emailer` (fila `email:send`
   no Redis) e o mesmo modelo de confiança.
4. **Deploy no `us`** — chave SSH restrita a um comando único, no mesmo
   estilo do `command="/usr/bin/rrsync -ro /",restrict` já usado pelo
   runner de backup. A chave só consegue rodar o script de deploy, nunca
   abrir shell.
5. **Purge** como último passo do script de deploy (acima).

O passo 3 é o que o resto do sistema já sabe fazer e o que dá o controle
que você quer: nada vai pra produção sem um clique humano, mas tudo que é
commitado já está no ar em algum lugar pra olhar.

---

## Armadilhas conhecidas desta infra

Já custaram tempo aqui e reaparecem no `site`:

- **Bind-mount de arquivo único** troca de inode em write+rename; o
  container fica no conteúdo velho sem erro nenhum. Por isso o conteúdo
  vai dentro da imagem.
- **`next.config` não é bind-montado no compose local** — testar mudança
  de config exige `docker compose cp` ou rebuild.
- **Convenção de arquivo de metadata do Next aninhada não vence a raiz**
  de forma confiável (custou 3 tentativas no PWA do `/monitor`). Num app
  `export` isso é menos provável, mas ao checar `<head>`, checar o HTML
  **renderizado**, não se o arquivo responde 200 isolado.
- **`stick-table type ip` no HAProxy é só IPv4** — se adicionar rate limit
  novo pro site, usar `type ipv6`.
