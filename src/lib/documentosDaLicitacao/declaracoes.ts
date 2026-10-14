import { localEData } from './proponente'
import type { Bloco, Certame, DocumentoDaLicitacao, Proponente } from './modelo'

export interface ModeloDeDeclaracao {
  id: string
  titulo: string
  fundamento: string
  texto: (p: Proponente, c: Certame) => string
}

const qualificacao = (p: Proponente, c: Certame) =>
  `${p.razaoSocial}, inscrita no ${p.documento}, com sede em ${p.endereco}, por intermédio de seu representante legal, ${p.responsavel}, portador(a) do CPF nº ${p.responsavelCpf}, para fins de participação no(a) ${c.modalidade} nº ${c.numero}, promovido(a) por ${c.orgao}`

export const MODELOS_DE_DECLARACAO: ModeloDeDeclaracao[] = [
  {
    id: 'requisitos-habilitacao',
    titulo: 'Declaração de cumprimento dos requisitos de habilitação',
    fundamento: 'Lei nº 14.133/2021, art. 63, I',
    texto: (p, c) =>
      `${qualificacao(p, c)}, DECLARA, sob as penas da lei, que cumpre plenamente os requisitos de habilitação exigidos no edital e que as declarações prestadas são verdadeiras.`,
  },
  {
    id: 'fato-impeditivo',
    titulo: 'Declaração de inexistência de fato impeditivo',
    fundamento: 'Lei nº 14.133/2021, arts. 14 e 156',
    texto: (p, c) =>
      `${qualificacao(p, c)}, DECLARA, sob as penas da lei, que até a presente data inexistem fatos impeditivos para sua habilitação no presente processo, que não foi declarada inidônea nem está impedida de licitar ou contratar com a Administração Pública, ciente da obrigatoriedade de declarar ocorrências posteriores.`,
  },
  {
    id: 'menor',
    titulo: 'Declaração de não emprego de menor',
    fundamento: 'Constituição Federal, art. 7º, XXXIII; Lei nº 14.133/2021, art. 68, VI',
    texto: (p, c) =>
      `${qualificacao(p, c)}, DECLARA que não emprega menor de 18 (dezoito) anos em trabalho noturno, perigoso ou insalubre e não emprega menor de 16 (dezesseis) anos, salvo a partir de 14 (quatorze) anos na condição de aprendiz.`,
  },
  {
    id: 'reserva-pcd',
    titulo: 'Declaração de reserva de cargos para pessoa com deficiência e reabilitado',
    fundamento: 'Lei nº 14.133/2021, art. 63, IV; Lei nº 8.213/1991, art. 93',
    texto: (p, c) =>
      `${qualificacao(p, c)}, DECLARA que cumpre as exigências de reserva de cargos para pessoa com deficiência e para reabilitado da Previdência Social previstas em lei e em outras normas específicas.`,
  },
  {
    id: 'normas-trabalhistas',
    titulo: 'Declaração de cumprimento das obrigações trabalhistas',
    fundamento: 'Lei nº 14.133/2021, art. 63, §1º',
    texto: (p, c) =>
      `${qualificacao(p, c)}, DECLARA que sua proposta econômica compreende a integralidade dos custos para atendimento dos direitos trabalhistas assegurados na Constituição Federal, nas leis trabalhistas, nas normas infralegais, nas convenções coletivas de trabalho e nos termos de ajustamento de conduta vigentes na data de entrega das propostas.`,
  },
  {
    id: 'proposta-independente',
    titulo: 'Declaração de elaboração independente de proposta',
    fundamento: 'Lei nº 14.133/2021, art. 5º (princípios da competitividade e da moralidade)',
    texto: (p, c) =>
      `${qualificacao(p, c)}, DECLARA que a proposta apresentada foi elaborada de maneira independente, que seu conteúdo não foi, no todo ou em parte, informado, discutido ou recebido de qualquer outro participante potencial ou de fato do certame, e que não tentou, por qualquer meio, influenciar a decisão de outro participante quanto a participar ou não do certame.`,
  },
  {
    id: 'me-epp',
    titulo: 'Declaração de enquadramento como microempresa ou empresa de pequeno porte',
    fundamento: 'Lei Complementar nº 123/2006, arts. 3º e 42 a 49; Lei nº 14.133/2021, art. 4º',
    texto: (p, c) =>
      `${qualificacao(p, c)}, DECLARA, sob as penas da lei, que se enquadra como microempresa ou empresa de pequeno porte, nos termos do art. 3º da Lei Complementar nº 123/2006, que não está incluída nas vedações do §4º do mesmo artigo e que está apta a usufruir do tratamento favorecido estabelecido nos arts. 42 a 49 daquela lei.`,
  },
  {
    id: 'sem-vinculo',
    titulo: 'Declaração de inexistência de vínculo com agente público',
    fundamento: 'Lei nº 14.133/2021, art. 14, IV',
    texto: (p, c) =>
      `${qualificacao(p, c)}, DECLARA que não possui, entre seus sócios, administradores ou responsáveis técnicos, pessoa que mantenha vínculo de natureza técnica, comercial, econômica, financeira, trabalhista ou civil com dirigente do órgão ou entidade contratante ou com agente público que desempenhe função na licitação ou atue na fiscalização ou na gestão do contrato, nem que seja cônjuge, companheiro ou parente em linha reta, colateral ou por afinidade, até o terceiro grau, de tais pessoas.`,
  },
]

export const IDS_DE_DECLARACAO = MODELOS_DE_DECLARACAO.map((m) => m.id)

export function declaracoes(proponente: Proponente, certame: Certame, selecionadas: string[], quando: Date = new Date()): { documento: DocumentoDaLicitacao; pendencias: string[] } {
  const escolhidas = MODELOS_DE_DECLARACAO.filter((m) => selecionadas.includes(m.id))
  const blocos: Bloco[] = []
  escolhidas.forEach((m, i) => {
    if (i > 0) blocos.push({ tipo: 'quebra' })
    blocos.push({ tipo: 'titulo', texto: m.titulo.toUpperCase() })
    blocos.push({ tipo: 'paragrafo', texto: m.texto(proponente, certame) })
    blocos.push({ tipo: 'paragrafo', texto: `Fundamento: ${m.fundamento}.` })
    blocos.push({ tipo: 'assinatura', local: localEData(proponente, quando) })
  })
  return { documento: { tipo: 'declaracoes', titulo: escolhidas.length === 1 ? escolhidas[0].titulo : 'Declarações', blocos }, pendencias: [...proponente.pendencias] }
}
