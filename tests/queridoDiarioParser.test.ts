import { describe, expect, it } from 'vitest'
import {
  GazetaQueridoDiario,
  chaveDeBusca,
  extrairAbertura,
  identificarModalidade,
  parseDiarioOficial,
  separarBlocosDeAviso,
} from '../src/services/queridoDiarioParser'

const AGORA = new Date('2026-10-15T20:00:00Z')

function gazeta(over: Partial<GazetaQueridoDiario> = {}): GazetaQueridoDiario {
  return {
    territory_id: '2930105',
    territory_name: 'Senhor do Bonfim',
    state_code: 'BA',
    date: '2026-10-13',
    url: 'https://data.queridodiario.ok.org.br/2930105/2026-10-13/a47ebf1675d00100d7097082ad2f7332177ca201.pdf',
    txt_url: 'https://data.queridodiario.ok.org.br/2930105/2026-10-13/a47ebf1675d00100d7097082ad2f7332177ca201.txt',
    edition: '6.588',
    is_extra_edition: false,
    ...over,
  }
}

const SENHOR_DO_BONFIM = `Edição 6.588 | Ano 14
13 de outubro de 2026

Página 2

ÍNDICE
PREGÃO ELETRÔNICO

PE 065/2026 - AVISO DE LICITAÇÃO . . . . . . . . . . . . . . . . . . . . . . . . . . . .
PE 062/2026 - AVISO DE LICITAÇÃO . . . . . . . . . . . . . . . . . . . . . . . . . . . .

Certificação Digital: GUQENCEQ-HJZK8L8G-XU2EZTKE-RX0PVIZT
Versão eletrônica disponível em: http://senhordobonfim.ba.gov.br



AVISO DE LICITAÇÃO
PREGÃO Nº 065/2026 – P.A. Nº 0220/26

A Prefeitura Municipal de Senhor do Bonfim – BA, torna público que realizará
no dia 23 de outubro de 2026, às 09h00 o processo em epígrafe com o seguinte
Objeto: Aquisição de kits de materiais de uso pessoal e funcional destinados aos
professores da Rede Municipal de Ensino, vinculados à Secretaria Municipal de
Educação e Esportes de Senhor do Bonfim/BA.
Edital: http://doem.org.br/ba/senhordobonfim/editais
   www.senhordobonfim.ba.gov.br link Licitações
Local da Disputa: https://emunicipio.com.br/pmsb/modalidade/index.php.

Eline Lucia Macedo Sobreira da Silva
Secretaria Municipal de Educação e Esporte

Edição 6.588 | Ano 14
13 de outubro de 2026

Página 3

PE 065/2026 - AVISO DE LICITAÇÃO

Certificação Digital: GUQENCEQ-HJZK8L8G-XU2EZTKE-RX0PVIZT
Versão eletrônica disponível em: http://senhordobonfim.ba.gov.br



AVISO DE LICITAÇÃO
PREGÃO Nº 062/2026 – P.A. Nº 0197/26

A Prefeitura Municipal de Senhor do Bonfim – BA, torna público que realizará
no dia 26 de outubro de 2026, às 09h00 o processo em epígrafe com o seguinte
Objeto: Prestação de serviços de locação de módulos sanitários portáteis
comuns, para serem utilizados nos eventos promovidos pela Prefeitura
Municipal de Senhor do Bonfim/BA
Edital: http://doem.org.br/ba/senhordobonfim/editais
   www.senhordobonfim.ba.gov.br link Licitações
Local da Disputa: https://emunicipio.com.br/pmsb/modalidade/index.php.
ID da Contratação PNCP nº: 13988308000139-1-000179/2026

Leandro da Cruz Feitosa
Secretaria Municipal de Administração

Edição 6.588 | Ano 14
13 de outubro de 2026

Página 4

PE 062/2026 - AVISO DE LICITAÇÃO

Certificação Digital: GUQENCEQ-HJZK8L8G-XU2EZTKE-RX0PVIZT
Versão eletrônica disponível em: http://senhordobonfim.ba.gov.br
`

const MOGI_GUACU = `Licitações e Contratos
Licitações e Contratos

Aviso de Licitação
Aviso de Licitação

AVISO DE ABERTURA DE LICITAÇÃO
CONCORRÊNCIA  ELETRÔNICA  Nº  13/2026  -

PROCESSO  Nº  20.018/2026.  Objeto:  Contratação  de
empresa especializada na execução de obras e serviços de
engenharia para REFORMA DA QUADRA POLIESPORTIVA DO
CENTRO ESPORTIVO WALDEMAR FERRARI, no Jardim Santa
Terezinha II, neste Município de Mogi Guaçu/SP. Data de
abertura: 09h30min do dia 26 de outubro de 2026.

A íntegra dos editais e seus anexos encontram-se à
disposição  dos  interessados  através  dos  sites:
www.mogiguacu.sp.gov.br  e  www.novobbmnet.com.br.
Mogi  Guaçu,  07 de outubro de 2026.  Adriana Bibiano –
Presidente da Comissão Municipal de Licitações.
...........................................................................................................

Suspensão
Suspensão

AVISO DE SUSPENSÃO DE LICITAÇÃO
CONCORRÊNCIA  ELETRÔNICA  Nº  12/2026  -

PROCESSO  Nº  18.558/2026
OBJETO: Contratação de empresa especializada em

engenharia  para  a  execução  de  obras  e  serviços  de
recapeamento de pavimento asfáltico em ruas e avenidas
de diversos bairros no município de Mogi Guaçu/SP.

AVISO: Tornamos público que, fica SUSPENSA “sine
die”  a  licitação em referência
`

const SUMARIO = `SUMÁRIO

Poder Executivo 2 .............................................................................
Licitações e Contratos 2 ............................................................

Aviso de Licitação 2 ................................................................
Suspensão 2 ...........................................................................
Extrato 2 .................................................................................

Aviso de Licitação 5 .........................................................................................................................................................................................
PE 065/2026 - AVISO DE LICITAÇÃO . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .
`

const ADIAMENTO = `AVISO DE LICITAÇÃO – ADIAMENTO
PREGÃO PRESENCIAL Nº 30/2026
A Prefeitura Municipal de Senhor do Bonfim comunica o adiamento do certame.
Objeto: Aquisição de material de limpeza para as unidades de saúde do município.
Nova data: 30/10/2026 às 09h00.
`

const DESERTA_E_REABERTURA = `AVISO DE LICITAÇÃO DESERTA E REABERTURA DE PRAZO DO
DISPENSA ELETRÔNICA Nº 029/2026 – PROCESSO LICITATÓRIO
Nº 106/2026
O MUNICÍPIO DE BARÃO DE ANTONINA, através do Prefeito
Municipal, Sr. RODRIGO WALDEMAR MARQUES, TORNA
PÚBLICO e para conhecimento de todos os interessados que a
dispensa eletrônica em epígrafe para o objeto: “CONTRATAÇÃO DE
EMPRESA PARA REPARO DE PAVIMENTAÇÃO ASFÁLTICA E
SINALIZAÇÃO HORIZONTAL DE CICLOVIA”, conforme
especificações e quantitativos estabelecidos no Aviso de Contratação
Direta e seus anexos, designada para ser realizada no dia 14 de
outubro de 2026, às 8h, foi declarada DESERTA.
`

const HIFENIZADO = `AVISO DE LICITAÇÃO
PREGÃO ELETRÔNICO

Nº 055/2026 – UASG 985909
Objeto: Contratação de empresa espe-
cializada para prestação de serviços de telefonia móvel e telefonia fixa com forne-
cimento de aparelhos em regime de co-
modato. Abertura: 03/11/2026 às 10h00.
`

const SANASA = `SOCIEDADE DE ABASTECIMENTO DE ÁGUA E SANEAMENTO - SANASA

AVISO DE LICITAÇÃO
Pregão Eletrônico n. 333/2026 - Objeto: AQUISIÇÃO DE SENSOR ELETROME-
CÂNICO NÍVEL SÓLIDOS 150MM. Prazo para recebimento das propostas e início
da disputa de preços: dia 29/10/2026, às 9h. O acesso deve ser feito no site https://
licitacoes-e2.bb.com.br. Edital disponível na Internet (https://www.sanasa.com.br).

GERÊNCIA DE COMPRAS E LICITAÇÕES.

AVISO DE LICITAÇÃO
Pregão Eletrônico n. 303/2026 - Objeto: AQUISIÇÃO DE TERMINAIS
ILHOS. Prazo para recebimento das propostas e início da disputa de preços: dia
26/10/2026, às 9h. O acesso deve ser feito no site https://licitacoes-e2.bb.com.br.
Edital disponível na Internet (https://www.sanasa.com.br).

GERÊNCIA DE COMPRAS E LICITAÇÕES
`

const PARANHOS = `AVISO DE CONTRATAÇÃO DIRETA
PROCESSO ADMINISTRATIVO Nº. 185/2026

DISPENSA N°. 89/2026
Torna-se público que o Município de Paranhos/MS, por

meio  da  Agente  de  Contratações,  realizará  Dispensa
Presencial, com critério de julgamento (menor preço), na
hipótese do art. 75, inciso I, nos termos da Lei n.º 14.133,
de 1º de abril de 2021, e demais normas aplicáveis.

Data da sessão: 20/10/2026
Horário da Fase de Lances: 14H00
Local: Prefeitura Municipal de Paranhos, localizada na

Av. Marechal Dutra, 1500, Centro.
Modo de Disputa: Aberto

OBJETO DA CONTRATAÇÃO DIRETA
1- O objeto da presente licitação é a Contratação de

empresa  especializada  para  elaboração  de  projeto
arquitetônico  para  a  construção  de  um  novo  Hospital
Municipal  em  Paranhos/MS,  conforme  condições,
especificações  e  exigências  estabelecidas  no  Termo  de
Referência.
`

const ANDRADINA = `EDITAIS E AVISOS

PREGÃO ELETRÔNICO Nº 01/2026

AVISO DE LICITAÇÃO

A CÂMARA MUNICIPAL DE ANDRADINA, SP, torna público que se
acha aberta licitação na modalidade Pregão Eletrônico nº 01/2026,
objetivando a contratação de empresa para fornecimento e
instalação de móveis planejados para a Câmara Municipal de
Andradina, incluindo ambientes: Plenário, Sala de Reuniões, Sala
da Escola do Parlamento, Tesouraria e Contabilidade.
OBTENÇÃO DO EDITAL: www.camaraandradina.sp.gov.br.
Endereço eletrônico no qual ocorrerá a sessão pública:
https://bnccompras.com/.
RECEBIMENTO DE PROPOSTAS: até 13h00 do dia 27/10/2026.
INÍCIO DA DISPUTA DE PREÇOS: 27/10/2026 a partir das 13h00.

Andradina, SP, 14 de outubro de 2026.
`

const VERA_CRUZ = `AVISO DE LICITAÇÃO:
Pregão Eletrônico Nº 79/2026: Aquisição de material de construção e elétrico. Lances dia 04/11/2026 às 08h00 no site
www.portaldecompraspublicas.com.br.
GILSON ADRIANO BECKER
Prefeito Municipal
`

const TAUBATE = `Aviso de Edital

Pregão Eletrônico n° 73/2026

“Aquisição de materiais de laboratório.”

A Universidade de Taubaté (Autarquia Municipal) informa que se acha

publicado o Pregão Eletrônico nº 73/2026 com o encerramento do recebimento das

propostas às 9h30 do dia 16 de outubro de 2026. O Edital completo poderá ser
retirado junto ao Serviço de Licitações da Universidade de Taubaté.
`

const SEM_NUMERO = `AVISO DE LICITAÇÃO - OBJETO: “CONTRATAÇÃO DE INSTITUIÇÃO FINANCEIRA PARA A PRESTAÇÃO DE SERVIÇOS DE
CENTRALIZAÇÃO E PROCESSAMENTO DOS CRÉDITOS DAS FOLHAS DE PAGAMENTO DOS SERVIDORES PÚBLICOS”.
Data, horário e local da sessão: 22/10/2026 - 09:00 horas, no endereço eletrônico: https://licitavinhedo.balkertecnologia.com.br/
`

const DISPENSA_PASSADA = `AVISO DE DISPENSA ELETRÔNICA
DISPENSA ELETRÔNICA Nº 103/2026
Objeto: Aquisição de filme stretch e caixa plástica para o Departamento de Arborização e Produção Vegetal.
Abertura da sessão de disputa: 13/10/2026 às 14h00.
`

describe('Querido Diário — blocos de aviso', () => {
  it('ignora linhas de sumário com pontilhado e não abre bloco a partir delas', () => {
    expect(separarBlocosDeAviso(SUMARIO)).toHaveLength(0)
    expect(parseDiarioOficial(gazeta(), SUMARIO, AGORA).tenders).toHaveLength(0)
  })

  it('separa cada aviso do diário num bloco próprio', () => {
    const blocos = separarBlocosDeAviso(SENHOR_DO_BONFIM)
    expect(blocos.map((b) => b.texto.split('\n')[0].trim())).toEqual(['AVISO DE LICITAÇÃO', 'AVISO DE LICITAÇÃO'])
  })
})

describe('Querido Diário — aviso de licitação completo', () => {
  const resultado = parseDiarioOficial(gazeta(), SENHOR_DO_BONFIM, AGORA)

  it('descarta o aviso que já tem identificador do PNCP e conta o descarte', () => {
    expect(resultado.descartadosPorPncp).toBe(1)
    expect(resultado.tenders).toHaveLength(1)
  })

  it('normaliza o aviso sem identificador do PNCP', () => {
    const [t] = resultado.tenders
    expect(t.fonte).toBe('QUERIDO_DIARIO')
    expect(t.fonteId).toBe('QD-2930105:PREGAO:65-2026')
    expect(t.modalidade).toBe('PREGAO_ELETRONICO')
    expect(t.numeroControle).toBe('Pregão Eletrônico nº 65/2026')
    expect(t.objeto).toBe(
      'Aquisição de kits de materiais de uso pessoal e funcional destinados aos professores da Rede Municipal de Ensino, vinculados à Secretaria Municipal de Educação e Esportes de Senhor do Bonfim/BA'
    )
    expect(t.objetoResumido!.length).toBeLessThanOrEqual(200)
    expect(t.aberturaAt?.toISOString()).toBe('2026-10-23T12:00:00.000Z')
    expect(t.publicadoAt?.toISOString()).toBe('2026-10-13T15:00:00.000Z')
    expect(t.linkEdital).toBe('http://doem.org.br/ba/senhordobonfim/editais')
    expect(t.orgao).toBe('Prefeitura Municipal de Senhor do Bonfim')
    expect(t.municipio).toBe('Senhor do Bonfim')
    expect(t.municipioIbge).toBe('2930105')
    expect(t.uf).toBe('BA')
    expect(t.situacao).toBe('ABERTA')
    expect(t.rawJson).toMatchObject({
      gazetteUrl: gazeta().url,
      txtUrl: gazeta().txt_url,
      territoryId: '2930105',
      date: '2026-10-13',
      edition: '6.588',
    })
    expect(String(t.rawJson.trecho).startsWith('AVISO DE LICITAÇÃO')).toBe(true)
    expect(String(t.rawJson.trecho).length).toBeLessThanOrEqual(1500)
  })
})

describe('Querido Diário — formatos reais variados', () => {
  it('lê concorrência com objeto quebrado em várias linhas e ignora o aviso de suspensão', () => {
    const r = parseDiarioOficial(
      gazeta({ territory_id: '3530706', territory_name: 'Mogi Guaçu', state_code: 'SP', date: '2026-10-08' }),
      MOGI_GUACU,
      AGORA
    )
    expect(r.tenders).toHaveLength(1)
    const [t] = r.tenders
    expect(t.modalidade).toBe('CONCORRENCIA')
    expect(t.fonteId).toBe('QD-3530706:CONCORRENCIA:13-2026')
    expect(t.objeto).toBe(
      'Contratação de empresa especializada na execução de obras e serviços de engenharia para REFORMA DA QUADRA POLIESPORTIVA DO CENTRO ESPORTIVO WALDEMAR FERRARI, no Jardim Santa Terezinha II, neste Município de Mogi Guaçu/SP'
    )
    expect(t.aberturaAt?.toISOString()).toBe('2026-10-26T12:30:00.000Z')
    expect(t.linkEdital).toBe(gazeta().url)
  })

  it('descarta aviso de adiamento e de licitação deserta', () => {
    expect(parseDiarioOficial(gazeta(), ADIAMENTO, AGORA).tenders).toHaveLength(0)
    expect(parseDiarioOficial(gazeta(), DESERTA_E_REABERTURA, AGORA).tenders).toHaveLength(0)
  })

  it('junta palavras hifenizadas na quebra de linha do objeto', () => {
    const [t] = parseDiarioOficial(gazeta(), HIFENIZADO, AGORA).tenders
    expect(t.objeto).toBe(
      'Contratação de empresa especializada para prestação de serviços de telefonia móvel e telefonia fixa com fornecimento de aparelhos em regime de comodato'
    )
    expect(t.aberturaAt?.toISOString()).toBe('2026-11-03T13:00:00.000Z')
  })

  it('lê vários avisos do mesmo diário e atribui ao órgão do título da seção', () => {
    const r = parseDiarioOficial(
      gazeta({ territory_id: '3509502', territory_name: 'Campinas', state_code: 'SP', date: '2026-10-14' }),
      SANASA,
      AGORA
    )
    expect(r.tenders).toHaveLength(2)
    expect(r.tenders.map((t) => t.objeto)).toEqual([
      'AQUISIÇÃO DE SENSOR ELETROMECÂNICO NÍVEL SÓLIDOS 150MM',
      'AQUISIÇÃO DE TERMINAIS ILHOS',
    ])
    const [t] = r.tenders
    expect(t.fonteId).toBe('QD-3509502:PREGAO:333-2026:EMPRESA')
    expect(t.orgao).toBe('Sociedade de Abastecimento de Água e Saneamento')
    expect(t.objeto).toBe('AQUISIÇÃO DE SENSOR ELETROMECÂNICO NÍVEL SÓLIDOS 150MM')
    expect(t.aberturaAt?.toISOString()).toBe('2026-10-29T12:00:00.000Z')
    expect(r.avisos).toBe(2)
  })

  it('lê o segundo aviso consecutivo do mesmo diário', () => {
    const r = parseDiarioOficial(
      gazeta({ territory_id: '3509502', territory_name: 'Campinas', state_code: 'SP', date: '2026-10-14' }),
      SANASA.split('GERÊNCIA DE COMPRAS E LICITAÇÕES.')[1],
      AGORA
    )
    expect(r.tenders).toHaveLength(1)
    expect(r.tenders[0].objeto).toBe('AQUISIÇÃO DE TERMINAIS ILHOS')
    expect(r.tenders[0].aberturaAt?.toISOString()).toBe('2026-10-26T12:00:00.000Z')
  })

  it('lê aviso de contratação direta com fase de lances como dispensa com disputa', () => {
    const [t] = parseDiarioOficial(
      gazeta({ territory_id: '5006358', territory_name: 'Paranhos', state_code: 'MS', date: '2026-10-14' }),
      PARANHOS,
      AGORA
    ).tenders
    expect(t.modalidade).toBe('DISPENSA_COM_DISPUTA')
    expect(t.numeroControle).toBe('Dispensa nº 89/2026')
    expect(t.aberturaAt?.toISOString()).toBe('2026-10-20T17:00:00.000Z')
    expect(t.objeto.startsWith('Contratação de empresa especializada para elaboração de projeto arquitetônico')).toBe(true)
  })

  it('reconhece a Câmara Municipal como órgão e separa o identificador', () => {
    const [t] = parseDiarioOficial(
      gazeta({ territory_id: '3502101', territory_name: 'Andradina', state_code: 'SP', date: '2026-10-14' }),
      ANDRADINA,
      AGORA
    ).tenders
    expect(t.orgao).toBe('Câmara Municipal de Andradina')
    expect(t.fonteId).toBe('QD-3502101:PREGAO:1-2026:CAMARA')
    expect(t.linkEdital).toBe('https://bnccompras.com/')
    expect(t.aberturaAt?.toISOString()).toBe('2026-10-27T16:00:00.000Z')
    expect(t.objeto.startsWith('Contratação de empresa para fornecimento e instalação de móveis planejados')).toBe(true)
  })

  it('lê objeto logo depois do número da modalidade', () => {
    const [t] = parseDiarioOficial(
      gazeta({ territory_id: '4322707', territory_name: 'Vera Cruz', state_code: 'RS', date: '2026-10-14' }),
      VERA_CRUZ,
      AGORA
    ).tenders
    expect(t.objeto).toBe('Aquisição de material de construção e elétrico')
    expect(t.aberturaAt?.toISOString()).toBe('2026-11-04T11:00:00.000Z')
  })

  it('lê objeto entre aspas e o órgão declarado depois dele', () => {
    const [t] = parseDiarioOficial(
      gazeta({ territory_id: '3554102', territory_name: 'Taubaté', state_code: 'SP', date: '2026-10-05' }),
      TAUBATE,
      AGORA
    ).tenders
    expect(t.objeto).toBe('Aquisição de materiais de laboratório')
    expect(t.orgao).toBe('Universidade de Taubaté')
    expect(t.fonteId).toBe('QD-3554102:PREGAO:73-2026:UNIVERSIDADE')
    expect(t.aberturaAt?.toISOString()).toBe('2026-10-16T12:30:00.000Z')
  })

  it('descarta aviso sem número de modalidade', () => {
    expect(parseDiarioOficial(gazeta(), SEM_NUMERO, AGORA).tenders).toHaveLength(0)
  })

  it('marca como encerrada a licitação cuja sessão já passou', () => {
    const [t] = parseDiarioOficial(gazeta({ date: '2026-10-05' }), DISPENSA_PASSADA, AGORA).tenders
    expect(t.modalidade).toBe('DISPENSA_COM_DISPUTA')
    expect(t.situacao).toBe('ENCERRADA')
  })
})

describe('Querido Diário — identificador estável entre republicações', () => {
  it('gera o mesmo fonteId para o mesmo aviso em edições diferentes', () => {
    const primeira = parseDiarioOficial(gazeta(), SENHOR_DO_BONFIM, AGORA).tenders[0]
    const republicado = SENHOR_DO_BONFIM.replace('PREGÃO Nº 065/2026', 'PREGÃO ELETRÔNICO Nº 65/2026')
    const segunda = parseDiarioOficial(
      gazeta({ date: '2026-10-15', edition: '6.590', url: 'https://data.queridodiario.ok.org.br/2930105/2026-10-15/outro.pdf' }),
      republicado,
      AGORA
    ).tenders[0]
    expect(segunda.fonteId).toBe(primeira.fonteId)
    expect(segunda.publicadoAt?.toISOString()).toBe('2026-10-15T15:00:00.000Z')
  })

  it('mantém um só registro quando o diário repete o mesmo aviso', () => {
    const duplicado = HIFENIZADO + '\n\n' + HIFENIZADO
    expect(parseDiarioOficial(gazeta(), duplicado, AGORA).tenders).toHaveLength(1)
  })
})

describe('Querido Diário — modalidade e número', () => {
  it.each([
    ['PREGAO PRESENCIAL Nº 12/2026', 'PREGAO_PRESENCIAL', 'PREGAO', '12/2026'],
    ['PP 012/2026', 'PREGAO_PRESENCIAL', 'PREGAO', '12/2026'],
    ['PE 065/2026', 'PREGAO_ELETRONICO', 'PREGAO', '65/2026'],
    ['PREGAO(ELETRONICO) N° 20/2026', 'PREGAO_ELETRONICO', 'PREGAO', '20/2026'],
    ['CONCORRENCIA ELETRONICA Nº 13/2026', 'CONCORRENCIA', 'CONCORRENCIA', '13/2026'],
    ['TOMADA DE PRECOS Nº 3/2026', 'TOMADA_DE_PRECOS', 'TOMADA', '3/2026'],
    ['CHAMAMENTO PUBLICO Nº 2/2026', 'CREDENCIAMENTO', 'CHAMAMENTO', '2/2026'],
    ['CREDENCIAMENTO Nº 4/2026', 'CREDENCIAMENTO', 'CREDENCIAMENTO', '4/2026'],
    ['LEILAO ELETRONICO Nº 003/2026', 'OUTROS', 'LEILAO', '3/2026'],
    ['CONVITE Nº 5/2026', 'CONVITE', 'CONVITE', '5/2026'],
    ['DISPENSA ELETRONICA Nº 029/2026', 'DISPENSA_COM_DISPUTA', 'DISPENSA', '29/2026'],
    ['DISPENSA DE LICITACAO Nº 040-2026', 'DISPENSA_SEM_DISPUTA', 'DISPENSA', '40/2026'],
  ])('%s', (texto, modalidade, familia, numero) => {
    expect(identificarModalidade(texto)).toMatchObject({ modalidade, familia, numero })
  })

  it('não confunde número de processo com número da licitação', () => {
    expect(identificarModalidade('PROCESSO ADMINISTRATIVO Nº 108/2026 PREGAO N° 057/2026')).toMatchObject({ numero: '57/2026' })
    expect(identificarModalidade('PROCESSO Nº 20.018/2026')).toBeNull()
  })
})

describe('Querido Diário — data da sessão', () => {
  const diario = new Date('2026-10-13T15:00:00Z')
  it.each([
    ['no dia 23 de outubro de 2026, às 09h00', '2026-10-23T12:00:00.000Z'],
    ['Data de abertura: 09h30min do dia 26 de outubro de 2026.', '2026-10-26T12:30:00.000Z'],
    ['Abertura: 26/10/2026 às 09:00', '2026-10-26T12:00:00.000Z'],
    ['Sessão: 26/10/2026, 09h', '2026-10-26T12:00:00.000Z'],
    ['Data da sessão: 20/10/2026\nHorário da Fase de Lances: 14H00', '2026-10-20T17:00:00.000Z'],
    ['Abertura da sessão pública em 28/10/2026', '2026-10-28T03:00:00.000Z'],
  ])('%s', (texto, esperado) => {
    expect(extrairAbertura(chaveDeBusca(texto), diario)?.toISOString()).toBe(esperado)
  })

  it('escolhe a sessão, não o início do recebimento das propostas', () => {
    const texto =
      'Recebimento das propostas a partir do dia: 16 de outubro de 2026 às 09h00min. Início da sessão de disputa de preços: 03 de novembro de 2026, às 09h01min.'
    expect(extrairAbertura(chaveDeBusca(texto), diario)?.toISOString()).toBe('2026-11-03T12:01:00.000Z')
  })

  it('ignora data de assinatura, data anterior ao diário e data sem contexto', () => {
    expect(extrairAbertura(chaveDeBusca('Mogi Guaçu, 07 de outubro de 2026.'), diario)).toBeUndefined()
    expect(extrairAbertura(chaveDeBusca('Assinado digitalmente em 14/10/2026 10:32'), diario)).toBeUndefined()
    expect(extrairAbertura(chaveDeBusca('Senhor do Bonfim, 20 de outubro de 2026.'), diario)).toBeUndefined()
  })
})
