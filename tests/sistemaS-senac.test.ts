import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RespostaDoSenac, lerRespostaDoSenac, parseLicitacoesDoSenac, urlDoDocumentoDoSenac } from '../src/services/sistemaS/senac'

const ler = (nome: string) => readFileSync(join(__dirname, 'fixtures/sistemaS', nome), 'utf8')
const AGORA = new Date('2026-10-15T15:00:00Z')

const sc = lerRespostaDoSenac(ler('senac-sc.json'))
const rs = lerRespostaDoSenac(ler('senac-rs.json'))

function comUmaLicitacao(base: RespostaDoSenac, mudancas: Record<string, unknown>): RespostaDoSenac {
  const grupo = base.data![0]
  const licitacao = { ...grupo.dadosModalidadeLicitacao![0], ...mudancas }
  return { success: true, data: [{ ...grupo, dadosModalidadeLicitacao: [licitacao] }] }
}

describe('Senac — API nacional de transparência', () => {
  const r = parseLicitacoesDoSenac(sc, 'sc', AGORA)
  const numeros = r.map((t) => t.numeroControle)

  it('mantém só o que está em processo e com abertura de hoje em diante', () => {
    expect(numeros).toContain('07/2026')
    expect(numeros).toContain('33/2026')
    expect(numeros).not.toContain('08/2026')
    expect(numeros).not.toContain('32/2026')
    expect(numeros).not.toContain('08/2025')
    expect(r.every((t) => t.rawJson.situacao === 'Em processo')).toBe(true)
  })

  it('descarta finalizada, cancelada e suspensa', () => {
    const finalizadas = sc.data!.flatMap((g) => g.dadosModalidadeLicitacao ?? []).filter((x) => x.situacao === 'Finalizada')
    expect(finalizadas.length).toBeGreaterThan(0)
    const futuro = '2026-12-01T10:00:00Z'
    for (const situacao of ['Finalizada', 'Cancelada', 'Suspensa', 'Fracassada', 'Deserta', 'Revogada']) {
      expect(parseLicitacoesDoSenac(comUmaLicitacao(sc, { situacao, dataAbertura: futuro }), 'sc', AGORA)).toEqual([])
    }
  })

  it('lê a data com "Z" como horário de Brasília', () => {
    const t = r.find((x) => x.numeroControle === '33/2026')!
    expect(t.aberturaAt?.toISOString()).toBe('2026-10-20T14:00:00.000Z')
    expect(t.encerramentoAt).toEqual(t.aberturaAt)
    const madrugada = parseLicitacoesDoSenac(comUmaLicitacao(sc, { dataAbertura: '2026-10-15T01:00:00Z' }), 'sc', AGORA)
    expect(madrugada).toHaveLength(1)
    expect(madrugada[0].aberturaAt?.toISOString()).toBe('2026-10-15T04:00:00.000Z')
    const ontemANoite = parseLicitacoesDoSenac(comUmaLicitacao(sc, { dataAbertura: '2026-10-14T23:30:00Z' }), 'sc', AGORA)
    expect(ontemANoite).toEqual([])
  })

  it('identifica pelo GUID, com órgão, UF e modalidade', () => {
    const t = r.find((x) => x.numeroControle === '07/2026')!
    expect(t.fonte).toBe('SISTEMA_S')
    expect(t.fonteId).toBe('SENAC-SC:556e861e-23ae-4bb8-aee6-24c445e7f37c')
    expect(t.orgao).toBe('SENAC-SC')
    expect(t.uf).toBe('SC')
    expect(t.modalidade).toBe('CONCORRENCIA')
    expect(r.find((x) => x.numeroControle === '33/2026')!.modalidade).toBe('PREGAO_ELETRONICO')
  })

  it('aponta o edital para o download do próprio portal e guarda os anexos', () => {
    const t = r.find((x) => x.numeroControle === '07/2026')!
    const anexos = t.rawJson.anexos as { uri: string; titulo: string }[]
    expect(anexos.length).toBeGreaterThan(0)
    expect(t.linkEdital).toMatch(/^https:\/\/transparencia\.senac\.br\/service\/api\/licitacoes\/556e861e-[0-9a-f-]+\/regional\/sc\/documento\/[0-9a-f-]+\/download$/)
    expect(anexos.find((a) => a.uri === t.linkEdital)!.titulo).toMatch(/^Edital/)
    expect(t.publicadoAt).toBeInstanceOf(Date)
  })

  it('sem documento, usa o link da disputa (mesmo com espaço) e ignora link sem protocolo', () => {
    const r2 = parseLicitacoesDoSenac(rs, 'rs', AGORA)
    expect(r2.map((t) => t.numeroControle).sort()).toEqual(['041/2026', '042/2026'])
    for (const t of r2) expect(t.linkEdital).toMatch(/^https:\/\/www\.portaldecompraspublicas\.com\.br\//)
    const semProtocolo = parseLicitacoesDoSenac(
      comUmaLicitacao(rs, { linkPregaoEletronico: 'www.licitanet.com.br', documentos: [] }),
      'rs',
      AGORA
    )
    expect(semProtocolo[0].linkEdital).toBe('https://transparencia.senac.br/#/rs/licitacoes')
  })

  it('Departamento Nacional fica no RJ com órgão próprio', () => {
    const t = parseLicitacoesDoSenac(comUmaLicitacao(rs, {}), 'dn', AGORA)[0]
    expect(t.uf).toBe('RJ')
    expect(t.orgao).toBe('SENAC-DN')
    expect(t.fonteId).toMatch(/^SENAC-DN:/)
  })

  it('descarta registro sem GUID ou sem objeto e mapeia leilão e homologação de produtos para OUTROS', () => {
    expect(parseLicitacoesDoSenac(comUmaLicitacao(rs, { id: '123' }), 'rs', AGORA)).toEqual([])
    expect(parseLicitacoesDoSenac(comUmaLicitacao(rs, { objeto: '  ' }), 'rs', AGORA)).toEqual([])
    for (const modalidade of ['Leilão', 'Homologação de produtos']) {
      const resposta = comUmaLicitacao(rs, {})
      resposta.data![0].modalidade = modalidade
      expect(parseLicitacoesDoSenac(resposta, 'rs', AGORA)[0].modalidade).toBe('OUTROS')
    }
  })

  it('falha com mensagem clara quando a resposta não é a esperada', () => {
    expect(() => lerRespostaDoSenac('<html>erro</html>')).toThrow(/não é JSON/)
    expect(() => lerRespostaDoSenac('{"success":false,"data":null}')).toThrow(/sem a lista/)
  })

  it('monta a URL de download do documento', () => {
    expect(urlDoDocumentoDoSenac('to', 'a', 'b')).toBe('https://transparencia.senac.br/service/api/licitacoes/a/regional/to/documento/b/download')
  })
})
