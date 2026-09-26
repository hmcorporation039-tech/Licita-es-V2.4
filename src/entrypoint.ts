// ============================================================
// entrypoint.ts — Ponto de entrada único em produção (Railway). Os dois
// serviços (api, workers) rodam a mesma imagem/build; qual metade liga é
// decidido pela variável SERVICE_ROLE definida em cada serviço no Railway.
// Evita precisar configurar um "start command" diferente por serviço —
// o builder já detecta e roda `npm start` por padrão.
// ============================================================

// require() e não import: carregar só a metade que este serviço vai rodar.
// Um import estático subiria a API e os workers no mesmo processo.
/* eslint-disable @typescript-eslint/no-require-imports */
if (process.env.SERVICE_ROLE === 'workers') {
  require('./workers')
} else {
  require('./api/server')
}
