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

const PARANHOS_PREGOES = `AVISO DE LICITAÇÃO
PROCESSO ADMINISTRATIVO Nº. 186/2026

PREGÃO ELETRÔNICO N°. 07/2026
P R O T O C O L O  ( T C E ) :

41D5B208542DF0C1845933FB0CAAA3FB5B51B871
O  MUNICÍPIO  DE  PARANHOS/MS,  com  sede  na

Avenida Marechal Dutra, nº 1500, Centro, inscrito no CNPJ
sob o n° 01.998.335/0001-03, por intermédio do Setor de
Licitações,  pelo  presente,  torna  público,  para  o
conhecimento dos interessados que realizará LICITAÇÃO,
para  Registro  de  Preços,  na  modalidade  PREGÃO
ELETRÔNICO, tipo MENOR PREÇO POR ITEM, que será
processado e julgado em conformidade com os preceitos da
Lei  Federal  nº  14.133,  de  1º  de  abril  de  2021  e  suas
posteriores alterações.

OBJETO:  Registro  de  preço  para  futura  e  eventual
aquisição de ferros para a Secretaria Municipal de Obras,
Serviço Público e Transporte do Município de Paranhos/MS,
conforme  condições,  quantidades  e  exigências
estabelecidas  no  edital  e  seus  anexos.

DA  SESSÃO  PÚBLICA:  às  09h00min  do  dia
29/10/2026.

REFERÊNCIA DE TEMPO: Horário de Brasília (DF).
PLATAFORMA ELETRÔNICA:  LICITANET – Licitações

Eletrônicas
A íntegra do Edital encontra-se disponível no endereço

eletrônico do Portal  eletrônico da LICITANET – Licitações
E l e t r ô n i c a s ,  n o  e n d e r e ç o  e l e t r ô n i c o :
https: / / l ic i tanet .com.br/ .

Maiores informações poderão ser obtidas pelo e-mail
licitacao@paranhos.ms.gov.br  ou  pelo  telefone  (67)
3480-1225.

Paranhos (MS), 15 de outubro de 2026.
Heliomar Klabunde

Prefeito Municipal
...........................................................................................................

AVISO DE LICITAÇÃO
PROCESSO ADMINISTRATIVO Nº. 187/2026

PREGÃO PRESENCIAL N°. 54/2026
P R O T O C O L O  T C E :

5C20C1E1AB865734221A63586FF6004121F0AF00
O MUNICÍPIO DE PARANHOS, ESTADO DE MATO

GROSSO DO SUL, com sede na Avenida Marechal Dutra,
n º  1 5 0 0 ,  C e n t r o ,  i n s c r i t o  n o  C N P J  s o b  o  n °
01.998.335/0001-03,  através  do  Prefeito  Municipal,  pelo
presente,  torna  público,  para  o  conhecimento  dos
interessados  que  realizará  LICITAÇÃO  na  modalidade
PREGÃO  PRESENCIAL,  do  tipo  MENOR  PREÇO  POR
ITEM,  que  será  processado e  julgado  em conformidade
com os preceitos da Lei Federal nº 14.133, de 1º de abril de

2021,  bem  como  suas  posteriores  alterações  e  Lei
Complementar nº. 123/06 e suas posteriores alterações.

OBJETO:  Registro de Preços para futura e eventual
contratação  de  empresa  para  prestação  de  serviço  de
locação de estruturas e equipamentos e de serviços de
apoio à realização dos eventos promovidos ou apoiados
pelas Secretarias Municipais de Educação e Cultura e de
Juventude, Esporte e Lazer do Município de Paranhos/MS,
compreendendo  transporte,  montagem,  instalação,
operação,  suporte,  desmontagem  e  retirada,  conforme
aplicável,  além  de  serviços  de  sonorização,  iluminação,
decoração, segurança desarmada, salva-vidas e transporte
de  artistas  e  equipes  técnicas,  na  forma  e  condições
estabelecidas no Edital e seus Anexos.

RECEBIMENTO E ABERTURA DOS ENVELOPES DE
PROPOSTA E HABILITAÇÃO: 04 de novembro de 2026
às 08h30, em sessão pública a ser realizada na Sala de
Licitações, localizada na Avenida Marechal Dutra, 1500 —
Centro, Paranhos/MS.

RETIRADA DO EDITAL: Os interessados em participar
na  presente  licitação  deverão  retirar  o  edital  no
Departamento de Licitações e Compras Públicas, no Portal
da Transparência do Município ou solicitado pelo e-mail:
licitacao@paranhos.ms.gov.br.  Informações  de  rotina
poderão  ser  obtidas  pelo  telefone  (67)  3480-1225  no
horário das 07:00 às 17:00 horas.

Paranhos (MS), 15 de outubro de 2026.
Heliomar Klabunde

Prefeito Municipal
...........................................................................................................

Aditivos / Aditamentos / Supressões
`

const BELA_VISTA_SAAE = `SERVIÇO AUTONOMO DE ÁGUA E ESGOTO
AUTARQUIA MUNICIPAL LEI Nº 508/67
 FONE: (67) 3439-1483     -     3439-1355

EXTRATO – AVISO DE LICITAÇÃO

PREGÃO PRESENCIAL Nº 0001/2026

Processo Licitatório nº. 000017/2026

Código Registro Informação e-Sfinge:

"F6B9CFE884C42451973482F843AAE0333CBC43CB"

O Serviço Autônomo de Água e Esgoto de Bela Vista – MS, por

intermédio do Departamento de Licitação, torna público para

conhecimento dos interessados que se encontra aberta à licitação

acima referida, do tipo “Menor Preço Por Item”.

OBJETO: REGISTRO DE PREÇOS para contratação de empresa

especializada na prestação de serviços de rebobinamento e

recuperação eletromecânica de motores elétricos de 5CV, 20CV,

25CV, 40CV e 50CV e de conjuntos motobomba submersos de 2.5HP,

4.5HP, 5HP, 5.5HP e 7.8HP, monofásicos e trifásicos, bem como de

motores/bombas submersas de esgoto de 7,5CV e 30CV, 220V,

trifásicos, com fornecimento das peças e dos materiais necessários,

para atender às necessidades da Estação de Tratamento de Água e

Esgoto e dos poços artesianos atendidos pelo SAAE de Bela Vista/MS.

OBTENÇÃO DO EDITAL: e-mail: licitacao@saaebelavista.ms.gov.br

– telefone (67) 3439-1483, no horário das 07h00min às 11h00min e

das 13h00min às 17h00min. O edital está disponível no Portal da

Transparência: www.saaebelavista.ms.gov.br - PNCP

https://www.gov.br/pncp/pt-br e no Portal: LICITANET

www.licitanet.com.br

Abertura: 04/11/2026 – Horário: 08h00min – Horário de Brasília/DF.

Local: Portal Licitanet – www.licitanet.com.br

Bela Vista/MS, 16 de agosto de 2026.

JUNIO BARBOZA LOPES

DIR. SAAE BELA VISTA - MS
`

const JEREMOABO_CREDENCIAMENTO = `Licitações

CERTIFICAÇÃO DIGITAL: QUE3OEQ5QUQ0Q0RGNJQ1OT
Esta edição encontra-se no site oficial deste ente.

AVISO DE CREDENCIAMENTO N.º 009/2026

O Município de Jeremoabo-BA, torna público que realizará chamada de Credenciamento eletrônico, com
respaldo Artigo 78, I, 79, c/c o caput do art. 74 da Lei nº 14.133, de pessoa jurídica para
CREDENCIAMENTO DE PESSOAS JURÍDICAS LEGALMENTE HABILITADAS À PRESTAÇÃO DE
SERVIÇOS MÉDICOS NAS UNIDADES DA REDE MUNICIPAL DE SAÚDE, conforme termo de referência.
A documentação de habilitação e proposta de preços serão recebidas a partir de 16/10/2026 AO DIA
03/11/2026 das 08:00 às 12:00 presencialmente, no Setor de Licitações da Prefeitura Municipal de
Jeremoabo/BA. O prazo final para entrega da documentação encerrar-se-á em 03/11/2026, às 10:30. A
Sessão Pública de Credenciamento, a realizar-se em 03/11/2026, às 11h00min. Disponibilização do edital
para consulta e retirada nos endereços https://transparencia.jeremoabo.ba.gov.br/editais-licitacoes e
https://pncp.gov.br/app/editais Informações complementares poderão ser obtidas através do e-mail
licitacao@jeremoabo.ba.gov.br. Jeremoabo, 15/10/2026. Jefferson de Oliveira Souza, Agente de
Contratação.
`

const PALMAS_DISPENSA_E_CHAMAMENTO = `Palmas - TO, 16 de outubro de 2026.

Marcia Helena Teodoro de Carvalho
Pregoeira

AVISO DE DISPENSA ELETRÔNICA N° 109/2026
EXCLUSIVO PARA ME/EPP

NIPE: 17.137003.000769/2026-84.
OBJETO: Contratação de empresa para a prestação de serviços
de fornecimento e instalação de persianas, bem como a remoção,
higienização e reinstalação.
INTERESSADO: SECRETARIA MUNICIPAL DE MOBILIDADE E
TRANSPORTE PÚBLICO.
OBTENÇÃO DO EDITAL: www.portaldecompraspublicas.com.br.
RECEBIMENTO DE PROPOSTAS: 19/10/2026 (18h00min) -
22/10/2026 (08h59min).
FASE DE LANCES: 22/10/2026 - 09h00min às 15h00min.
INFORMAÇÕES COMPLEMENTARES: Mais informações poderão
ser obtidas na Superintendência de Licitações, em horário das 13h
às 19h ou pelo e-mail compraselicitacoes@palmas.to.gov.br, em
dias úteis.

Palmas/TO, 16 de outubro de 2026.

Antonio Luiz Cardozo Brito
Superintendente de Licitações

ANA PAULA DOS SANTOS ANDRADE ABADIA
Secretária Municipal de Saúde

EXTRATO DE EDITAL DE CHAMAMENTO PÚBLICO N° 03/2026
PARA CREDENCIAMENTO DE PESSOAS JURÍDICAS DE

DIREITO PRIVADO PARA A OFERTA DE CONSULTAS
MÉDICAS ESPECIALIZADAS, PROCEDIMENTOS

AMBULATORIAIS COM FINALIDADE DIAGNÓSTICA E
PROCEDIMENTOS MÉDICO-CIRÚRGICOS AMBULATORIAIS,

NO MUNICÍPIO DE PALMAS TOCANTINS

O MUNICÍPIO DE PALMAS, no Estado do Tocantins, por intermédio
da Secretaria Municipal de Saúde, torna pública a seleção de pessoas
jurídicas prestadoras de serviços na área de saúde para contratação
sob o sistema de Credenciamento, em conformidade com o disposto
neste Chamamento Público, com as Leis Federais nº 8.080/90 e n°
14.133/21, com a Portaria GM nº 1034/2010, com o Decreto Municipal
nº 2.460, de 15 de dezembro de 2023, o Manual de Orientações para
Contratação de Serviços no SUS, as demais legislações aplicáveis e
princípios norteadores da Administração Pública.
DO OBJETO: Este Edital tem por objeto a contratação, de
norma complementar, de pessoas jurídicas de direito privado
para a prestação de serviços em saúde, tem como objetivo o
Credenciamento de Pessoas Jurídicas de Direito Privado para
a Oferta de Consultas Médicas Especializadas, Procedimentos
Ambulatoriais com Finalidade Diagnóstica e Procedimentos
Médico-Cirúrgicos Ambulatoriais, no Município de Palmas Tocantins
em conformidade com a constituição federal, sob o sistema de
Chamada Pública para credenciamento nos termos dos Anexos
deste Instrumento, link: https://www.palmas.to.gov.br/media/arquivo/
pagina_arquivo/edital_de_consultas_e_exames.pdf.
DA PARTICIPAÇÃO: Poderá participar desse processo seletivo
qualquer empresa legalmente constituída, que possua matriz ou filial
com domicilio no município de Palmas-TO, desde que satisfaça os
requisitos deste edital na integra.

Este edital entra em vigor a partir do dia 15 de Outubro de 2026.

ANA PAULA DOS SANTOS ANDRADE ABADIA
Secretária Municipal de Saúde
`

const MARILIA_TERMOS = `TERMO DE ABERTURA
EDITAL DE CHAMAMENTO PÚBLICO Nº 009/2026. ÓRGÃO:
Prefeitura Municipal de Marília. INSTRUMENTO AUXILIAR:
CREDENCIAMENTO. FORMA: Eletrônica. OBJETO: Seleção
exclusiva de PESSOAS JURÍDICAS para a outorga de concessão de
uso de bem público, a título precário e oneroso, destinada à
exploração comercial de gêneros alimentícios e serviços correlatos
em áreas delimitadas no Município de Marília/SP, conforme edital
e anexos. As empresas interessadas deverão protocolar, por meio
https://www.marilia.sp.gov.br/central-de-servicos---licitacao, do
sistema 1DOC: PROPOSTA, as DECLARAÇÕES e os DOCUMENTOS
DE HABILITAÇÃO,  recebimento permanecerá aberto por 30
(trinta) dias a partir da publicação deste instrumento convocatório.

MÁRIO RUI ANDRADE DE MOURA
Secretário Municipal do Meio Ambiente e Serviços Públicos

TERMO DE SUSPENSÃO
EDITAL DE LICITAÇÃO Nº 103/2026. UNIDADE COMPRADORA:
986681.  NUMERO DA COMPRA: 30/2026. ÓRGÃO: Prefeitura
Municipal de Marília. MODALIDADE: Pregão. FORMA: Eletrônica.
MODO DE DISPUTA: ABERTO. OBJETO: a aquisição de um 01 (um)
ÔNIBUS RODOVIÁRIO ADAPTADO destinado à Secretaria
Municipal de Assistência Social e Cidadania - Conselho Municipal
dos Direitos da Criança e do Adolescente (CMDCA. TERMO DE
SUSPENSÃO: Considerando a necessidade de melhor análise nas
exigências constantes no instrumento convocatório.

HÉLIDE MARIA PARRERA
Secretária Municipal de Assistência Social e Cidadania
`

const COSTA_RICA_RETOMADA = `MUNICÍPIO DE COSTA RICA

AVISO DE RETOMADA DE PREGÃO ELETRÔNICO

UNIDADE GESTORA: SECRETARIA MUNICIPAL DE TRANSPORTE, URBANIZAÇÃO E OBRAS
PÚBLICAS.
PREGÃO ELETRÔNICO Nº 38/2026
PROCESSO ADMINISTRATIVO Nº 000170/2026
TIPO: Menor Preço Por Item
OBJETO: Aquisição de 01 (um) ônibus urbano (circular), novo (zero quilômetro), ano/modelo
2026/2026 ou superior, para atender às demandas da Secretaria Municipal de Transporte,
Urbanização e Obras Públicas.
VALOR ESTIMADO: R$ 920.066,66 (novecentos e vinte mil e sessenta e seis reais e sessenta e seis
centavos)
DATA DA ABERTURA DA SESSÃO: 29 de outubro de 2026.
HORÁRIO DA ABERTURA DA SESSÃO: 08:30 (horário de Brasília/DF).
LINK PARA REALIZAÇÃO DA SESSÃO: https://www.portaldecompraspublicas.com.br/
CODIGO DE REGISTRO: 9A17C2D4B9F175FA84E1ACF2742B490FF9F3C291
`

const MAJOR_IZIDORO = `Alagoas , 15 de Outubro de 2026   •   Diário Oficial dos Municípios do Estado de Alagoas   •    ANO XIV | Nº 2913

ESTADO DE ALAGOAS

PREFEITURA MUNICIPAL DE MAJOR IZIDORO

AVISO DE CONTRATAÇÃO DIRETA POR DISPENSA DE

LICITAÇÃO

Face aos constantes nos autos do procedimento de Contratação Direta

Por Dispensa de Licitação nº 012/2026, referente ao Processo

Administrativo nº 001.008.242871. Objeto: Contratação de empresa

www.diariomunicipal.com.br/ama                                                                                39

especializada para prestação de serviços de saúde e segurança do

trabalho, manutenção e controle sanitário, compreendendo PGR,

Inventário de Riscos, PCMSO, PMOC e controle de pragas,

destinados a unidade de Saúde, do Município de Major Izidoro-

AL. RATIFICO o objeto do certame, sob os fundamentos do artigo

72, VIII da Lei Federal nº 14.333/2021, para que se produzam os

devidos efeitos legais, em prol da empresa: PROVER -

ENGENHARIA AMBIENTAL E SEGURANCA DO

TRABALHO LTDA, pessoa jurídica de direito privado, inscrita no

CNPJ/MF sob o nº 28.019.237/0001-33, Valor Total: R$ 15.410,00

(Quinze mil quatrocentos e dez reais).

Código Identificador:9EC32DD7

SETOR DE AQUISIÇÃO DE BENS E SERVIÇOS

AVISO DE COTAÇÃO DE PREÇOS Nº 017/2026

O Município de Major Izidoro/AL, através do Departamento de

Aquisição de Bens e Serviços, torna público a conveniência e

necessidade da Contratação de empresa especializada para o

fornecimento de eletrodomésticos e equipamentos industriais para

cozinha, destinados às unidades escolares da Rede Municipal de

Ensino, em atendimento ao Programa Escola em Tempo Integral, no

âmbito da Secretaria Municipal de Educação do Município de Major

Izidoro/AL, Conforme exigências estabelecidas no termo de

referência, mediante Dispensa de Licitação, nos termos do art. 75, II,

da Lei nº 14.133/2021, solicitando que os interessados apresentem

Proposta de Preços e Documentos de Habilitação, em conformidade

com o Termo de Referência, no prazo de 3 (três) dais úteis, sendo de

15 de outubro de 2026 a 19 de outubro de 2026. O Termo de

Referência do objeto da contratação encontra-se disponível no site

www.majorizidoro.al.gov.br do Portal de transparência da

prefeitura, solicitação via e-mail

comprascotacoes@majorizidoro.al.gov.br, e na sede do Município,

situada no endereço Praça Leopoldo Amaral, S/n, Centro, Major

www.diariomunicipal.com.br/ama                                                                                41

Izidoro/AL, CEP 57.580-000, em dias úteis, no horário das 08 às 12

horas (horário local).

Major Izidoro/AL, 14 de outubro de 2026.

ALICE KELI FERREIRA PERGENTINO
Setor De Compras – Responsável Pela Cotação

Código Identificador:6276D1B8
`

describe('Querido Diário — novos tipos de aviso (trechos reais)', () => {
  it('lê pregão eletrônico e pregão presencial do mesmo diário, com a sessão no horário de Brasília', () => {
    const r = parseDiarioOficial(
      gazeta({ territory_id: '5006358', territory_name: 'Paranhos', state_code: 'MS', date: '2026-10-16' }),
      PARANHOS_PREGOES,
      AGORA
    )
    expect(r.tenders.map((t) => [t.modalidade, t.numeroControle, t.aberturaAt?.toISOString()])).toEqual([
      ['PREGAO_ELETRONICO', 'Pregão Eletrônico nº 7/2026', '2026-10-29T12:00:00.000Z'],
      ['PREGAO_PRESENCIAL', 'Pregão Presencial nº 54/2026', '2026-11-04T11:30:00.000Z'],
    ])
    expect(r.tenders[0].objeto.startsWith('Registro de preço para futura e eventual aquisição de ferros')).toBe(true)
    expect(r.tenders[1].fonteId).toBe('QD-5006358:PREGAO:54-2026')
    expect(r.tenders.every((t) => t.orgao === 'Prefeitura Municipal de Paranhos')).toBe(true)
  })

  it('lê extrato de aviso de licitação de autarquia (SAAE)', () => {
    const [t] = parseDiarioOficial(
      gazeta({ territory_id: '5002100', territory_name: 'Bela Vista', state_code: 'MS', date: '2026-10-16' }),
      BELA_VISTA_SAAE,
      AGORA
    ).tenders
    expect(t.modalidade).toBe('PREGAO_PRESENCIAL')
    expect(t.numeroControle).toBe('Pregão Presencial nº 1/2026')
    expect(t.orgao).toBe('Serviço Autônomo de Água e Esgoto de Bela Vista')
    expect(t.fonteId).toBe('QD-5002100:PREGAO:1-2026:SERVICO')
    expect(t.aberturaAt?.toISOString()).toBe('2026-11-04T11:00:00.000Z')
    expect(t.objeto.startsWith('REGISTRO DE PREÇOS para contratação de empresa especializada')).toBe(true)
  })

  it('lê aviso de credenciamento sem rótulo de objeto, pela finalidade', () => {
    const [t] = parseDiarioOficial(
      gazeta({ territory_id: '2918100', territory_name: 'Jeremoabo', state_code: 'BA', date: '2026-10-16' }),
      JEREMOABO_CREDENCIAMENTO,
      AGORA
    ).tenders
    expect(t.modalidade).toBe('CREDENCIAMENTO')
    expect(t.fonteId).toBe('QD-2918100:CREDENCIAMENTO:9-2026')
    expect(t.objeto).toBe(
      'CREDENCIAMENTO DE PESSOAS JURÍDICAS LEGALMENTE HABILITADAS À PRESTAÇÃO DE SERVIÇOS MÉDICOS NAS UNIDADES DA REDE MUNICIPAL DE SAÚDE'
    )
    expect(t.aberturaAt?.toISOString()).toBe('2026-11-03T14:00:00.000Z')
    expect(t.linkEdital).toBe('https://transparencia.jeremoabo.ba.gov.br/editais-licitacoes')
  })

  it('lê aviso de dispensa eletrônica e extrato de edital de chamamento público', () => {
    const r = parseDiarioOficial(
      gazeta({ territory_id: '1721000', territory_name: 'Palmas', state_code: 'TO', date: '2026-10-16' }),
      PALMAS_DISPENSA_E_CHAMAMENTO,
      AGORA
    )
    expect(r.tenders).toHaveLength(2)
    const [dispensa, chamamento] = r.tenders
    expect(dispensa.modalidade).toBe('DISPENSA_COM_DISPUTA')
    expect(dispensa.numeroControle).toBe('Dispensa nº 109/2026')
    expect(dispensa.objeto).toBe(
      'Contratação de empresa para a prestação de serviços de fornecimento e instalação de persianas, bem como a remoção, higienização e reinstalação'
    )
    expect(dispensa.aberturaAt?.toISOString()).toBe('2026-10-22T12:00:00.000Z')
    expect(chamamento.modalidade).toBe('CREDENCIAMENTO')
    expect(chamamento.numeroControle).toBe('Chamamento Público nº 3/2026')
    expect(chamamento.fonteId).toBe('QD-1721000:CHAMAMENTO:3-2026')
    expect(chamamento.objeto.startsWith('Este Edital tem por objeto a contratação')).toBe(true)
    expect(chamamento.situacao).toBe('ABERTA')
  })

  it('lê termo de abertura de chamamento público e ignora o termo de suspensão seguinte', () => {
    const r = parseDiarioOficial(
      gazeta({ territory_id: '3529005', territory_name: 'Marília', state_code: 'SP', date: '2026-10-17' }),
      MARILIA_TERMOS,
      AGORA
    )
    expect(r.tenders).toHaveLength(1)
    const [t] = r.tenders
    expect(t.modalidade).toBe('CREDENCIAMENTO')
    expect(t.numeroControle).toBe('Chamamento Público nº 9/2026')
    expect(t.objeto.startsWith('Seleção exclusiva de PESSOAS JURÍDICAS para a outorga de concessão de uso de bem público')).toBe(true)
  })

  it('lê aviso de retomada de pregão eletrônico com a nova sessão', () => {
    const [t] = parseDiarioOficial(
      gazeta({ territory_id: '5003256', territory_name: 'Costa Rica', state_code: 'MS', date: '2026-10-15' }),
      COSTA_RICA_RETOMADA,
      AGORA
    ).tenders
    expect(t.modalidade).toBe('PREGAO_ELETRONICO')
    expect(t.numeroControle).toBe('Pregão Eletrônico nº 38/2026')
    expect(t.aberturaAt?.toISOString()).toBe('2026-10-29T11:30:00.000Z')
    expect(t.linkEdital).toBe('https://www.portaldecompraspublicas.com.br/')
  })

  it('lê aviso de cotação de preços como dispensa e descarta a dispensa já ratificada', () => {
    const r = parseDiarioOficial(
      gazeta({ territory_id: '2704401', territory_name: 'Major Isidoro', state_code: 'AL', date: '2026-10-15' }),
      MAJOR_IZIDORO,
      AGORA
    )
    expect(r.tenders).toHaveLength(1)
    const [t] = r.tenders
    expect(t.modalidade).toBe('DISPENSA_COM_DISPUTA')
    expect(t.fonteId).toBe('QD-2704401:DISPENSA:17-2026')
    expect(t.objeto).toBe(
      'Contratação de empresa especializada para o fornecimento de eletrodomésticos e equipamentos industriais para cozinha, destinados às unidades escolares da Rede Municipal de Ensino, em atendimento ao Programa Escola em Tempo Integral, no âmbito da Secretaria Municipal de Educação do Município de Major Izidoro/AL'
    )
    expect(String(t.rawJson.trecho)).not.toContain('diariomunicipal.com.br/ama')
  })

  it.each([
    ['Tomada de Preços nº 010/2023', 'TOMADA_DE_PRECOS', 'TOMADA', '10/2023'],
    ['CONCORRÊNCIA PÚBLICA Nº 05/2026', 'CONCORRENCIA', 'CONCORRENCIA', '5/2026'],
    ['AVISO DE COTAÇÃO DE PREÇOS Nº 017/2026', 'DISPENSA_COM_DISPUTA', 'DISPENSA', '17/2026'],
    ['CHAMADA PÚBLICA Nº 02/2026', 'CREDENCIAMENTO', 'CHAMAMENTO', '2/2026'],
  ])('mapeia %s', (texto, modalidade, familia, numero) => {
    expect(identificarModalidade(chaveDeBusca(texto))).toMatchObject({ modalidade, familia, numero })
  })
})
