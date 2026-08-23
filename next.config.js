/** @type {import('next').NextConfig} */

// output: 'export' -- este projeto nao tem runtime. O build cospe HTML/CSS/JS
// em ./out, um nginx serve, e a Cloudflare cacheia na borda. E' o que separa
// este app do web/car/wallet: aqui NADA depende de sessao, entao tudo pode
// ser cacheado eternamente e purgado no deploy.
//
// O que isso proibe, e que precisa estar claro antes de escrever pagina:
//   - Server Actions, route handlers (app/api/*) e middleware
//   - cookies(), headers(), searchParams no servidor
//   - otimizacao de imagem sob demanda (dai o unimized abaixo)
// Se aparecer necessidade de qualquer um desses, aquilo pertence ao `web`,
// nao aqui -- e' o sinal de que a pagina nao e' conteudo publico.
//
// Nao existe assetPrefix aqui de proposito: os assets saem do MESMO hostname
// que serve a pagina. Ver a nota longa em web/next.config.mjs.
module.exports = {
  output: 'export',
  images: { unoptimized: true },
  // casa com o `try_files $uri $uri/index.html` do nginx.conf
  trailingSlash: true,
};
