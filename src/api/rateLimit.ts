// ============================================================
// api/rateLimit.ts — Limites de requisição por IP.
// O /api/auth/login não tinha limite nenhum: força bruta de senha
// era livre e barata.
// ============================================================

import rateLimit from 'express-rate-limit'

const JANELA_MS = 15 * 60 * 1000

// A suíte E2E faz dezenas de logins do mesmo IP em segundos e bateria no
// limite. RATE_LIMIT_DISABLED existe só para isso — ver o script test:e2e.
// Em produção é um erro fatal: desligar o limite de força bruta num ambiente
// exposto nunca é intencional, então travamos o boot em vez de rodar sem ele.
const desligado = process.env.RATE_LIMIT_DISABLED === 'true'
if (desligado && process.env.NODE_ENV === 'production') {
  throw new Error(
    'RATE_LIMIT_DISABLED=true em produção — isto libera força bruta de senha. Remova a variável.'
  )
}

function limite(valor: number): number {
  return desligado ? Number.MAX_SAFE_INTEGER : valor
}

export const globalLimiter = rateLimit({
  windowMs: JANELA_MS,
  limit: limite(600),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas requisições — aguarde alguns minutos e tente de novo' },
})

export const loginLimiter = rateLimit({
  windowMs: JANELA_MS,
  limit: limite(10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Login que deu certo não conta para o limite — quem sabe a senha não é
  // penalizado por alguém tentando adivinhá-la do mesmo IP.
  skipSuccessfulRequests: true,
  message: { error: 'Muitas tentativas de login — aguarde alguns minutos e tente de novo' },
})

export const escritaSensivelLimiter = rateLimit({
  windowMs: JANELA_MS,
  limit: limite(60),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas requisições — aguarde alguns minutos e tente de novo' },
})

// Troca de senha: um token roubado poderia tentar adivinhar a senha ATUAL em
// massa (cada tentativa é um bcrypt.compare) sem cair no limite global. Limite
// próprio, mais apertado, por IP.
export const changePasswordLimiter = rateLimit({
  windowMs: JANELA_MS,
  limit: limite(10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas — aguarde alguns minutos e tente de novo' },
})

// Cadastro público: cada tentativa gera um bcrypt e pode disparar e-mail.
// Por IP e por hora, para frear criação em massa de contas de teste.
export const cadastroLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: limite(10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de cadastro — aguarde um pouco e tente de novo' },
})

// Confirmação de e-mail e recuperação de senha: cada chamada pode disparar um
// e-mail. Sem limite próprio, dava para usar o sistema para encher a caixa de
// alguém (ou queimar a cota do provedor de e-mail).
export const recuperacaoLimiter = rateLimit({
  windowMs: JANELA_MS,
  limit: limite(10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas solicitações — aguarde alguns minutos e tente de novo' },
})

// Radar: cada consulta pode buscar milhares de contratos no PNCP. Por USUÁRIO (não por IP),
// para que um cliente não esgote o PNCP nem a API para os demais.
export const radarLimiter = rateLimit({
  windowMs: JANELA_MS,
  limit: limite(40),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? 'anonimo',
  message: { error: 'Muitas consultas ao Radar — aguarde alguns minutos e tente de novo' },
})

// Login por CONTA (e-mail digitado), além do limite por IP: senão um ataque distribuído
// (muitos IPs) contra um mesmo e-mail não era freado. Só conta as tentativas que falham.
export const loginPorContaLimiter = rateLimit({
  windowMs: JANELA_MS,
  limit: limite(40),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = (req.body as { email?: unknown } | undefined)?.email
    return typeof email === 'string' ? 'conta:' + email.trim().toLowerCase() : 'conta:?'
  },
  message: { error: 'Muitas tentativas para esta conta — aguarde alguns minutos ou redefina a senha' },
})

// Pesquisa de preços de mercado: cada chamada consulta a API do Compras.gov.br. Por USUÁRIO.
export const estudoPrecosLimiter = rateLimit({
  windowMs: JANELA_MS,
  limit: limite(120),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? 'anonimo',
  message: { error: 'Muitas pesquisas de preços — aguarde alguns minutos e tente de novo' },
})

// Confirmação por código: por CONTA (e-mail digitado), além do limite por IP, para barrar
// quem tenta adivinhar os 6 dígitos de uma conta específica a partir de muitos IPs.
export const codigoPorContaLimiter = rateLimit({
  windowMs: JANELA_MS,
  limit: limite(12),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = (req.body as { email?: unknown } | undefined)?.email
    return typeof email === 'string' ? 'codigo:' + email.trim().toLowerCase() : 'codigo:?'
  },
  message: { error: 'Muitas tentativas para esta conta — aguarde alguns minutos e peça um novo código' },
})

// Por USUÁRIO: rematch varre 90 dias de licitações e enfileira e-mails.
export const rematchLimiter = rateLimit({
  windowMs: JANELA_MS,
  limit: limite(10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? 'anonimo',
  message: { error: 'Muitas buscas em andamento — aguarde alguns minutos e tente de novo' },
})

// Estudo de custos: recalcular enquanto digita é leve; o PDF gasta CPU. Ambos por usuário.
export const estudoCalculoLimiter = rateLimit({
  windowMs: JANELA_MS,
  limit: limite(600),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? 'anonimo',
  message: { error: 'Muitas requisições — aguarde alguns minutos e tente de novo' },
})

export const estudoPdfLimiter = rateLimit({
  windowMs: JANELA_MS,
  limit: limite(30),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? 'anonimo',
  message: { error: 'Muitos PDFs gerados — aguarde alguns minutos e tente de novo' },
})

// Consulta de CEP (chama um serviço externo): por usuário.
export const cepLimiter = rateLimit({
  windowMs: JANELA_MS,
  limit: limite(60),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? 'anonimo',
  message: { error: 'Muitas consultas de CEP — aguarde alguns minutos e tente de novo' },
})
