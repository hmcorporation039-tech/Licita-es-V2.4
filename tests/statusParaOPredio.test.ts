import { describe, expect, it, vi } from 'vitest'
import { FotoDaBela, enviarSinal, erroResumido, montarSinais } from '../src/services/statusParaOPredio'

const agora = new Date('2026-11-12T15:00:00Z')
const minutosAtras = (m: number) => new Date(agora.getTime() - m * 60_000)

function foto(mudar: Partial<FotoDaBela> = {}): FotoDaBela {
  return {
    coleta: { rodando: null, ultimaFalha: null, ultimoSucesso: minutosAtras(20), novasHoje: 10 },
    casamento: { ultimo: minutosAtras(30), hoje: 4 },
    analise: { rodando: 0, ultimaFalha: null, ultimaConcluida: minutosAtras(60), hoje: 2 },
    orcamento: { ultimo: null, hoje: 0 },
    estrategia: { rodando: 0, ultimaFalha: null, ultimaConcluida: null, hoje: 0 },
    bela: { pregoesAoVivo: 0, lancesHoje: 0 },
    ...mudar,
  }
}

const doAgente = (sinais: ReturnType<typeof montarSinais>, agente: string) => sinais.find((s) => s.agente === agente)!

describe('status dos agentes para o Prédio H&M', () => {
  it('manda os 6 agentes, ociosos quando nada está rodando, com os números do dia', () => {
    const sinais = montarSinais(foto(), null, agora)
    expect(sinais.map((s) => s.agente)).toEqual(['garimpeira', 'casadora', 'analista', 'orcamentista', 'estrategista', 'bela'])
    expect(sinais.every((s) => s.status === 'ocioso')).toBe(true)
    expect(doAgente(sinais, 'garimpeira').metricas.licitacoes_hoje).toBe(10)
    expect(sinais.some((s) => s.passa_para)).toBe(false) // primeiro ciclo: sem comparação, sem papel voando
  })

  it('coleta rodando deixa a Garimpeira trabalhando; pregão aberto, a Bela', () => {
    const sinais = montarSinais(foto({ coleta: { ...foto().coleta, rodando: 'coletor-pncp' }, bela: { pregoesAoVivo: 2, lancesHoje: 5 } }), null, agora)
    expect(doAgente(sinais, 'garimpeira')).toMatchObject({ status: 'trabalhando', mensagem: 'Lendo PNCP' })
    expect(doAgente(sinais, 'bela')).toMatchObject({ status: 'trabalhando', mensagem: 'Acompanhando 2 pregões ao vivo' })
  })

  it('falha recente sem sucesso depois vira erro; falha antiga ou já superada, não', () => {
    const comFalha = (em: Date, ultimoSucesso: Date) => foto({ coleta: { rodando: null, ultimaFalha: { fonte: 'TCE-RS', erro: 'timeout', em }, ultimoSucesso, novasHoje: 10 } })
    expect(doAgente(montarSinais(comFalha(minutosAtras(5), minutosAtras(40)), null, agora), 'garimpeira')).toMatchObject({ status: 'erro', mensagem: 'TCE-RS: timeout' })
    expect(doAgente(montarSinais(comFalha(minutosAtras(5), minutosAtras(1)), null, agora), 'garimpeira').status).toBe('ocioso')
    expect(doAgente(montarSinais(comFalha(minutosAtras(90), minutosAtras(120)), null, agora), 'garimpeira').status).toBe('ocioso')
  })

  it('número do dia que cresce passa a tarefa ao próximo agente', () => {
    const antes = foto()
    const depois = foto({ coleta: { ...antes.coleta, novasHoje: 13 }, casamento: { ultimo: minutosAtras(1), hoje: 5 } })
    const sinais = montarSinais(depois, antes, agora)
    expect(doAgente(sinais, 'garimpeira').passa_para).toEqual({ agente: 'casadora', item: '3 licitações novas' })
    expect(doAgente(sinais, 'casadora')).toMatchObject({ status: 'trabalhando', passa_para: { agente: 'analista', item: '1 aviso para cliente' } })
    expect(doAgente(sinais, 'analista').passa_para).toBeUndefined()
  })

  it('na virada do dia (número cai) não inventa passagem', () => {
    const sinais = montarSinais(foto({ coleta: { ...foto().coleta, novasHoje: 0 } }), foto(), agora)
    expect(doAgente(sinais, 'garimpeira').passa_para).toBeUndefined()
  })

  it('erro vai para a tela sem endereço completo e curto', () => {
    expect(erroResumido('Request failed https://api.exemplo.gov.br/v1/editais?token=abc&x=1 status 500')).toBe('Request failed api.exemplo.gov.br status 500')
    expect(erroResumido('x'.repeat(500))).toHaveLength(140)
    expect(erroResumido(null)).toBe('Falha sem mensagem')
  })

  it('sem CENTRAL_STATUS_URL não chama a rede; com ela, manda o token e engole a falha', async () => {
    const sinal = montarSinais(foto(), null, agora)[0]
    const rede = vi.fn()
    expect(await enviarSinal(sinal, {}, rede as unknown as typeof fetch)).toBe(false)
    expect(rede).not.toHaveBeenCalled()

    const ok = vi.fn().mockResolvedValue({ ok: true })
    expect(await enviarSinal(sinal, { CENTRAL_STATUS_URL: 'https://central.exemplo/', CENTRAL_STATUS_TOKEN: 't' }, ok as unknown as typeof fetch)).toBe(true)
    const [url, init] = ok.mock.calls[0]
    expect(url).toBe('https://central.exemplo/api/status')
    expect(init.headers.Authorization).toBe('Bearer t')
    expect(JSON.parse(init.body)).toMatchObject({ sistema: 'licita-bela', agente: 'garimpeira' })

    const caiu = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    expect(await enviarSinal(sinal, { CENTRAL_STATUS_URL: 'https://central.exemplo' }, caiu as unknown as typeof fetch)).toBe(false)
  })
})
