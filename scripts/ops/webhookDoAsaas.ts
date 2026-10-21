import { configuracaoDoAsaas } from '../../src/lib/cobranca'

const EVENTOS = [
  'PAYMENT_CREATED',
  'PAYMENT_UPDATED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'PAYMENT_OVERDUE',
  'PAYMENT_DELETED',
  'PAYMENT_RESTORED',
  'PAYMENT_REFUNDED',
  'PAYMENT_REFUND_IN_PROGRESS',
  'PAYMENT_RECEIVED_IN_CASH_UNDONE',
  'PAYMENT_CHARGEBACK_REQUESTED',
  'PAYMENT_CHARGEBACK_DISPUTE',
  'PAYMENT_AWAITING_CHARGEBACK_REVERSAL',
  'SUBSCRIPTION_DELETED',
  'SUBSCRIPTION_INACTIVATED',
]

const NOME = 'Licita Bela'

async function chamar(metodo: 'GET' | 'POST' | 'DELETE', caminho: string, corpo?: unknown): Promise<unknown> {
  const config = configuracaoDoAsaas()
  if (!config) throw new Error('ASAAS_API_KEY ausente ou sem combinar com ASAAS_AMBIENTE')
  const r = await fetch(`${config.base}${caminho}`, {
    method: metodo,
    headers: { access_token: config.chave, 'Content-Type': 'application/json', 'User-Agent': 'LicitaBela/1.0' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(20_000),
  })
  const texto = await r.text()
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${texto.slice(0, 500)}`)
  return texto ? JSON.parse(texto) : null
}

interface Webhook {
  id: string
  name: string
  url: string
  enabled: boolean
  interrupted: boolean
  events: string[]
}

async function listar(): Promise<Webhook[]> {
  const r = (await chamar('GET', '/webhooks?limit=100')) as { data?: Webhook[] }
  return r?.data ?? []
}

async function main() {
  const [acao, url, email] = process.argv.slice(2)
  console.log(`Ambiente: ${configuracaoDoAsaas()?.ambiente ?? 'sem chave'}`)
  if (acao === 'listar') {
    for (const w of await listar()) console.log(`${w.id} | ${w.name} | ${w.url} | ativo=${w.enabled} | pausado=${w.interrupted} | ${w.events.length} eventos`)
    return
  }
  if (acao === 'apagar') {
    for (const w of (await listar()).filter((w) => w.name === NOME)) {
      await chamar('DELETE', `/webhooks/${w.id}`)
      console.log(`Apagado: ${w.id} (${w.url})`)
    }
    return
  }
  if (acao === 'criar') {
    const token = process.env.ASAAS_WEBHOOK_TOKEN
    if (!url?.startsWith('https://') || !email?.includes('@')) throw new Error('Uso: criar <https://.../api/cobranca/webhook> <email-para-avisos>')
    if (!token || token.length < 32) throw new Error('ASAAS_WEBHOOK_TOKEN ausente ou com menos de 32 caracteres')
    if ((await listar()).some((w) => w.name === NOME)) throw new Error('Já existe um webhook "Licita Bela". Rode "apagar" antes.')
    const criado = (await chamar('POST', '/webhooks', {
      name: NOME,
      url,
      email,
      enabled: true,
      interrupted: false,
      apiVersion: 3,
      authToken: token,
      sendType: 'SEQUENTIALLY',
      events: EVENTOS,
    })) as Webhook
    console.log(`Criado: ${criado.id} -> ${criado.url} (${criado.events.length} eventos)`)
    return
  }
  throw new Error('Uso: webhookDoAsaas.ts listar | apagar | criar <url> <email>')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
