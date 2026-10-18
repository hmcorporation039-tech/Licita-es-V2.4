import type { AlertaLegal, IdDoAlerta } from '../alertasLegais'
import { localEData } from './proponente'
import { marcador, type Bloco, type Certame, type DocumentoDaLicitacao, type Proponente } from './modelo'

export interface PrazoDaImpugnacao {
  limite: string
  passou: boolean
}

export const PEDIDOS_POR_ALERTA: Record<IdDoAlerta, string> = {
  'garantia-proposta': 'limitar a garantia de proposta a até 1% (um por cento) do valor estimado da contratação, nos termos do art. 58, §1º, da Lei nº 14.133/2021',
  'garantia-contratual': 'adequar a garantia contratual aos limites dos arts. 98 e 99 da Lei nº 14.133/2021 ou apresentar a justificativa técnica que a fundamente',
  'patrimonio-liquido': 'limitar a exigência de capital mínimo ou de patrimônio líquido mínimo a até 10% (dez por cento) do valor estimado da contratação, nos termos do art. 69, §4º, da Lei nº 14.133/2021',
  'visita-tecnica': 'admitir a substituição da visita técnica por declaração formal do responsável técnico de que conhece as condições locais, nos termos do art. 63, §2º, da Lei nº 14.133/2021',
  'indice-contabil': 'adotar os índices contábeis usualmente praticados (iguais ou superiores a 1,0) ou demonstrar, no processo, a justificativa técnica para o valor exigido',
  'faturamento-minimo': 'excluir a exigência de faturamento mínimo e de índices de rentabilidade ou lucratividade',
  'atestado-quantitativo': 'limitar o quantitativo exigido nos atestados de capacidade técnica a até 50% (cinquenta por cento) das parcelas de maior relevância',
  'atestado-tempo-local': 'excluir as limitações de tempo e de local impostas aos atestados de capacidade técnica',
  'propriedade-ou-sede': 'substituir a exigência por declaração de disponibilidade, a ser comprovada apenas pelo licitante vencedor antes da assinatura do contrato',
  'documento-fora-do-rol': 'excluir a exigência do documento, por não constar do rol de documentos de habilitação dos arts. 62 a 70 da Lei nº 14.133/2021',
}

const ARGUMENTOS_POR_ALERTA: Record<IdDoAlerta, string> = {
  'garantia-proposta': 'A garantia de proposta exigida supera o limite de 1% (um por cento) do valor estimado da contratação fixado pelo art. 58, §1º, da Lei nº 14.133/2021.',
  'garantia-contratual': 'O percentual de garantia contratual exigido excede os limites dos arts. 98 e 99 da Lei nº 14.133/2021 (até 5%, ou até 10% com justificativa de complexidade técnica e de riscos; até 30% apenas em obras e serviços de engenharia de grande vulto), sem que conste do edital a justificativa que o admitiria.',
  'patrimonio-liquido': 'A exigência de capital mínimo ou de patrimônio líquido mínimo supera o limite de 10% (dez por cento) do valor estimado da contratação previsto no art. 69, §4º, da Lei nº 14.133/2021.',
  'visita-tecnica': 'O edital torna obrigatória a visita técnica sem admitir sua substituição por declaração formal do responsável técnico de que conhece as condições locais, alternativa assegurada pelo art. 63, §2º, da Lei nº 14.133/2021.',
  'indice-contabil': 'Os índices contábeis exigidos superam os valores usualmente adotados (1,0), sem que conste do processo justificativa técnica fundamentada em parâmetros de mercado e nas características do objeto, como exigem o art. 69 da Lei nº 14.133/2021 e a Súmula nº 289 do TCU.',
  'faturamento-minimo': 'A Lei nº 14.133/2021, em seu art. 69, veda a exigência de valores mínimos de faturamento anterior e de índices de rentabilidade ou lucratividade, entendimento também consolidado na Súmula nº 289 do TCU.',
  'atestado-quantitativo': 'A exigência supera o limite de 50% (cinquenta por cento) das parcelas de maior relevância admitido pelo art. 67, §2º, da Lei nº 14.133/2021.',
  'atestado-tempo-local': 'O art. 67, §2º, da Lei nº 14.133/2021 veda expressamente limitações de tempo e de locais específicos relativas aos atestados de capacidade técnica.',
  'propriedade-ou-sede': 'A exigência impõe ao licitante custos anteriores à celebração do contrato, o que é vedado pela Súmula nº 272 do TCU; basta a declaração de disponibilidade, cuja comprovação cabe somente ao vencedor.',
  'documento-fora-do-rol': 'O documento exigido não integra o rol de documentos de habilitação previsto nos arts. 62 a 70 da Lei nº 14.133/2021, configurando exigência sem amparo legal.',
}

const PERGUNTAS_POR_ALERTA: Record<IdDoAlerta, string> = {
  'garantia-proposta': 'qual o percentual efetivo da garantia de proposta e como ele se compatibiliza com o limite de 1% do art. 58, §1º, da Lei nº 14.133/2021',
  'garantia-contratual': 'qual a justificativa técnica para o percentual de garantia contratual exigido',
  'patrimonio-liquido': 'qual o percentual de capital mínimo ou de patrimônio líquido exigido em relação ao valor estimado',
  'visita-tecnica': 'se a visita técnica poderá ser substituída por declaração do responsável técnico de que conhece as condições locais',
  'indice-contabil': 'qual a justificativa técnica, constante do processo, para o valor dos índices contábeis exigidos',
  'faturamento-minimo': 'se a exigência de faturamento mínimo ou de rentabilidade será mantida, e com qual fundamento legal',
  'atestado-quantitativo': 'qual o percentual do quantitativo exigido nos atestados e quais são as parcelas de maior relevância consideradas',
  'atestado-tempo-local': 'se serão aceitos atestados de qualquer período e de qualquer localidade',
  'propriedade-ou-sede': 'se a exigência deverá ser atendida já na habilitação ou somente pelo vencedor, antes da assinatura do contrato',
  'documento-fora-do-rol': 'qual o fundamento legal para a exigência do documento, considerando o rol dos arts. 62 a 70 da Lei nº 14.133/2021',
}

const enderecamento = (c: Certame) => `Ao(À) Agente de Contratação / Pregoeiro(a) do(a) ${c.orgao}`
const referencia = (c: Certame) => `Referência: ${c.referencia}${c.sessao ? `, cuja sessão pública está marcada para ${c.sessao}` : ''}.`
const ondeEsta = (a: AlertaLegal) => (a.local ? ` (${a.local})` : '')

function tempestividade(prazo: PrazoDaImpugnacao | null, pendencias: string[]): string {
  if (!prazo) {
    pendencias.push('data limite para impugnação (sessão sem data no sistema)')
    return `O art. 164 da Lei nº 14.133/2021 assegura a qualquer pessoa o direito de impugnar o edital e de solicitar esclarecimentos até 3 (três) dias úteis antes da data de abertura do certame. O presente pedido é apresentado até ${marcador('data limite')}, sendo, portanto, tempestivo.`
  }
  if (prazo.passou) pendencias.push(`o prazo para impugnação terminou em ${prazo.limite}`)
  return `O art. 164 da Lei nº 14.133/2021 assegura a qualquer pessoa o direito de impugnar o edital e de solicitar esclarecimentos até 3 (três) dias úteis antes da data de abertura do certame, prazo que se encerra em ${prazo.limite}. O presente pedido é, portanto, tempestivo.`
}

export function impugnacao(
  proponente: Proponente,
  certame: Certame,
  alertas: AlertaLegal[],
  prazo: PrazoDaImpugnacao | null,
  quando: Date = new Date(),
): { documento: DocumentoDaLicitacao; pendencias: string[] } {
  const pendencias = [...proponente.pendencias]
  const blocos: Bloco[] = [
    { tipo: 'titulo', texto: 'IMPUGNAÇÃO AO EDITAL' },
    { tipo: 'paragrafo', texto: enderecamento(certame) },
    { tipo: 'paragrafo', texto: referencia(certame) },
    { tipo: 'paragrafo', texto: `Objeto: ${certame.objeto}` },
    {
      tipo: 'paragrafo',
      texto: `${proponente.qualificacao}, vem, respeitosamente, com fundamento no art. 164 da Lei nº 14.133/2021, apresentar IMPUGNAÇÃO ao edital em referência, pelos fatos e fundamentos a seguir expostos.`,
    },
    { tipo: 'titulo', texto: 'I. DA TEMPESTIVIDADE' },
    { tipo: 'paragrafo', texto: tempestividade(prazo, pendencias) },
    { tipo: 'titulo', texto: 'II. DOS FATOS E FUNDAMENTOS' },
  ]

  alertas.forEach((a, i) => {
    blocos.push(
      { tipo: 'paragrafo', texto: `II.${i + 1}. ${a.titulo}` },
      { tipo: 'paragrafo', texto: `O edital${ondeEsta(a)} estabelece: "${a.trecho}"` },
      { tipo: 'paragrafo', texto: ARGUMENTOS_POR_ALERTA[a.id] },
    )
  })
  blocos.push({
    tipo: 'paragrafo',
    texto:
      'As exigências apontadas restringem indevidamente o caráter competitivo do certame, em desacordo com os princípios da competitividade, da isonomia e da seleção da proposta mais vantajosa (arts. 5º e 11 da Lei nº 14.133/2021).',
  })

  blocos.push(
    { tipo: 'titulo', texto: 'III. DOS PEDIDOS' },
    { tipo: 'paragrafo', texto: 'Diante do exposto, requer:' },
    { tipo: 'paragrafo', texto: 'a) o recebimento e o processamento da presente impugnação, por tempestiva;' },
  )
  alertas.forEach((a, i) => {
    blocos.push({ tipo: 'paragrafo', texto: `${String.fromCharCode(98 + i)}) quanto ao item II.${i + 1}${ondeEsta(a)}, ${PEDIDOS_POR_ALERTA[a.id]};` })
  })
  blocos.push(
    {
      tipo: 'paragrafo',
      texto: `${String.fromCharCode(98 + alertas.length)}) a republicação do edital com as retificações, reabrindo-se o prazo para apresentação das propostas, nos termos do art. 55, §1º, da Lei nº 14.133/2021.`,
    },
    { tipo: 'paragrafo', texto: 'Nestes termos, pede deferimento.' },
    { tipo: 'assinatura', local: localEData(proponente, quando) },
  )

  return { documento: { tipo: 'impugnacao', titulo: 'Impugnação ao edital', blocos }, pendencias }
}

export function pedidoDeEsclarecimento(
  proponente: Proponente,
  certame: Certame,
  alertas: AlertaLegal[],
  perguntasLivres: string[],
  prazo: PrazoDaImpugnacao | null,
  quando: Date = new Date(),
): { documento: DocumentoDaLicitacao; pendencias: string[] } {
  const pendencias = [...proponente.pendencias]
  const perguntas = [
    ...alertas.map((a) => `Considerando o disposto no edital${ondeEsta(a)} ("${a.trecho}"), solicita-se esclarecer ${PERGUNTAS_POR_ALERTA[a.id]}.`),
    ...perguntasLivres.map((p) => p.trim()).filter(Boolean),
  ]
  if (perguntas.length === 0) {
    pendencias.push('pergunta do pedido de esclarecimento')
    perguntas.push(marcador('escreva aqui a sua pergunta'))
  }

  const blocos: Bloco[] = [
    { tipo: 'titulo', texto: 'PEDIDO DE ESCLARECIMENTO' },
    { tipo: 'paragrafo', texto: enderecamento(certame) },
    { tipo: 'paragrafo', texto: referencia(certame) },
    { tipo: 'paragrafo', texto: `Objeto: ${certame.objeto}` },
    {
      tipo: 'paragrafo',
      texto: `${proponente.qualificacao}, vem, respeitosamente, com fundamento no art. 164 da Lei nº 14.133/2021, apresentar PEDIDO DE ESCLARECIMENTO acerca do edital em referência.`,
    },
    { tipo: 'paragrafo', texto: tempestividade(prazo, pendencias) },
    { tipo: 'titulo', texto: 'DOS ESCLARECIMENTOS SOLICITADOS' },
    ...perguntas.map((p, i): Bloco => ({ tipo: 'paragrafo', texto: `${i + 1}. ${p}` })),
    {
      tipo: 'paragrafo',
      texto:
        'Requer que a resposta seja divulgada em sítio eletrônico oficial no prazo de até 3 (três) dias úteis, limitado ao último dia útil anterior à data da abertura do certame, nos termos do parágrafo único do art. 164 da Lei nº 14.133/2021.',
    },
    { tipo: 'paragrafo', texto: 'Nestes termos, pede deferimento.' },
    { tipo: 'assinatura', local: localEData(proponente, quando) },
  ]
  return { documento: { tipo: 'esclarecimento', titulo: 'Pedido de esclarecimento', blocos }, pendencias }
}
