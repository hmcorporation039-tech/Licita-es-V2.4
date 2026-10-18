import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { codigoDoLocal, destinoDoProcesso, idDaLicitacaoInfraero, parseInfraeroDetalhe, situacaoDaInfraero, urlDoDetalheInfraero } from '../src/services/infraeroParser'
import { decodificarHtml } from '../src/services/sescRegional/tipos'
import { assertUrlDownloadPermitida } from '../src/lib/urlGuard'
import { dataDaSessao } from '../src/lib/dataDaSessao'
import { estaAberta } from '../src/lib/licitacaoAberta'
import { NormalizedTender } from '../src/types'

const PASTA = join(__dirname, 'fixtures', 'infraero')

function fixture(nome: string, contentType = 'text/html; charset=ISO-8859-1'): string {
  return decodificarHtml(readFileSync(join(PASTA, nome)), contentType)
}

function licitacao(html: string, id: number): NormalizedTender {
  const leitura = parseInfraeroDetalhe(html, id)
  if (leitura.tipo !== 'licitacao') throw new Error(`esperava licitação, veio ${JSON.stringify(leitura)}`)
  return leitura.tender
}

interface CamposDoDetalhe {
  processo?: string
  numero?: string
  abertura?: string
  objeto?: string
  situacao?: string
  uf?: string
}

function detalhe(c: CamposDoDetalhe): string {
  const linha = (rotulo: string, valor: string) => `<tr><td width="25%" bgcolor="#F0F0F0" class="bas_texto_corpo">${rotulo}</td><td width="75%" class="bas_texto_corpo"> ${valor}\n</td></tr>`
  return `<html><body><table>
    ${linha('Respons&aacute;vel', 'CENTRO CORPORATIVO')}
    ${linha('UF', c.uf ?? 'DF')}
    ${linha('Processo', c.processo ?? 'Licitação')}
    ${linha('N&uacute;mero', c.numero ?? '200/ADLI-3/SEDE/2026')}
    ${c.abertura === undefined ? linha('Data/Hora\n de Abertura', '20/11/2026 10:00') : c.abertura ? linha('Data/Hora\n de Abertura', c.abertura) : ''}
    ${linha('Objeto', c.objeto ?? 'AQUISIÇÃO DE UNIFORMES<br>')}
    ${linha('Situação', c.situacao ?? 'Em Andamento')}
  </table></body></html>`
}

describe('parseInfraeroDetalhe com páginas reais', () => {
  it('lê a concessão comercial do Santos Dumont (178166) com datas no horário de Brasília', () => {
    const t = licitacao(fixture('detalhe-178166.html'), 178166)
    expect(t.fonte).toBe('INFRAERO')
    expect(t.fonteId).toBe('INFRAERO-178166')
    expect(t.modalidade).toBe('CONCORRENCIA')
    expect(t.situacao).toBe('ABERTA')
    expect(t.objeto).toBe('CONCESSÃO DE USO DE ÁREAS DESTINADAS À EXPLORAÇÃO COMERCIAL DE LANCHONETE ESPECIALIZADA EM CULINÁRIA ÀRABE, NO AEROPORTO DO RIO DE JANEIRO - SBRJ')
    expect(t.numeroControle).toBe('128/ADLI-2/SBRJ/2026')
    expect(t.aberturaAt?.toISOString()).toBe('2026-10-16T12:00:00.000Z')
    expect(t.encerramentoAt).toBeUndefined()
    expect(t.publicadoAt?.toISOString()).toBe('2026-10-07T03:00:00.000Z')
    expect(t.uf).toBe('RJ')
    expect(t.municipio).toBe('Rio de Janeiro')
    expect(t.municipioIbge).toBe('3304557')
    expect(t.municipioLat).toBeCloseTo(-22.91, 1)
    expect(t.unidade).toBe('Aeroporto Santos Dumont (SBRJ)')
    expect(t.orgaoCnpj).toBe('00352294000110')
    expect(t.orgao).toContain('INFRAERO')
    expect(t.valorEstimado).toBeUndefined()
    expect(t.linkEdital).toBe('https://licitacao.infraero.gov.br/portal_licitacao/servlet/DetalheLicitacao?idLicitacao=178166')
    expect(t.rawJson).toMatchObject({ idLicitacao: 178166, processo: 'Licitação', codigoDoLocal: 'SBRJ', numeroNoLicitacoesE: '1101864', situacaoNaOrigem: 'Em Andamento', ufDoPortal: 'DF' })
  })

  it('a sessão vira aberturaAt, que conta como data da sessão e decide se está aberta', () => {
    const t = licitacao(fixture('detalhe-178262.html'), 178262)
    const datas = { fonte: 'INFRAERO' as const, aberturaAt: t.aberturaAt ?? null, encerramentoAt: null }
    expect(dataDaSessao(datas)).toEqual(new Date('2026-11-06T12:00:00.000Z'))
    const base = { ...datas, situacao: 'ABERTA' as const, valorHomologado: null, publicadoAt: t.publicadoAt ?? null, createdAt: new Date('2026-10-17T12:00:00Z') }
    expect(estaAberta(base, new Date('2026-11-06T20:00:00Z'))).toBe(true)
    expect(estaAberta(base, new Date('2026-11-07T03:00:00Z'))).toBe(false)
  })

  it('lê os anexos com URL absoluta e baixável pelo guarda de SSRF', () => {
    const t = licitacao(fixture('detalhe-178109.html'), 178109)
    const anexos = t.rawJson.anexos as { uri: string; titulo: string; tipoDocumentoNome?: string; dataDeReferencia?: string }[]
    expect(anexos).toHaveLength(15)
    expect(anexos).toContainEqual({
      uri: 'https://licitacao.infraero.gov.br/arquivos_licitacao/2026/SEDE/098_ADLI-2_SEDE_2026_LI/EDITAL_LICITACAO_098-2026.pdf',
      titulo: 'EDITAL LICITACAO 098-2026',
      tipoDocumentoNome: 'Edital e Anexos',
      dataDeReferencia: '15/09/2026',
    })
    expect(anexos.find((a) => a.tipoDocumentoNome === 'Aviso de Adiamento')?.titulo).toBe('OFC ADIAMENTO 098')
    for (const a of anexos) expect(() => assertUrlDownloadPermitida(a.uri)).not.toThrow()
  })

  it('licitação adiada sine die da sede fica SUSPENSA, no DF, sem município', () => {
    const t = licitacao(fixture('detalhe-178109.html'), 178109)
    expect(t.situacao).toBe('SUSPENSA')
    expect(t.uf).toBe('DF')
    expect(t.municipio).toBeUndefined()
    expect(t.unidade).toBe('Sede (Brasília/DF)')
    expect(t.numeroControle).toBe('098/ADLI-2/SEDE/2026')
    expect(t.publicadoAt?.toISOString()).toBe('2026-09-15T03:00:00.000Z')
    expect(String(t.rawJson.observacao)).toContain('ADIADA SINE DIE')
  })

  it('pega o identificador do licitacoes-e também na observação', () => {
    const t = licitacao(fixture('detalhe-178262.html'), 178262)
    expect(t.rawJson.numeroNoLicitacoesE).toBe('1102353')
    expect(t.municipio).toBe('Rio de Janeiro')
  })

  it('situação cancelada vem como CANCELADA, com o aeroporto de Mossoró', () => {
    const t = licitacao(fixture('detalhe-178265-cancelada.html'), 178265)
    expect(t.situacao).toBe('CANCELADA')
    expect(t.uf).toBe('RN')
    expect(t.municipio).toBe('Mossoró')
    expect(t.municipioIbge).toBe('2408003')
    expect(t.publicadoAt).toBeUndefined()
  })

  it('recusa na hora página com aninhamento ou tamanho fora do normal', () => {
    const inicio = Date.now()
    expect(() => parseInfraeroDetalhe(`<html><body>${'<div>'.repeat(50_000)}</body></html>`, 1)).toThrow('fora do formato esperado')
    expect(() => parseInfraeroDetalhe(`<html><body>${'x'.repeat(2 * 1024 * 1024)}</body></html>`, 1)).toThrow('fora do formato esperado')
    expect(Date.now() - inicio).toBeLessThan(1000)
  })

  it('id inexistente devolve nao_encontrado', () => {
    expect(parseInfraeroDetalhe(fixture('detalhe-178200-nao-encontrado.html'), 178200)).toEqual({ tipo: 'nao_encontrado' })
  })

  it('intenção de registro de preço não é licitação para fornecedor', () => {
    const leitura = parseInfraeroDetalhe(fixture('detalhe-178260-irp.html'), 178260)
    expect(leitura).toEqual({ tipo: 'ignorado', motivo: 'processo sem disputa (Intenção de Registro de Preço)' })
  })

  it('contratação direta sem data de sessão fica de fora', () => {
    expect(parseInfraeroDetalhe(fixture('detalhe-178250-sem-abertura.html'), 178250)).toEqual({
      tipo: 'ignorado',
      motivo: 'sem data de abertura (Inexigibilidade de Licitação)',
    })
  })

  it('decodifica ISO-8859-1 pelo meta charset mesmo sem cabeçalho', () => {
    const t = licitacao(fixture('detalhe-178166.html', ''), 178166)
    expect(t.objeto).toContain('CULINÁRIA ÀRABE')
    expect(t.rawJson.processo).toBe('Licitação')
  })

  it('página fora do formato lança em vez de virar "não encontrado"', () => {
    expect(() => parseInfraeroDetalhe('<html><body>Serviço indisponível</body></html>', 1)).toThrow(/fora do formato/)
  })
})

describe('parseInfraeroDetalhe com campos variados', () => {
  it('pregão eletrônico de aeroporto regional sem mapa usa o município citado no objeto', () => {
    const t = licitacao(detalhe({ processo: 'Pregão Eletrônico', numero: '012/ADLI-3/SNDV/2026', objeto: 'MANUTENÇÃO DO SISTEMA DE BALIZAMENTO DO AEROPORTO DE DIVINÓPOLIS/MG' }), 9)
    expect(t.modalidade).toBe('PREGAO_ELETRONICO')
    expect(t.uf).toBe('MG')
    expect(t.municipio).toBe('Divinópolis')
    expect(t.municipioIbge).toBeTruthy()
    expect(t.unidade).toBe('SNDV')
  })

  it('aeroporto desconhecido sem município citado fica só com a UF do portal', () => {
    const t = licitacao(detalhe({ numero: '012/ADLI-3/SXYZ/2026', objeto: 'SERVIÇO DE LIMPEZA' }), 9)
    expect(t.uf).toBe('DF')
    expect(t.municipio).toBeUndefined()
    expect(t.unidade).toBe('SXYZ')
  })

  it('termo de cessão de uso deixa claro no objeto que é cessão', () => {
    const t = licitacao(detalhe({ processo: 'TERMO DE CESSÃO DE USO DE ÁREA', objeto: 'ÁREA DE 20 M² PARA LOJA DE CONVENIÊNCIA NO TERMINAL' }), 9)
    expect(t.modalidade).toBe('OUTROS')
    expect(t.objeto).toBe('TERMO DE CESSÃO DE USO DE ÁREA: ÁREA DE 20 M² PARA LOJA DE CONVENIÊNCIA NO TERMINAL')
    const jaClaro = licitacao(detalhe({ processo: 'TERMO DE CESSÃO DE USO DE ÁREA', objeto: 'CESSÃO DE USO DE ÁREA PARA LOJA' }), 9)
    expect(jaClaro.objeto).toBe('CESSÃO DE USO DE ÁREA PARA LOJA')
  })

  it('comunicado sem disputa é ignorado', () => {
    expect(parseInfraeroDetalhe(detalhe({ processo: 'Comunicado', objeto: 'COMUNICADO AOS LICITANTES' }), 9)).toMatchObject({ tipo: 'ignorado' })
  })

  it('número incompleto não vira número de controle', () => {
    const t = licitacao(detalhe({ numero: '///2026' }), 9)
    expect(t.numeroControle).toBeUndefined()
    expect(t.unidade).toBeUndefined()
  })

  it('situação desconhecida é ignorada em vez de adivinhada', () => {
    expect(parseInfraeroDetalhe(detalhe({ situacao: 'Em Análise' }), 9)).toEqual({ tipo: 'ignorado', motivo: 'situação desconhecida (Em Análise)' })
  })

  it('nome de arquivo com espaço e acento vira URL codificada no mesmo host', () => {
    const tabela = `<table><tr><td>Edital</td><td>EDITAL</td><td>01/10/2026</td><td></td><td><table><tr><td><a href="/arquivos_licitacao/2026/SEDE/X/EDITAL ÚNICO.pdf">EDITAL ÚNICO.pdf</a></td></tr></table></td></tr></table>`
    const t = licitacao(detalhe({}).replace('</body>', `${tabela}</body>`), 9)
    const [anexo] = t.rawJson.anexos as { uri: string; titulo: string }[]
    expect(anexo).toMatchObject({ uri: 'https://licitacao.infraero.gov.br/arquivos_licitacao/2026/SEDE/X/EDITAL%20%C3%9ANICO.pdf', titulo: 'EDITAL ÚNICO', tipoDocumentoNome: 'Edital' })
    expect(t.publicadoAt?.toISOString()).toBe('2026-10-01T03:00:00.000Z')
  })

  it('data só com dia vira meia-noite de Brasília', () => {
    const t = licitacao(detalhe({ abertura: '20/11/2026' }), 9)
    expect(t.aberturaAt?.toISOString()).toBe('2026-11-20T03:00:00.000Z')
  })
})

describe('mapeamentos da Infraero', () => {
  it.each([
    ['Pregão Eletrônico', 'PREGAO_ELETRONICO'],
    ['Pregão Presencial', 'PREGAO_PRESENCIAL'],
    ['Licitação', 'CONCORRENCIA'],
    ['Concorrência', 'CONCORRENCIA'],
    ['Convite', 'CONVITE'],
    ['Tomada de Preços', 'TOMADA_DE_PRECOS'],
    ['Concurso', 'CONCURSO'],
    ['Credenciamento', 'CREDENCIAMENTO'],
    ['Dispensa Eletrônica', 'DISPENSA_COM_DISPUTA'],
    ['Dispensa de Licitação', 'DISPENSA_SEM_DISPUTA'],
    ['Dispensa de Licitação Simplificada', 'DISPENSA_SEM_DISPUTA'],
    ['Licitação Dispensada (art. 28, §3º, Lei 13.303/16)', 'DISPENSA_SEM_DISPUTA'],
    ['Inexigibilidade de Licitação', 'INEXIGIBILIDADE'],
    ['Leilão', 'OUTROS'],
    ['RDC Eletrônico', 'OUTROS'],
    ['Chamamento Público', 'OUTROS'],
    ['Termo de Cessão de Uso de Equipamento', 'OUTROS'],
    ['Processo novo que ninguém conhece', 'OUTROS'],
  ])('processo "%s" vira %s', (processo, modalidade) => {
    const destino = destinoDoProcesso(processo)
    expect(destino === 'ignorar' ? destino : destino.modalidade).toBe(modalidade)
  })

  it.each([
    'Comunicado',
    'Fato Relevante',
    'Audiência Pública',
    'Consulta Pública',
    'Intenção de Registro de Preço',
    'Adesão a Ata de Registro de Preços',
    'Acordo de Cooperação Técnica',
    'Convênio',
    'Contrato de Prestação de Serviços',
    'Contrato Sub-rogado',
    'Relação de Compras',
    'Inaplicabilidade de Licitação',
    'Procedimento de Apuração de Responsabilização',
  ])('processo "%s" é ignorado', (processo) => {
    expect(destinoDoProcesso(processo)).toBe('ignorar')
  })

  it.each([
    ['Em Andamento', 'ABERTA'],
    ['Adiada sine die', 'SUSPENSA'],
    ['Suspensa', 'SUSPENSA'],
    ['Suspensa Judicialmente', 'SUSPENSA'],
    ['Homologada', 'HOMOLOGADA'],
    ['Encerrada', 'ENCERRADA'],
    ['Deserta', 'ENCERRADA'],
    ['Fracassada', 'ENCERRADA'],
    ['Cancelada', 'CANCELADA'],
    ['Anulada', 'ANULADA'],
    ['Revogada', 'REVOGADA'],
  ])('situação "%s" vira %s', (texto, situacao) => {
    expect(situacaoDaInfraero(texto)).toBe(situacao)
  })

  it('extrai o código do aeroporto do número', () => {
    expect(codigoDoLocal('128/ADLI-2/SBRJ/2026')).toBe('SBRJ')
    expect(codigoDoLocal('098/ADLI-2/SEDE/2026')).toBe('SEDE')
    expect(codigoDoLocal('///2026')).toBeUndefined()
    expect(codigoDoLocal('041//SBBR/2002')).toBe('SBBR')
  })

  it('id e URL do detalhe', () => {
    expect(idDaLicitacaoInfraero('INFRAERO-178166')).toBe(178166)
    expect(idDaLicitacaoInfraero('NOVACAP-1')).toBeUndefined()
    expect(urlDoDetalheInfraero(5)).toBe('https://licitacao.infraero.gov.br/portal_licitacao/servlet/DetalheLicitacao?idLicitacao=5')
  })
})
