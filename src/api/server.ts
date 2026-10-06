// ============================================================
// api/server.ts — API REST da plataforma de licitações
// Execute: npm run dev:api
// ============================================================

import 'dotenv/config'
import express, { ErrorRequestHandler } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { ZodError } from 'zod'
import { authRouter } from './routes/auth'
import { adminRouter } from './routes/admin'
import { adminGestaoRouter } from './routes/adminGestao'
import { publicRouter } from './routes/public'
import { companyRouter } from './routes/company'
import { monitoredItemsRouter } from './routes/monitoredItems'
import { tendersRouter } from './routes/tenders'
import { matchesRouter } from './routes/matches'
import { companyDocumentsRouter } from './routes/companyDocuments'
import { dashboardRouter } from './routes/dashboard'
import { participationPlansRouter } from './routes/participationPlans'
import { uasgRouter } from './routes/uasg'
import { catalogRouter } from './routes/catalog'
import { radarRouter } from './routes/radar'
import { contaRouter } from './routes/conta'
import { estudosRouter } from './routes/estudos'
import { requireAuth } from './authMiddleware'
import { ApiError } from './asyncHandler'
import { globalLimiter, radarLimiter } from './rateLimit'
import { alertarFalha, instalarAlertasDoProcesso } from '../services/alertaOperacional'
import { JWT_SECRET_MIN, jwtSecretFraco } from '../services/authService'
import { iniciarImportacaoAutomatica } from '../services/catalogoBootstrap'
import { verificarProntidao } from '../services/prontidao'

const app = express()

// Railway/Vercel colocam a API atrás de proxy — sem isso o rate limit enxerga
// o IP do proxy e limita todo mundo junto. TRUST_PROXY_HOPS = quantos proxies há entre o
// cliente e a API (1 = só o Railway). Se entrar outro na frente (ex.: Cloudflare), aumente;
// com menos hops que o real, o X-Forwarded-For fica forjável e o limite por IP é contornado.
const saltosDeProxy = Number(process.env.TRUST_PROXY_HOPS ?? 1)
app.set('trust proxy', Number.isInteger(saltosDeProxy) && saltosDeProxy >= 0 && saltosDeProxy <= 5 ? saltosDeProxy : 1)

// preload por si só não entra na lista do navegador — isso exige submeter o
// domínio em hstspreload.org manualmente; o header só deixa o domínio elegível.
app.use(helmet({ hsts: { maxAge: 31536000, includeSubDomains: true, preload: true } }))

// CORS_ORIGINS vazio = libera geral, só aceitável em desenvolvimento. Em
// produção a lista precisa ser explícita (antes era cors() sem origem alguma,
// o que aceitava requisição autenticada vinda de qualquer site).
const corsOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

if (corsOrigins.length === 0 && process.env.NODE_ENV === 'production') {
  console.warn('[API] CORS_ORIGINS não configurada em produção — nenhuma origem de navegador será aceita.')
}

app.use(
  cors({
    origin: corsOrigins.length > 0 ? corsOrigins : process.env.NODE_ENV === 'production' ? false : true,
    credentials: true,
  })
)

app.use(express.json({ limit: '1mb' }))

// Liveness: o processo está de pé (não toca no banco).
app.get('/api/health', (_req, res) => res.json({ ok: true }))

// Readiness: o banco responde E tem todas as migrations do código. Usar como
// Healthcheck Path no Railway — impede que uma versão incompatível com o banco
// entre no ar (ver services/prontidao.ts). Fica antes do rate limit de propósito.
app.get('/api/health/ready', async (_req, res) => {
  const p = await verificarProntidao()
  res.status(p.ok ? 200 : 503).json(p)
})

app.use('/api', globalLimiter)

// Login/sessão — públicos por natureza. Criação de usuário é admin-only
// (ver /api/admin/users), não existe mais autocadastro aberto.
app.use('/api/auth', authRouter)
app.use('/api/public', publicRouter)
app.use('/api/admin', adminRouter)
app.use('/api/admin', adminGestaoRouter)

// Todo o resto da plataforma exige sessão válida — a identidade do
// usuário vem do token (req.userId), não de um campo enviado pelo cliente.
app.use('/api/company', requireAuth, companyRouter)
app.use('/api/monitored-items', requireAuth, monitoredItemsRouter)
app.use('/api/tenders', requireAuth, tendersRouter)
app.use('/api/matches', requireAuth, matchesRouter)
app.use('/api/company-documents', requireAuth, companyDocumentsRouter)
app.use('/api/dashboard', requireAuth, dashboardRouter)
app.use('/api/participation-plans', requireAuth, participationPlansRouter)
app.use('/api/uasg', requireAuth, uasgRouter)
app.use('/api/catalog', requireAuth, catalogRouter)
app.use('/api/radar', requireAuth, radarLimiter, radarRouter)
app.use('/api/conta', requireAuth, contaRouter)
app.use('/api/estudos', requireAuth, estudosRouter)

const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Dados inválidos', details: err.issues })
    return
  }
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message, ...err.extra })
    return
  }
  // express.json() joga um erro aqui (type: entity.parse.failed) quando o
  // corpo não é JSON válido — é erro de cliente (400), não de servidor (500);
  // sem isso poluía os logs de erro 500 com requisição mal formada de quem
  // está chamando a API.
  if (err instanceof SyntaxError && (err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Corpo da requisição não é um JSON válido' })
    return
  }
  console.error('[API] Erro não tratado:', err)
  // Rota sem ids (ex.: /api/tenders/:id) para o silêncio agrupar erros iguais.
  void alertarFalha('api', `${req.method} ${req.baseUrl}${req.route?.path ?? ''}`, err)
  res.status(500).json({ error: 'Erro interno' })
}
app.use(errorHandler)

// Railway injeta PORT automaticamente pra serviços com domínio público —
// API_PORT continua valendo pra rodar local sem depender dessa variável.
const PORT = Number(process.env.PORT ?? process.env.API_PORT ?? 3333)

// Os testes de integração importam o app e o sobem numa porta própria; sem
// esta guarda, importar o módulo já abriria a porta e a importação automática.
export { app }
if (process.env.NODE_ENV !== 'test') {
  instalarAlertasDoProcesso('api')
  // Não derruba a API (trocar o segredo desloga todo mundo; é decisão de quem opera),
  // mas avisa alto: segredo curto permite forjar sessão de qualquer usuário.
  if (jwtSecretFraco()) {
    console.error(`[Segurança] JWT_SECRET tem menos de ${JWT_SECRET_MIN} caracteres. Gere um novo (ver docs/CHECKLIST_COLOCAR_NO_AR.md).`)
    void alertarFalha('api', 'JWT_SECRET fraco', new Error(`JWT_SECRET com menos de ${JWT_SECRET_MIN} caracteres`))
  }
}
if (process.env.NODE_ENV !== 'test') app.listen(PORT, () => {
  console.log(`🌐 API rodando em http://localhost:${PORT}`)
  // Popula/renova UASGs e catálogo CATMAT/CATSER em segundo plano (ver
  // catalogoBootstrap.ts). Só liga em produção ou com AUTO_IMPORT_CATALOGOS=true.
  iniciarImportacaoAutomatica()
})
