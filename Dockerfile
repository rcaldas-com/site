FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# Conteudo DENTRO da imagem, nunca bind-mount: e' o que faz "subir versao"
# ser so `docker compose up -d`, e evita a armadilha de bind-mount de
# arquivo unico (editor grava por temp+rename, o inode troca e o container
# fica no conteudo velho sem erro nenhum -- ja custou tempo neste sistema).
FROM nginx:alpine
LABEL maintainer="RCaldas <docker@rcaldas.com>"
COPY --from=builder /app/out /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
