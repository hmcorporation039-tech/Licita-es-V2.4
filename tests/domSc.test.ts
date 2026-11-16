import { readFileSync } from 'fs'
import { join } from 'path'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import { avaliarPublicacaoDoDomSc, avisosDaPublicacaoDoDomSc, lerArquivoDoDomSc, lerZipDoDomSc, textoDaPublicacao } from '../src/services/domScParser'
import { arquivosDoConjunto, nomeDoConjuntoDoMes } from '../src/services/domScService'
import { coletarDomSc, diasDaJanelaDomSc, DependenciasDaColetaDomSc } from '../src/services/domScColeta'

const JSON_DO_DIA = readFileSync(join(__dirname, 'fixtures', 'dom-sc', 'publicacoes.json'), 'utf-8')
const AGORA = new Date('2026-11-09T21:00:00Z')

describe('DOM/SC — leitura do arquivo do CIGA', () => {
  const publicacoes = lerArquivoDoDomSc(JSON_DO_DIA)

  it('lê as publicações do JSON e do ZIP', () => {
    expect(publicacoes).toHaveLength(4)
    expect(lerZipDoDomSc(zipSync({ 'publicacoes.json': strToU8(JSON_DO_DIA) }))).toHaveLength(4)
    expect(() => lerArquivoDoDomSc('{"outra":[]}')).toThrow()
  })

  it('separa aviso de licitação de homologação e de outros atos', () => {
    expect(publicacoes.map(avaliarPublicacaoDoDomSc)).toEqual(['aviso', 'aviso', 'outroAto', 'outraCategoria'])
  })

  it('transforma o pregão em licitação de Santa Catarina, com município do IBGE', () => {
    const r = avisosDaPublicacaoDoDomSc(publicacoes[0], AGORA)
    expect(r.semMunicipio).toBe(false)
    expect(r.tenders).toHaveLength(1)
    const [t] = r.tenders
    expect(t).toMatchObject({ fonte: 'DIARIO_MUNICIPAL', uf: 'SC', municipio: 'Jaraguá do Sul', modalidade: 'PREGAO_ELETRONICO' })
    expect(t.fonteId.startsWith('DMSC-')).toBe(true)
    expect(t.linkEdital).toContain('diariomunicipal.sc.gov.br')
  })

  it('tira tags e o cabeçalho de metadados do HTML do PDF', () => {
    expect(textoDaPublicacao('<html><head><meta name="x" content="y"/></head><body><p>AVISO &amp; EDITAL</p><p>Pregão</p></body></html>')).toBe('AVISO & EDITAL\nPregão')
  })
})

describe('DOM/SC — lista de arquivos do CKAN', () => {
  it('nome do conjunto do mês', () => {
    expect(nomeDoConjuntoDoMes('2026-11-09')).toBe('domsc-publicacoes-de-11-2026')
  })

  it('pega só os arquivos do portal do CIGA, com o dia do nome', () => {
    const arquivos = arquivosDoConjunto({
      result: {
        resources: [
          { id: 'a', name: 'Publicações de 09/11/2026 entre 16:00 e 23:59 (645)', url: 'https://dados.ciga.sc.gov.br/dataset/x/resource/a/download/a.zip' },
          { id: 'b', name: 'Publicações de 09/11/2026 entre 00:00 e 11:59 (1)', url: 'https://outro.site/b.zip' },
          { id: 'c', name: 'Dicionário de dados', url: 'https://dados.ciga.sc.gov.br/c.pdf' },
        ],
      },
    })
    expect(arquivos).toEqual([{ id: 'a', nome: 'Publicações de 09/11/2026 entre 16:00 e 23:59 (645)', url: 'https://dados.ciga.sc.gov.br/dataset/x/resource/a/download/a.zip', dia: '2026-11-09' }])
  })
})

describe('DOM/SC — coleta', () => {
  it('janela em dias de Brasília, pegando os dois meses na virada', () => {
    expect(diasDaJanelaDomSc(new Date('2026-12-02T02:00:00Z'), 4)).toEqual(['2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01'])
  })

  function dependencias(lidos = new Set<string>()): DependenciasDaColetaDomSc & { salvos: unknown[] } {
    const salvos: unknown[] = []
    return {
      salvos,
      listarArquivosDoMes: vi.fn(async () => [
        { id: 'arq-1', nome: 'Publicações de 09/11/2026 entre 12:00 e 15:59 (4)', url: 'https://dados.ciga.sc.gov.br/a.zip', dia: '2026-11-09' },
        { id: 'arq-velho', nome: 'Publicações de 01/11/2026 entre 12:00 e 15:59 (4)', url: 'https://dados.ciga.sc.gov.br/b.zip', dia: '2026-11-01' },
      ]),
      baixarArquivo: vi.fn(async () => zipSync({ 'p.json': strToU8(JSON_DO_DIA) })),
      existeNoPncp: vi.fn(async () => false),
      existeNoQueridoDiario: vi.fn(async () => false),
      prepararRepublicacao: vi.fn(async (t) => t),
      salvarLote: vi.fn(async (lote) => {
        salvos.push(...lote)
        return { totalNew: lote.length, totalDupes: 0, totalUpdated: 0 }
      }),
      memoria: {
        jaLidos: vi.fn(async (ids: string[]) => new Set(ids.filter((id) => lidos.has(id)))),
        marcarLido: vi.fn(async (id: string) => void lidos.add(id)),
      },
      agora: () => AGORA.getTime(),
    }
  }

  it('lê só os arquivos da janela, salva os avisos e guarda o arquivo na memória', async () => {
    const lidos = new Set<string>()
    const dep = dependencias(lidos)
    const r = await coletarDomSc(dep)
    expect(r.arquivosNaJanela).toBe(1)
    expect(r.arquivosLidos).toBe(1)
    expect(r.totalNew).toBe(dep.salvos.length)
    expect(r.totalNew).toBeGreaterThanOrEqual(1)
    expect(lidos.has('arq-1')).toBe(true)
    expect(r.houveFalhas).toBe(false)
  })

  it('não baixa de novo um arquivo já lido', async () => {
    const dep = dependencias(new Set(['arq-1']))
    const r = await coletarDomSc(dep)
    expect(dep.baixarArquivo).not.toHaveBeenCalled()
    expect(r.jaLidosAntes).toBe(1)
  })

  it('não salva o que já está no PNCP', async () => {
    const dep = dependencias()
    dep.existeNoPncp = vi.fn(async () => true)
    const r = await coletarDomSc(dep)
    expect(dep.salvos).toHaveLength(0)
    expect(r.duplicadosDoPncp).toBeGreaterThanOrEqual(1)
  })
})
