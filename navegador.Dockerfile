# ============================================================
# Serviço "navegador da Bela" (Portal dentro da Bela), separado da API e dos workers.
# No Railway: novo serviço deste repositório com a variável
#   RAILWAY_DOCKERFILE_PATH=navegador.Dockerfile
# A imagem do Playwright já traz o Chromium e as bibliotecas do sistema.
# A versão da imagem precisa ser a mesma do playwright-core do package.json.
# ============================================================
FROM mcr.microsoft.com/playwright:v1.56.1-noble

WORKDIR /app
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --include=dev

COPY tsconfig.json ./
COPY src ./src
COPY extensao-bela ./extensao-bela
RUN npx tsc -p tsconfig.json && npm prune --omit=dev

# Usuário sem privilégios (a imagem do Playwright já tem o pwuser).
USER pwuser
EXPOSE 8080
CMD ["node", "dist/navegador/server.js"]
