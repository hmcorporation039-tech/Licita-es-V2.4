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
import { companyRouter } from './routes/company'
import { monitoredItemsRouter } from './routes/monitoredItems'
import { tendersRouter } from './routes/tenders'
import { matchesRouter } from './routes/matches'
import { companyDocumentsRouter } from './routes/companyDocuments'
import { dashboardRouter } from './routes/dashboard'
import { participationPlansRouter } from './routes/participationPlans'
import { uasgRouter } from './routes/uasg'
import { catalogRouter } from './routes/catalog'
import { requireAuth } from './authMiddleware'
import { ApiError } from './asyncHandler'
import { globalLimiter } from './rateLimit'

const app = express()

// Railway/Vercel colocam a API atrás de proxy — sem isso o rate limit enxerga
// o IP do proxy e limita todo mundo junto.
app.set('trust proxy', 1)

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

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.use('/api', globalLimiter)

// Login/sessão — públicos por natureza. Criação de usuário é admin-only
// (ver /api/admin/users), não existe mais autocadastro aberto.
app.use('/api/auth', authRouter)
app.use('/api/admin', adminRouter)

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

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Dados inválidos', details: err.issues })
    return
  }
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message })
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
  res.status(500).json({ error: 'Erro interno' })
}
app.use(errorHandler)

// Railway injeta PORT automaticamente pra serviços com domínio público —
// API_PORT continua valendo pra rodar local sem depender dessa variável.
const PORT = Number(process.env.PORT ?? process.env.API_PORT ?? 3333)
app.listen(PORT, () => {
  console.log(`🌐 API rodando em http://localhost:${PORT}`)
})
