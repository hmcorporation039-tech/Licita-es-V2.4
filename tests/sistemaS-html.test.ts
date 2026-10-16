import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodificarHtml } from '../src/services/sescRegional/tipos'
import { FONTES_DA_TRANSPARENCIA_SP, parseTransparenciaSp, PORTAIS_DE_TRANSPARENCIA_SP, urlDaListagemSp } from '../src/services/sistemaS/transparenciaSp'
import { FONTE_DO_AC, aberturaDoAc, parseFieac, proximasPaginasDoAc } from '../src/services/sistemaS/fieac'
import { FONTE_DO_MA, dataPorExtenso, parseFiema, proximasPaginasDaFiema } from '../src/services/sistemaS/fiema'
import { FONTE_DO_RN, parseFiern } from '../src/services/sistemaS/fiern'
import { hostPermitido } from '../src/lib/urlGuard'

const caminho = (nome: string) => join(__dirname, 'fixtures/sistemaS', nome)
const ler = (nome: string) => readFileSync(caminho(nome), 'utf8')
const lerAc = () => decodificarHtml(readFileSync(caminho('fieac-ac.html')), 'text/html; charset=ISO-8859-1')
const portalSp = (chave: string) => PORTAIS_DE_TRANSPARENCIA_SP.find((p) => p.chave === chave)!
const ctxSp = (chave: string, agora: Date) => ({ url: urlDaListagemSp(portalSp(chave)), agora })
const URL_DO_AC = FONTE_DO_AC.unidade.urls(new Date())[0]
const urlDaListaMa = (lista: string) => FONTE_DO_MA.unidade.urls(new Date()).find((u) => u.includes(`/editais/${lista}/`))!
const URL_DO_RN = FONTE_DO_RN.unidade.urls(new Date())[0]

describe('Transparência SESI-SP / SENAI-SP', () => {
  const AGORA = new Date('2026-10-16T13:00:00Z')

  it('SENAI-SP: mantém as abertas a partir de hoje e descarta a encerrada e a de abertura passada', () => {
    const r = parseTransparenciaSp(ler('transparencia-senai-sp.html'), portalSp('SENAI-SP'), ctxSp('SENAI-SP', AGORA))
    expect(r.map((t) => t.fonteId)).toEqual(['SPT-SP:3000500903', 'SPT-SP:3000497453', 'SPT-SP:3000488458'])
    expect(r.map((t) => t.numeroControle)).toEqual(['712/2026', '648/2026', '495/2026'])
  })

  it('SENAI-SP: órgão pela Entidade, data em hora de Brasília, modalidade e edital em PDF', () => {
    const r = parseTransparenciaSp(ler('transparencia-senai-sp.html'), portalSp('SENAI-SP'), ctxSp('SENAI-SP', AGORA))
    const t = r[0]
    expect(t.fonte).toBe('SISTEMA_S')
    expect(t.uf).toBe('SP')
    expect(t.orgao).toBe('SENAI-SP')
    expect(t.unidade).toBe('SENAI')
    expect(t.modalidade).toBe('OUTROS')
    expect(t.aberturaAt?.toISOString()).toBe('2026-10-23T03:00:00.000Z')
    expect(t.objeto).toBe('Aquisição de 01 impressora gráfica DTF UV para a área Gráfica e Editorial da unidade SENAI de Barueri')
    expect(t.linkEdital).toBe('https://transparencia.sp.senai.br/licitacoes/DocumentosSap?id=3000500903&name=CHAMAMENTO%20-%20PSDA%20712-26.pdf')
    expect((t.rawJson as { criterioDeJulgamento?: string }).criterioDeJulgamento).toBe('RCA - Econômico')
    expect(r[1].orgao).toBe('SESI/SENAI-SP')
    expect(r[1].aberturaAt?.toISOString()).toBe('2026-11-03T03:00:00.000Z')
  })

  it('SESI-SP: a licitação conjunta tem o mesmo fonteId nos dois portais', () => {
    const sesi = parseTransparenciaSp(ler('transparencia-sesi-sp.html'), portalSp('SESI-SP'), ctxSp('SESI-SP', AGORA))
    expect(sesi.map((t) => t.fonteId)).toEqual(['SPT-SP:3000501789', 'SPT-SP:3000497453'])
    expect(sesi[0].orgao).toBe('SESI-SP')
    expect(sesi[0].aberturaAt?.toISOString()).toBe('2026-10-22T03:00:00.000Z')
    const senai = parseTransparenciaSp(ler('transparencia-senai-sp.html'), portalSp('SENAI-SP'), ctxSp('SENAI-SP', AGORA))
    const conjuntaNoSesi = sesi.find((t) => t.numeroControle === '648/2026')!
    const conjuntaNoSenai = senai.find((t) => t.numeroControle === '648/2026')!
    expect(conjuntaNoSesi.fonteId).toBe(conjuntaNoSenai.fonteId)
    expect(conjuntaNoSesi.orgao).toBe(conjuntaNoSenai.orgao)
  })

  it('a sessão de hoje ainda conta; a de ontem não', () => {
    const vespera = parseTransparenciaSp(ler('transparencia-senai-sp.html'), portalSp('SENAI-SP'), ctxSp('SENAI-SP', new Date('2026-10-23T23:30:00-03:00')))
    expect(vespera.map((t) => t.numeroControle)).toEqual(['712/2026', '648/2026', '495/2026'])
    const depois = parseTransparenciaSp(ler('transparencia-senai-sp.html'), portalSp('SENAI-SP'), ctxSp('SENAI-SP', new Date('2026-10-24T00:30:00-03:00')))
    expect(depois.map((t) => t.numeroControle)).toEqual(['648/2026'])
  })

  it('mapeia a modalidade do RLC e descarta status suspenso ou cartão com resultado final', () => {
    const html = ler('transparencia-senai-sp.html')
    const comModalidade = parseTransparenciaSp(html.replace('| N. 712/2026 | RCA Disputa Aberta', '| N. 712/2026 | RLC Pregão Eletrônico'), portalSp('SENAI-SP'), ctxSp('SENAI-SP', AGORA))
    expect(comModalidade[0].modalidade).toBe('PREGAO_ELETRONICO')
    const suspensa = html.replace(/(\| N\. 712\/2026[\s\S]*?id="Status" class="filtravel">)[^<]*/, '$1 Suspenso')
    expect(parseTransparenciaSp(suspensa, portalSp('SENAI-SP'), ctxSp('SENAI-SP', AGORA)).some((t) => t.numeroControle === '712/2026')).toBe(false)
    const comResultado = html.replace(
      /(\| N\. 712\/2026[\s\S]*?)(<li>\s*<strong><span id="tipodocumento">Data de Abertura)/,
      '$1<li><strong><span id="tipodocumento">Data: RLC - Homologação / RCA - Resultado Final</span></strong><ul id="listadocumentos"><li class="filtravel">20/10/2026</li></ul></li>$2'
    )
    expect(parseTransparenciaSp(comResultado, portalSp('SENAI-SP'), ctxSp('SENAI-SP', AGORA)).some((t) => t.numeroControle === '712/2026')).toBe(false)
  })

  it('uma fonte por portal, com a listagem ampliada e o contador de cartões', () => {
    expect(FONTES_DA_TRANSPARENCIA_SP.map((f) => f.origem)).toEqual(['SPT-SENAI-SP', 'SPT-SESI-SP'])
    expect(FONTES_DA_TRANSPARENCIA_SP[1].unidade.urls(AGORA)).toEqual(['https://transparencia.sesisp.org.br/licitacoes/licitacoes-editais?Tamanho=150'])
    expect(FONTES_DA_TRANSPARENCIA_SP[0].contar(ler('transparencia-senai-sp.html'))).toBe(5)
  })
})

describe('FIEAC (AC)', () => {
  const AGORA = new Date('2026-10-13T12:00:00Z')

  it('decodifica o ISO-8859-1 e mantém só a aberta de hoje que não foi suspensa', () => {
    const r = parseFieac(lerAc(), { url: URL_DO_AC, agora: AGORA })
    expect(r).toHaveLength(1)
    const t = r[0]
    expect(t.fonteId).toBe('HTML-AC:SESI:RCA-DISPUTA-ABERTA:010/2026')
    expect(t.orgao).toBe('SESI-AC')
    expect(t.uf).toBe('AC')
    expect(t.modalidade).toBe('OUTROS')
    expect(t.aberturaAt?.toISOString()).toBe('2026-10-13T17:30:00.000Z')
    expect(t.objeto).toBe(
      'Aquisição de equipamentos e materiais, bem como 1 treinamento para, no mínimo, 6 funcionários da Escola SESI, para uso adequado dos recursos da impressora.'
    )
    expect(t.linkEdital).toBe('https://transparencia.fieac.org/admin/SISTEMA/editais/uploads/130413_051026.pdf')
  })

  it('a de aviso de suspensão volta quando o aviso some, com o SENAI no fonteId', () => {
    const semAviso = lerAc().replace(/<a href='[^']*130434_131026\.pdf'[\s\S]*?<\/a>/, '')
    const r = parseFieac(semAviso, { url: URL_DO_AC, agora: AGORA })
    const senai = r.find((t) => t.numeroControle === '019/2026')!
    expect(senai.fonteId).toBe('HTML-AC:SENAI:RCA-DISPUTA-ABERTA:019/2026')
    expect(senai.orgao).toBe('SENAI-AC')
    expect(senai.aberturaAt?.toISOString()).toBe('2026-10-13T11:30:00.000Z')
    expect(r.map((t) => t.fonteId).sort()).toEqual(['HTML-AC:SENAI:RCA-DISPUTA-ABERTA:019/2026', 'HTML-AC:SESI:RCA-DISPUTA-ABERTA:010/2026'])
  })

  it('fase finalizada ou em finalização sai mesmo com abertura futura; conjunta vira SESI/SENAI-AC', () => {
    const antes = new Date('2026-08-01T12:00:00Z')
    const r = parseFieac(lerAc(), { url: URL_DO_AC, agora: antes })
    expect(r.map((t) => t.numeroControle).sort()).toEqual(['010/2026', '018/2026'])
    const conjunta = parseFieac(lerAc().replace(/(<\/b> 002\/2026[\s\S]*?face='Arial'>)Finalizado/, '$1Aguardando Abertura'), { url: URL_DO_AC, agora: antes })
    expect(conjunta.find((t) => t.numeroControle === '002/2026')?.orgao).toBe('SESI/SENAI-AC')
    expect(conjunta.find((t) => t.numeroControle === '002/2026')?.fonteId).toBe('HTML-AC:SESI-SENAI:RCA-DISPUTA-ABERTA:002/2026')
  })

  it('segue para a página seguinte só enquanto a última abertura da página ainda é atual', () => {
    expect(proximasPaginasDoAc(lerAc(), { url: URL_DO_AC, agora: AGORA })).toEqual([])
    const antes = new Date('2026-08-01T12:00:00Z')
    expect(proximasPaginasDoAc(lerAc(), { url: URL_DO_AC, agora: antes })).toEqual([
      'https://transparencia.fieac.org/editais_transparencia/index.php?Casa=&modalidade=&fase=&escolhe=0&pagina=2',
    ])
    const terceira = 'https://transparencia.fieac.org/editais_transparencia/index.php?Casa=&modalidade=&fase=&escolhe=0&pagina=3'
    expect(proximasPaginasDoAc(lerAc(), { url: terceira, agora: antes })).toEqual([])
  })

  it('lê "dd/mm/aaaa - HH:MM:SS" em hora de Brasília e conta os cartões', () => {
    expect(aberturaDoAc('13/10/2026 - 08:30:00')?.toISOString()).toBe('2026-10-13T11:30:00.000Z')
    expect(aberturaDoAc('31/02/2026 - 08:30:00')).toBeUndefined()
    expect(FONTE_DO_AC.contar(lerAc())).toBe(5)
  })
})

describe('FIEMA (MA)', () => {
  it('Disputa Aberta: usa o início quando não há abertura dos envelopes e infere SESI/SENAI do texto', () => {
    const r = parseFiema(ler('fiema-ma-18.html'), { url: urlDaListaMa('18'), agora: new Date('2026-09-10T12:00:00Z') })
    expect(r).toHaveLength(1)
    const t = r[0]
    expect(t.fonteId).toBe('HTML-MA:18:4782')
    expect(t.orgao).toBe('SESI/SENAI-MA')
    expect(t.uf).toBe('MA')
    expect(t.numeroControle).toBe('046/2026')
    expect(t.aberturaAt?.toISOString()).toBe('2026-09-14T12:00:00.000Z')
    expect(t.publicadoAt?.toISOString()).toBe('2026-09-03T03:00:00.000Z')
    expect(t.objeto).toMatch(/^Contratação de empresa de engenharia para prestação de Serviços de manutenção preventiva/)
    expect(t.linkEdital).toBe('https://www.fiema.org.br/edital/4782/chamamento-n-0462026-disputa-aberta-presencial-servicos-de-manutencao-preventiva-e-corretiva')
  })

  it('Disputa Fechada: prefere a abertura dos envelopes e descarta as passadas', () => {
    const url = urlDaListaMa('19')
    const r = parseFiema(ler('fiema-ma-19.html'), { url, agora: new Date('2026-08-01T12:00:00Z') })
    expect(r.map((t) => t.fonteId)).toEqual(['HTML-MA:19:4775'])
    expect(r[0].aberturaAt?.toISOString()).toBe('2026-08-24T03:00:00.000Z')
    expect(parseFiema(ler('fiema-ma-19.html'), { url, agora: new Date('2026-10-16T12:00:00Z') })).toEqual([])
  })

  it('descarta o que não é SESI/SENAI (credenciamento do sindicato) e título marcado como suspenso', () => {
    expect(parseFiema(ler('fiema-ma-6.html'), { url: urlDaListaMa('6'), agora: new Date('2026-01-10T12:00:00Z') })).toEqual([])
    const suspenso = ler('fiema-ma-18.html').replace(/<strong>Chamamento nº 046\/2026/, '<strong>(SUSPENSO) Chamamento nº 046/2026')
    expect(parseFiema(suspenso, { url: urlDaListaMa('18'), agora: new Date('2026-09-10T12:00:00Z') })).toEqual([])
  })

  it('pagina só enquanto a lista ainda tem cartão atual, até a página 2', () => {
    const url = urlDaListaMa('18')
    expect(proximasPaginasDaFiema(ler('fiema-ma-18.html'), { url, agora: new Date('2026-10-16T12:00:00Z') })).toEqual([])
    expect(proximasPaginasDaFiema(ler('fiema-ma-18.html'), { url, agora: new Date('2024-09-01T12:00:00Z') })).toEqual([
      'https://www.fiema.org.br/editais/18/RCA+-+Disputa+Aberta?page=2&per-page=30',
    ])
    expect(proximasPaginasDaFiema(ler('fiema-ma-18.html'), { url: `${url}?page=2&per-page=30`, agora: new Date('2024-09-01T12:00:00Z') })).toEqual([])
  })

  it('datas por extenso em hora de Brasília, com e sem horário', () => {
    expect(dataPorExtenso('14 de setembro de 2026 às 09:00h')?.toISOString()).toBe('2026-09-14T12:00:00.000Z')
    expect(dataPorExtenso('8 de maio de 2026')?.toISOString()).toBe('2026-05-08T03:00:00.000Z')
    expect(dataPorExtenso('19 de março de 2026 às 14:30h')?.toISOString()).toBe('2026-03-19T17:30:00.000Z')
    expect(dataPorExtenso('31 de fevereiro de 2026')).toBeUndefined()
    expect(dataPorExtenso('')).toBeUndefined()
  })
})

describe('FIERN (RN)', () => {
  const html = ler('fiern-rn.html')

  it('lê a tabela pelo cabeçalho, com a chave do processo no fonteId e o aviso fora do objeto', () => {
    const r = parseFiern(html, { url: URL_DO_RN, agora: new Date('2026-10-16T13:00:00Z') })
    expect(r.map((t) => t.fonteId)).toEqual(['HTML-RN:1-PC-0005603', 'HTML-RN:3-PC-019890', 'HTML-RN:3-PC-020092', 'HTML-RN:PC-0010350'])
    const t = r[0]
    expect(t.orgao).toBe('SESI-RN')
    expect(t.uf).toBe('RN')
    expect(t.numeroControle).toBe('005/2026')
    expect(t.modalidade).toBe('OUTROS')
    expect(t.aberturaAt?.toISOString()).toBe('2026-10-16T03:00:00.000Z')
    expect(t.publicadoAt?.toISOString()).toBe('2026-08-06T03:00:00.000Z')
    expect(t.objeto).toMatch(/^CONTRATAÇÃO DE EMPRESA ESPECIALIZADA, NO RAMO DE ENGENHARIA/)
    expect((t.rawJson as { aviso?: string; processo?: string }).aviso).toBe('ATA DE JULGAMENTO DOS DOCUMENTOS DE QUALIFICAÇÃO')
    expect((t.rawJson as { processo?: string }).processo).toBe('SCD-00219')
    expect(t.linkEdital).toBe('https://www.fiern.org.br/processos-de-selecao/')
    expect(r[1].orgao).toBe('SENAI-RN')
  })

  it('no dia seguinte a de abertura ontem sai; situação encerrada também', () => {
    const amanha = parseFiern(html, { url: URL_DO_RN, agora: new Date('2026-10-17T03:30:00Z') })
    expect(amanha.map((t) => t.numeroControle)).toEqual(['032/2026', '034/2026', '011/2026'])
    const cancelada = html.replace(/(032\/2026[\s\S]*?)Publicação do Chamamento Público/, '$1Cancelado')
    expect(parseFiern(cancelada, { url: URL_DO_RN, agora: new Date('2026-10-16T13:00:00Z') }).map((t) => t.numeroControle)).toEqual([
      '005/2026',
      '034/2026',
      '011/2026',
    ])
  })

  it('mapeia seleção sem disputa e falha alto se a tabela mudar de formato', () => {
    const semDisputa = html.replace('SCD-SELEÇÃO COM DISPUTA', 'SSD-SELEÇÃO SEM DISPUTA')
    expect(parseFiern(semDisputa, { url: URL_DO_RN, agora: new Date('2026-10-16T13:00:00Z') })[0].modalidade).toBe('DISPENSA_SEM_DISPUTA')
    expect(() => parseFiern(html.replace('DATA ABERTURA', 'PRAZO'), { url: URL_DO_RN, agora: new Date('2026-10-16T13:00:00Z') })).toThrow(/colunas/)
    expect(FONTE_DO_RN.contar(html)).toBe(4)
  })
})

describe('allow-list de anexos dos portais novos', () => {
  it('libera só os hosts que servem o PDF do edital direto por https', () => {
    expect(hostPermitido('transparencia.sp.senai.br')).toBe(true)
    expect(hostPermitido('transparencia.sesisp.org.br')).toBe(true)
    expect(hostPermitido('transparencia.fieac.org')).toBe(true)
    expect(hostPermitido('fieac.org')).toBe(false)
    expect(hostPermitido('sp.senai.br')).toBe(false)
    expect(hostPermitido('www.fiema.org.br')).toBe(false)
    expect(hostPermitido('app.fiern.org.br')).toBe(false)
  })
})
