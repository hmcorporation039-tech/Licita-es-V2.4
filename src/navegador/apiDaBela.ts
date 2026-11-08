// ============================================================
// navegador/apiDaBela.ts — O navegador conversa com a API da Bela com o token da própria
// pessoa (o mesmo que a extensão usa): autoriza a sessão e registra lance e chat pelos
// mesmos endpoints do "Pregão com a Bela". O token fica só na memória da sessão.
// ============================================================

export interface AutorizacaoDaSessao {
  userId: string
  companyId: string
  tenderId: string
  inicio: string
  portal: string
  nomeDoPortal: string
  hostsPermitidos: string[]
}

export interface AcessoSalvo {
  portal: string
  login: string
  senha: string
}

export interface PainelResumido {
  robo?: { disponivel?: boolean; instrucoes?: { alvo: string; acao: string; valor?: number | null }[] }
}

export class ErroDaApi extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
    readonly codigo?: string
  ) {
    super(mensagem)
  }
}

export interface ApiDaBela {
  autorizar(token: string, tenderId: string, portal?: string): Promise<AutorizacaoDaSessao>
  /** Login e senha de Meus Portais para o portal desta página (só com NAVEGADOR_SEGREDO). */
  acessoSalvo(token: string, tenderId: string, host: string): Promise<AcessoSalvo>
  painel(token: string, tenderId: string): Promise<PainelResumido>
  registrarMelhorLance(token: string, tenderId: string, valor: number): Promise<void>
  registrarMensagens(token: string, tenderId: string, mensagens: unknown[]): Promise<void>
  registrarPreenchimento(token: string, tenderId: string, valor: number): Promise<void>
}

export function apiDaBela(base: string, segredo?: string): ApiDaBela {
  const raiz = base.replace(/\/+$/, '')
  async function chamar<T>(token: string, metodo: string, caminho: string, corpo?: unknown, extras: Record<string, string> = {}): Promise<T> {
    const r = await fetch(raiz + caminho, {
      method: metodo,
      headers: { authorization: `Bearer ${token}`, ...(corpo === undefined ? {} : { 'content-type': 'application/json' }), ...extras },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(20_000),
    })
    const texto = await r.text()
    let json: Record<string, unknown> = {}
    try {
      json = texto ? (JSON.parse(texto) as Record<string, unknown>) : {}
    } catch {
      /* resposta não JSON */
    }
    if (!r.ok) throw new ErroDaApi(r.status, typeof json.error === 'string' ? json.error : `A Bela respondeu ${r.status}.`, typeof json.code === 'string' ? json.code : undefined)
    return json as T
  }
  return {
    autorizar: (token, tenderId, portal) => chamar(token, 'POST', '/api/portal-na-bela/sessao', portal ? { tenderId, portal } : { tenderId }),
    acessoSalvo: async (token, tenderId, host) => {
      if (!segredo) throw new ErroDaApi(503, 'O preenchimento do login ainda não foi ativado no navegador da Bela.', 'SEGREDO_DO_NAVEGADOR')
      return chamar(token, 'POST', '/api/portal-na-bela/acesso-salvo', { tenderId, host }, { 'x-navegador-segredo': segredo })
    },
    painel: (token, tenderId) => chamar(token, 'GET', `/api/tenders/${tenderId}/pregao`),
    registrarMelhorLance: async (token, tenderId, valor) => {
      await chamar(token, 'POST', `/api/tenders/${tenderId}/pregao/lances`, { alvo: 'global', origem: 'MELHOR_LANCE', valor })
    },
    registrarMensagens: async (token, tenderId, mensagens) => {
      await chamar(token, 'POST', `/api/tenders/${tenderId}/pregao/mensagens`, { mensagens })
    },
    registrarPreenchimento: async (token, tenderId, valor) => {
      await chamar(token, 'POST', `/api/tenders/${tenderId}/pregao/robo/preenchido`, { valor })
    },
  }
}
