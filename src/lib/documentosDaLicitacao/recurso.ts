// ============================================================
// documentosDaLicitacao/recurso.ts — Minuta de recurso administrativo contra a
// habilitação de um concorrente (Estrategista de Habilitação, fatia 2). Monta o
// documento a partir dos achados da análise do concorrente. É um RASCUNHO para
// revisão do advogado; o aviso fica na tela, não no corpo do documento.
// ============================================================

import type { AchadoDeHabilitacao } from '../../services/llm/habilitacaoConcorrente'
import { localEData } from './proponente'
import { marcador, type Bloco, type Certame, type DocumentoDaLicitacao, type Proponente } from './modelo'

// Só os achados que sustentam o recurso: documento que não atende ou exigência não comprovada.
export type AchadoDoRecurso = Pick<AchadoDeHabilitacao, 'exigencia' | 'categoria' | 'situacao' | 'explicacao' | 'trecho' | 'gravidade'>

const FUNDAMENTO_POR_CATEGORIA: Record<string, string> = {
  fiscal: 'a regularidade fiscal e trabalhista exigida pelo art. 68 da Lei nº 14.133/2021',
  juridica: 'a habilitação jurídica exigida pelo art. 66 da Lei nº 14.133/2021',
  economica: 'a qualificação econômico-financeira exigida pelo art. 69 da Lei nº 14.133/2021',
  tecnica: 'a qualificação técnica exigida pelo art. 67 da Lei nº 14.133/2021',
  proposta: 'os requisitos da proposta previstos no edital',
  outra: 'os requisitos de habilitação previstos nos arts. 62 a 70 da Lei nº 14.133/2021',
}

const PESO_GRAVIDADE: Record<AchadoDoRecurso['gravidade'], number> = { alta: 0, media: 1, baixa: 2 }

const enderecamento = (c: Certame) => `Ao(À) Agente de Contratação / Pregoeiro(a) do(a) ${c.orgao}`
const referencia = (c: Certame) => `Referência: ${c.referencia}${c.sessao ? `, cuja sessão pública ocorreu em ${c.sessao}` : ''}.`

function fundamento(a: AchadoDoRecurso): string {
  return FUNDAMENTO_POR_CATEGORIA[a.categoria] ?? FUNDAMENTO_POR_CATEGORIA.outra
}

// Monta a minuta de recurso. `nomeConcorrente` identifica a recorrida; achados
// que não sustentam recurso (atende/indefinido) devem ser filtrados pela rota.
export function recursoDeHabilitacao(
  proponente: Proponente,
  certame: Certame,
  nomeConcorrente: string | null,
  achados: AchadoDoRecurso[],
  quando: Date = new Date(),
): { documento: DocumentoDaLicitacao; pendencias: string[] } {
  const pendencias = [...proponente.pendencias]
  const recorrida = (nomeConcorrente ?? '').trim() || marcador('nome da empresa concorrente')
  if (!(nomeConcorrente ?? '').trim()) pendencias.push('nome da empresa concorrente')

  const relevantes = [...achados]
    .filter((a) => a.situacao === 'nao_atende' || a.situacao === 'nao_comprovado')
    .sort((x, y) => PESO_GRAVIDADE[x.gravidade] - PESO_GRAVIDADE[y.gravidade])
  if (relevantes.length === 0) pendencias.push('nenhum achado sustenta o recurso — reveja a análise do concorrente')

  const blocos: Bloco[] = [
    { tipo: 'titulo', texto: 'RAZÕES DE RECURSO CONTRA A HABILITAÇÃO' },
    { tipo: 'paragrafo', texto: enderecamento(certame) },
    { tipo: 'paragrafo', texto: referencia(certame) },
    { tipo: 'paragrafo', texto: `Objeto: ${certame.objeto}` },
    {
      tipo: 'paragrafo',
      texto: `${proponente.qualificacao}, licitante no certame em referência, vem, respeitosamente, com fundamento no art. 165 da Lei nº 14.133/2021, interpor RECURSO ADMINISTRATIVO contra a habilitação da empresa ${recorrida}, pelos fatos e fundamentos a seguir.`,
    },
    { tipo: 'titulo', texto: 'I. DA TEMPESTIVIDADE' },
    {
      tipo: 'paragrafo',
      texto: `O art. 165 da Lei nº 14.133/2021 assegura o prazo de 3 (três) dias úteis, contados da intimação ou da divulgação da ata, para a interposição de recurso. O presente recurso é apresentado dentro desse prazo, que se encerra em ${marcador('data limite do recurso')}, sendo, portanto, tempestivo.`,
    },
    { tipo: 'titulo', texto: 'II. DOS FATOS E FUNDAMENTOS' },
    {
      tipo: 'paragrafo',
      texto: `A empresa ${recorrida} foi habilitada no certame, embora a documentação por ela apresentada não atenda às exigências de habilitação do edital e da Lei nº 14.133/2021, conforme se demonstra.`,
    },
  ]

  if (relevantes.length === 0) {
    blocos.push({ tipo: 'paragrafo', texto: `II.1. ${marcador('descreva o motivo da inabilitação')}` })
  }
  relevantes.forEach((a, i) => {
    blocos.push(
      { tipo: 'paragrafo', texto: `II.${i + 1}. ${a.exigencia}` },
      {
        tipo: 'paragrafo',
        texto:
          a.situacao === 'nao_atende'
            ? `A documentação apresentada pela recorrida não atende a esta exigência. ${a.explicacao}`.trim()
            : `A recorrida não comprovou o atendimento a esta exigência. ${a.explicacao}`.trim(),
      },
    )
    if (a.trecho.trim()) blocos.push({ tipo: 'paragrafo', texto: `O documento apresentado registra: "${a.trecho.trim()}".` })
    blocos.push({
      tipo: 'paragrafo',
      texto: `A exigência diz respeito a ${fundamento(a)}, cujo descumprimento impõe a inabilitação da licitante, nos termos do art. 63, caput e §1º, c/c o art. 59, II, da Lei nº 14.133/2021.`,
    })
  })
  blocos.push({
    tipo: 'paragrafo',
    texto:
      'Manter a habilitação de licitante que não comprovou os requisitos legais viola os princípios da legalidade, da isonomia e da vinculação ao edital (arts. 5º e 11 da Lei nº 14.133/2021) e o dever de seleção da proposta apta e regular.',
  })

  blocos.push(
    { tipo: 'titulo', texto: 'III. DOS PEDIDOS' },
    { tipo: 'paragrafo', texto: 'Diante do exposto, requer:' },
    { tipo: 'paragrafo', texto: 'a) o recebimento e o processamento do presente recurso, por tempestivo;' },
    { tipo: 'paragrafo', texto: `b) no mérito, a reforma da decisão para INABILITAR a empresa ${recorrida}, afastando-a do certame;` },
    { tipo: 'paragrafo', texto: `c) caso a recorrida já tenha sido declarada vencedora, a sua desclassificação e a convocação da licitante subsequente, observada a ordem de classificação;` },
    { tipo: 'paragrafo', texto: 'd) subsidiariamente, caso não seja o pedido reconsiderado, o encaminhamento do recurso à autoridade superior para decisão, nos termos do art. 165, §1º, da Lei nº 14.133/2021.' },
    { tipo: 'paragrafo', texto: 'Nestes termos, pede deferimento.' },
    { tipo: 'assinatura', local: localEData(proponente, quando) },
  )

  return { documento: { tipo: 'recurso', titulo: 'Recurso contra a habilitação', blocos }, pendencias }
}
