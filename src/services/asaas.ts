import { CICLO_NO_ASAAS, JUROS_AO_MES_PERCENTUAL, MULTA_PERCENTUAL, centavosParaReais, configuracaoDoAsaas, type AmbienteDoAsaas, type Ciclo } from '../lib/cobranca'

export interface CobrancaDoAsaas {
  id: string
  status: string
  billingType: string | null
  value: number
  netValue: number | null
  dueDate: string
  paymentDate: string | null
  clientPaymentDate: string | null
  confirmedDate: string | null
  invoiceUrl: string | null
  subscription: string | null
  deleted: boolean
}

export interface NovoCliente {
  nome: string
  documento: string
  email: string
  referencia: string
}

export interface NovaAssinatura {
  cliente: string
  valorCentavos: number
  ciclo: Ciclo
  vencimento: string
  descricao: string
  referencia: string
}

export interface Cobrador {
  ambiente: AmbienteDoAsaas
  criarCliente(dados: NovoCliente): Promise<{ id: string }>
  criarAssinatura(dados: NovaAssinatura): Promise<{ id: string }>
  cobrancasDaAssinatura(assinaturaId: string): Promise<CobrancaDoAsaas[]>
  buscarCobranca(cobrancaId: string): Promise<CobrancaDoAsaas>
  cancelarAssinatura(assinaturaId: string): Promise<void>
  mudarValorDaAssinatura(assinaturaId: string, valorCentavos: number): Promise<void>
  estornarCobranca(cobrancaId: string): Promise<void>
}

export class ErroDoAsaas extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly paraOCliente: string | null
  ) {
    super(message)
  }
}

function lerCobranca(json: unknown): CobrancaDoAsaas {
  const c = (json ?? {}) as Record<string, unknown>
  const textoOuNulo = (v: unknown) => (typeof v === 'string' && v ? v : null)
  if (typeof c.id !== 'string' || typeof c.status !== 'string' || typeof c.dueDate !== 'string') throw new ErroDoAsaas('Cobrança do Asaas fora do formato esperado', 502, null)
  return {
    id: c.id,
    status: c.status,
    billingType: textoOuNulo(c.billingType),
    value: typeof c.value === 'number' ? c.value : 0,
    netValue: typeof c.netValue === 'number' ? c.netValue : null,
    dueDate: c.dueDate,
    paymentDate: textoOuNulo(c.paymentDate),
    clientPaymentDate: textoOuNulo(c.clientPaymentDate),
    confirmedDate: textoOuNulo(c.confirmedDate),
    invoiceUrl: textoOuNulo(c.invoiceUrl),
    subscription: textoOuNulo(c.subscription),
    deleted: c.deleted === true,
  }
}

function descricaoDosErros(json: unknown): string | null {
  const erros = (json as { errors?: { description?: unknown }[] } | null)?.errors
  if (!Array.isArray(erros)) return null
  const textos = erros.map((e) => (typeof e?.description === 'string' ? e.description : '')).filter(Boolean)
  return textos.length ? textos.join(' ').slice(0, 300) : null
}

export function cobradorHttp(config: { ambiente: AmbienteDoAsaas; base: string; chave: string }, tempoLimiteMs = 20_000): Cobrador {
  async function chamar(metodo: 'GET' | 'POST' | 'DELETE', caminho: string, corpo?: unknown): Promise<unknown> {
    let resposta: Response
    try {
      resposta = await fetch(`${config.base}${caminho}`, {
        method: metodo,
        headers: { access_token: config.chave, 'Content-Type': 'application/json', 'User-Agent': 'LicitaBela/1.0' },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(tempoLimiteMs),
      })
    } catch (err) {
      throw new ErroDoAsaas(`Asaas não respondeu (${metodo} ${caminho.split('?')[0]}): ${err instanceof Error ? err.message : err}`, 503, null)
    }
    const bruto = await resposta.text()
    let json: unknown
    try {
      json = bruto ? JSON.parse(bruto) : null
    } catch {
      json = null
    }
    if (!resposta.ok) {
      const descricao = descricaoDosErros(json)
      throw new ErroDoAsaas(`Asaas recusou ${metodo} ${caminho.split('?')[0]} (HTTP ${resposta.status}): ${descricao ?? 'sem detalhe'}`, resposta.status, resposta.status === 400 ? descricao : null)
    }
    return json
  }

  return {
    ambiente: config.ambiente,
    async criarCliente(d) {
      const r = (await chamar('POST', '/customers', {
        name: d.nome,
        cpfCnpj: d.documento,
        email: d.email,
        externalReference: d.referencia,
        notificationDisabled: true,
      })) as { id?: unknown }
      if (typeof r?.id !== 'string') throw new ErroDoAsaas('Cliente do Asaas sem id', 502, null)
      return { id: r.id }
    },
    async criarAssinatura(d) {
      const r = (await chamar('POST', '/subscriptions', {
        customer: d.cliente,
        billingType: 'UNDEFINED',
        value: centavosParaReais(d.valorCentavos),
        nextDueDate: d.vencimento,
        cycle: CICLO_NO_ASAAS[d.ciclo],
        description: d.descricao.slice(0, 500),
        externalReference: d.referencia,
        fine: { value: MULTA_PERCENTUAL, type: 'PERCENTAGE' },
        interest: { value: JUROS_AO_MES_PERCENTUAL },
      })) as { id?: unknown }
      if (typeof r?.id !== 'string') throw new ErroDoAsaas('Assinatura do Asaas sem id', 502, null)
      return { id: r.id }
    },
    async cobrancasDaAssinatura(assinaturaId) {
      const r = (await chamar('GET', `/subscriptions/${encodeURIComponent(assinaturaId)}/payments?limit=100`)) as { data?: unknown[] }
      return (Array.isArray(r?.data) ? r.data : []).map(lerCobranca)
    },
    async buscarCobranca(cobrancaId) {
      return lerCobranca(await chamar('GET', `/payments/${encodeURIComponent(cobrancaId)}`))
    },
    async cancelarAssinatura(assinaturaId) {
      await chamar('DELETE', `/subscriptions/${encodeURIComponent(assinaturaId)}`)
    },
    async mudarValorDaAssinatura(assinaturaId, valorCentavos) {
      await chamar('POST', `/subscriptions/${encodeURIComponent(assinaturaId)}`, { value: centavosParaReais(valorCentavos), updatePendingPayments: true })
    },
    async estornarCobranca(cobrancaId) {
      await chamar('POST', `/payments/${encodeURIComponent(cobrancaId)}/refund`, {})
    },
  }
}

let cobradorDeTeste: Cobrador | null | undefined

export function usarCobradorDeTeste(cobrador: Cobrador | null | undefined): void {
  cobradorDeTeste = cobrador
}

let avisouChaveInvalida = false

export function cobrador(env: NodeJS.ProcessEnv = process.env): Cobrador | null {
  if (cobradorDeTeste !== undefined) return cobradorDeTeste
  const config = configuracaoDoAsaas(env)
  if (!config) {
    if (env.ASAAS_API_KEY && !avisouChaveInvalida) {
      avisouChaveInvalida = true
      console.error('[Cobrança] ASAAS_API_KEY não confere com ASAAS_AMBIENTE (chave de teste começa com $aact_hmlg_, de produção com $aact_prod_). Cobrança desligada.')
    }
    return null
  }
  return cobradorHttp(config)
}
