import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PORTAIS_DA_INDUSTRIA,
  PaginaDaIndustria,
  lerPaginaDaIndustria,
  parseLicitacoesDaIndustria,
  proximaPaginaDaIndustria,
  urlDaPrimeiraPagina,
} from '../src/services/sistemaS/portalDaIndustria'

const ler = (nome: string) => lerPaginaDaIndustria(readFileSync(join(__dirname, 'fixtures/sistemaS', nome), 'utf8'))
const AGORA = new Date('2026-10-15T15:00:00Z')
const portal = (chave: string) => PORTAIS_DA_INDUSTRIA.find((p) => p.chave === chave)!

function comUmaLicitacao(base: PaginaDaIndustria, mudancas: Record<string, unknown>): PaginaDaIndustria {
  return { ...base, results: [{ ...base.results![0], ...mudancas }] }
}

describe('Portal de Licitações do Sistema Indústria', () => {
  it('AL: mantém as abertas a partir de hoje e descarta a antiga ainda "em andamento"', () => {
    const r = parseLicitacoesDaIndustria(ler('industria-al.json'), portal('AL'), AGORA)
    expect(r.map((t) => t.fonteId).sort()).toEqual(['IND-AL:2068', 'IND-AL:2069'])
  })

  it('AL: separa o objeto do preâmbulo, classifica a entidade e aponta o edital absoluto', () => {
    const t = parseLicitacoesDaIndustria(ler('industria-al.json'), portal('AL'), AGORA).find((x) => x.fonteId === 'IND-AL:2069')!
    expect(t.fonte).toBe('SISTEMA_S')
    expect(t.objeto).toBe('Contratação de Empresa Especializada para a Instalação de Energia Solar Fotovoltaica ON-GRID')
    expect(t.orgao).toBe('SESI/SENAI-AL')
    expect(t.unidade).toBe('SESI / SENAI - AL')
    expect(t.uf).toBe('AL')
    expect(t.numeroControle).toBe('53/2026')
    expect(t.modalidade).toBe('OUTROS')
    expect(t.aberturaAt?.toISOString()).toBe('2026-10-26T03:00:00.000Z')
    expect(t.encerramentoAt).toBeUndefined()
    expect(t.linkEdital).toBe(
      'https://licitacao.fiea.com.br/media/CHAMAMENTO_P%C3%9ABLICO_SESI_SENAI_N%C2%BA_53-2026_-_ENERGIA_SOLAR_FOTOVOLTAICA.pdf'
    )
    const sesi = parseLicitacoesDaIndustria(ler('industria-al.json'), portal('AL'), AGORA).find((x) => x.fonteId === 'IND-AL:2068')!
    expect(sesi.orgao).toBe('SESI-AL')
  })

  it('PI: aceita a data em dd/mm/aaaa e filtra os antigos ainda "Aberto/Em execução"', () => {
    const r = parseLicitacoesDaIndustria(ler('industria-pi.json'), portal('PI'), AGORA)
    expect(r.map((t) => t.fonteId).sort()).toEqual(['IND-PI:452', 'IND-PI:454'])
    expect(r[0].aberturaAt?.toISOString()).toBe('2026-10-26T03:00:00.000Z')
    expect(r[0].orgao).toBe('SENAI-PI')
  })

  it('DN: documento sem arquivo cai na página do portal; arquivo absoluto é mantido; "Sistema Indústria" e CNI', () => {
    const r = parseLicitacoesDaIndustria(ler('industria-dn.json'), portal('DN'), AGORA)
    const semArquivo = r.find((t) => t.fonteId === 'IND-DN:837')!
    expect(semArquivo.linkEdital).toBe('https://www.portaldaindustria.com.br/licitacoes/')
    expect(semArquivo.orgao).toBe('SESI/SENAI-DN')
    expect(semArquivo.uf).toBe('DF')
    const sistema = r.find((t) => t.fonteId === 'IND-DN:836')!
    expect(sistema.orgao).toBe('Sistema Indústria')
    expect(sistema.linkEdital).toMatch(/^https:\/\/static\.portaldaindustria\.com\.br\/media\//)
    expect(r.some((t) => t.fonteId === 'IND-DN:771')).toBe(false)
    const cni = ler('industria-dn.json').results!.find((x) => x.id === 805)!
    const futuro = parseLicitacoesDaIndustria({ results: [{ ...cni, data_abertura: '2026-11-10' }] }, portal('DN'), AGORA)
    expect(futuro[0].orgao).toBe('CNI')
  })

  it('descarta sem data, com data inválida, sem entidade conhecida ou com status de encerrada', () => {
    const al = ler('industria-al.json')
    expect(parseLicitacoesDaIndustria(comUmaLicitacao(al, { data_abertura: null }), portal('AL'), AGORA)).toEqual([])
    expect(parseLicitacoesDaIndustria(comUmaLicitacao(al, { data_abertura: '31/02/2027' }), portal('AL'), AGORA)).toEqual([])
    expect(parseLicitacoesDaIndustria(comUmaLicitacao(al, { empresas: [{ nome: 'Sindicato X' }] }), portal('AL'), AGORA)).toEqual([])
    expect(parseLicitacoesDaIndustria(comUmaLicitacao(al, { empresas: [] }), portal('AL'), AGORA)).toEqual([])
    expect(parseLicitacoesDaIndustria(comUmaLicitacao(al, { status: 'Cancelada' }), portal('AL'), AGORA)).toEqual([])
  })

  it('mapeia as modalidades do regulamento (sem disputa, credenciamento, leilão)', () => {
    const al = ler('industria-al.json')
    const modalidade = (m: string) => parseLicitacoesDaIndustria(comUmaLicitacao(al, { modalidade: m }), portal('AL'), AGORA)[0].modalidade
    expect(modalidade('RCA Sem Disputa')).toBe('DISPENSA_SEM_DISPUTA')
    expect(modalidade('RCA Credenciamento')).toBe('CREDENCIAMENTO')
    expect(modalidade('RLC Leilao')).toBe('OUTROS')
    expect(modalidade('Concurso')).toBe('CONCURSO')
  })

  it('segue a paginação só no mesmo host, forçando o protocolo configurado', () => {
    const df = ler('industria-df-pagina1.json')
    expect(df.next).toMatch(/^http:\/\//)
    expect(proximaPaginaDaIndustria(df, portal('DF'))).toBe(
      'https://licitacoes.sistemafibra.org.br/api/licitacoes/?current=1&page=2&status=A'
    )
    expect(proximaPaginaDaIndustria({ ...df, next: 'https://evil.example/api/licitacoes/?page=2' }, portal('DF'))).toBeUndefined()
    expect(proximaPaginaDaIndustria({ ...df, next: 'https://licitacoes.sistemafibra.org.br/admin/' }, portal('DF'))).toBeUndefined()
    expect(proximaPaginaDaIndustria({ ...df, next: null }, portal('DF'))).toBeUndefined()
  })

  it('RR e TO só respondem em http; o arquivo relativo herda a origem do portal', () => {
    expect(urlDaPrimeiraPagina(portal('RR'))).toBe('http://licitacoes.rr.senai.br:8000/api/licitacoes/?status=A&current=1')
    const al = ler('industria-al.json')
    const t = parseLicitacoesDaIndustria(comUmaLicitacao(al, {}), portal('RR'), AGORA)[0]
    expect(t.linkEdital).toMatch(/^http:\/\/licitacoes\.rr\.senai\.br:8000\/media\//)
  })

  it('falha com mensagem clara quando a resposta não é JSON', () => {
    expect(() => lerPaginaDaIndustria('<html>desafio</html>')).toThrow(/não é JSON/)
    expect(() => lerPaginaDaIndustria('{"detail":"x"}')).toThrow(/sem a lista/)
  })
})
