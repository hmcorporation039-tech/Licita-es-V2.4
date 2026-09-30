import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sescPR } from '../src/services/sescRegional/pr'

// Recorte da resposta real da API do Sesc PR (POST /wp-json/sclc-view/v1/dados,
// action get-editais) em 30/09/2026: 66/26 e 77/26 aguardando abertura, 68/26
// aguardando mas com data já vencida, 60/26 em andamento, 63/26 revogado e
// 54/26 finalizado.
const json = readFileSync(join(__dirname, 'fixtures/sesc/pr.json'), 'utf8')
const URL1 = 'https://www.sescpr.com.br/wp-json/sclc-view/v1/dados#pagina=1'
const ctx = { url: URL1, agora: new Date(2026, 8, 30, 12, 0) }

describe('sescPR', () => {
  const r = sescPR.parse(json, ctx)

  it('mantém só "Aguardando Abertura" com abertura de hoje em diante', () => {
    const nums = r.map((t) => t.numeroControle).sort()
    expect(nums).toEqual(['66/26', '77/26'])
    expect(nums).not.toContain('68/26') // aguardando, mas a data já passou
    expect(nums).not.toContain('60/26') // em andamento (sessão iniciada)
    expect(nums).not.toContain('63/26') // revogado
    expect(nums).not.toContain('54/26') // finalizado
  })

  it('mantém a sessão marcada para hoje, mesmo com o horário já passado', () => {
    // 77/26 abre hoje às 10h e "agora" é meio-dia.
    expect(r.map((t) => t.numeroControle)).toContain('77/26')
  })

  it('preenche fonte, UF, órgão e fonteId estável a partir do id da API', () => {
    const t = r.find((x) => x.numeroControle === '66/26')!
    expect(t.fonte).toBe('SESC_REGIONAL')
    expect(t.fonteId).toBe('SESC-PR-3247')
    expect(t.uf).toBe('PR')
    expect(t.orgao).toBe('Sesc Paraná')
    expect(t.modalidade).toBe('CONCORRENCIA')
    expect(t.objeto).toContain('REFORMA DAS PISCINAS')
    expect(t.aberturaAt).toEqual(new Date(2026, 9, 28, 14, 30))
    expect(t.publicadoAt).toEqual(new Date(2026, 8, 25))
    expect(t.linkEdital).toBe('https://www.sescpr.com.br/licitacoes/')
    expect(t.valorEstimado).toBeUndefined()
  })

  it('lista os anexos pelo título (o download exige cadastro)', () => {
    const t = r.find((x) => x.numeroControle === '66/26')!
    const anexos = (t.rawJson as { anexos: { titulo: string }[] }).anexos
    expect(anexos.map((a) => a.titulo)).toEqual(['EDITAL WORD', 'EDITAL PDF'])
  })

  it('não segue para a próxima página quando o último item já é histórico', () => {
    // O último item do recorte (54/26) abriu em agosto: o resto é histórico.
    expect(sescPR.proximasPaginas!(json, ctx)).toEqual([])
  })

  it('segue para a próxima página enquanto o último item ainda é atual', () => {
    const todosAtuais = JSON.stringify({
      data: [
        { idLicitacao: 1, dsObjeto: 'a', stLicitacao: 10, dtAbertura: '2026-12-01', hrAbertura: '09:00:00' },
        { idLicitacao: 2, dsObjeto: 'b', stLicitacao: 10, dtAbertura: '2026-11-20', hrAbertura: '09:00:00' },
      ],
      meta: { pagination: { page: 1, total_pages: 3 } },
    })
    expect(sescPR.proximasPaginas!(todosAtuais, ctx)).toEqual([
      'https://www.sescpr.com.br/wp-json/sclc-view/v1/dados#pagina=2',
    ])
  })

  it('não passa da última página', () => {
    const ultima = JSON.stringify({
      data: [{ idLicitacao: 9, dsObjeto: 'z', stLicitacao: 10, dtAbertura: '2026-12-01' }],
      meta: { pagination: { page: 3, total_pages: 3 } },
    })
    expect(sescPR.proximasPaginas!(ultima, ctx)).toEqual([])
  })

  it('monta o corpo do POST com a página pedida no fragmento da URL', () => {
    const corpo = (url: string) => JSON.parse(sescPR.requisicaoPost!(url).corpo)
    expect(corpo(URL1)).toEqual({ action: 'get-editais', data: { page: 1, perPage: 10 } })
    expect(corpo('https://www.sescpr.com.br/wp-json/sclc-view/v1/dados#pagina=4').data.page).toBe(4)
  })

  it('falha com mensagem clara se a resposta não for JSON (ex.: página de bloqueio)', () => {
    expect(() => sescPR.parse('<html>Acesso negado</html>', ctx)).toThrow(/não é JSON/)
  })
})
