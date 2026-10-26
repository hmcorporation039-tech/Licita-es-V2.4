// ============================================================
// services/sugestaoDeTermo.ts — "Você quis dizer esquadrias?" quando a busca
// não acha nada. A causa mais comum de zero resultado é a palavra digitada
// diferente de como ela aparece nos editais ("esquadrilhas" em vez de
// "esquadrias"). Aqui achamos a palavra real mais parecida do vocabulário das
// licitações abertas, por trigramas (índice GIN em objeto_norm). É só sugestão:
// não troca a busca e não garante que a sugerida vá casar.
//
// O plural/singular já é tratado em matching.ts (variacoesDaPalavra), então uma
// palavra correta mas no singular/plural não precisa de sugestão — por isso o
// termo que já aparece literalmente no corpus (com as variações) não gera nada.
// ============================================================

import { Prisma } from '@prisma/client'
import { prisma } from './tenderService'
import { normalize } from '../lib/geoService'
import { regexDaPalavraNoPostgres, temPalavraSignificativa, variacoesDaPalavra } from '../lib/matching'

// Abaixo disto a palavra é parecida demais com qualquer coisa para sugerir. É só
// sugestão (a pessoa confere), então pode ser folgado, como na base de preços.
export const SIMILARIDADE_MINIMA_DA_SUGESTAO = 0.45
const TAM_MINIMO = 3
const TAM_MAXIMO = 40
const MAX_CANDIDATAS = 200
const MAX_TERMOS = 10
const JANELA_DO_VOCABULARIO_DIAS = 120

export interface SugestaoDeTermo {
  original: string
  sugerido: string
  similaridade: number
}

// Licitação que serve de vocabulário: aberta na prática (situação aberta, não
// homologada, não duplicada, não oculta, prazo não vencido) e recente, só para
// limitar o corpus de onde saem as palavras. Não é a regra fina de
// whereLicitacaoAberta — é de propósito simples e barata de rodar no banco.
const VOCABULARIO_ABERTO = Prisma.sql`
  t."situacao" = 'ABERTA'
  AND t."valor_homologado" IS NULL
  AND t."duplicata_de" IS NULL
  AND t."motivo_oculta" IS NULL
  AND (t."encerramento_at" IS NULL OR t."encerramento_at" >= now())
  AND coalesce(t."publicado_at", t."created_at") >= now() - ${Prisma.raw(`INTERVAL '${JANELA_DO_VOCABULARIO_DIAS} days'`)}
`

export function termosParaSugerir(termos: string[]): string[] {
  const vistos = new Set<string>()
  for (const bruto of termos) {
    const termo = normalize(bruto).trim()
    if (termo.length < TAM_MINIMO || termo.length > TAM_MAXIMO) continue
    // Código (CATMAT/CATSER, "cat6") e termo composto ("material de limpeza")
    // ficam de fora: a sugestão é de uma única palavra.
    if (/\d/.test(termo) || termo.includes(' ')) continue
    if (!temPalavraSignificativa(termo)) continue
    vistos.add(termo)
  }
  return [...vistos].slice(0, MAX_TERMOS)
}

async function sugerirParaUmTermo(termo: string): Promise<SugestaoDeTermo | null> {
  const regexReal = regexDaPalavraNoPostgres(termo)
  const variacoes = new Set(variacoesDaPalavra(termo))
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('pg_trgm.word_similarity_threshold', ${String(SIMILARIDADE_MINIMA_DA_SUGESTAO)}, true)`

    // Termo já aparece como palavra inteira (com plural) num edital aberto? Então
    // não é erro de digitação — o zero resultado veio de outro filtro (UF,
    // modalidade…), e sugerir outra palavra só confundiria.
    if (regexReal) {
      const real = await tx.$queryRaw<{ existe: number }[]>(
        Prisma.sql`SELECT 1 AS existe FROM "tenders" t WHERE ${VOCABULARIO_ABERTO} AND t."objeto_norm" ~ ${regexReal} LIMIT 1`
      )
      if (real.length > 0) return null
    }

    const linhas = await tx.$queryRaw<{ palavra: string; sim: number | string }[]>(Prisma.sql`
      WITH candidatas AS (
        SELECT t."objeto_norm" AS objeto
        FROM "tenders" t
        WHERE ${VOCABULARIO_ABERTO} AND ${termo} <% t."objeto_norm"
        LIMIT ${MAX_CANDIDATAS}
      )
      SELECT palavra, max(similarity(palavra, ${termo})) AS sim
      FROM candidatas, unnest(regexp_split_to_array(objeto, '[^a-z0-9]+')) AS palavra
      WHERE char_length(palavra) BETWEEN ${TAM_MINIMO} AND ${TAM_MAXIMO}
        AND similarity(palavra, ${termo}) >= ${SIMILARIDADE_MINIMA_DA_SUGESTAO}
      GROUP BY palavra
      ORDER BY sim DESC, palavra
      LIMIT 5
    `)

    for (const linha of linhas) {
      // A própria palavra (ou seu singular/plural) não é sugestão.
      if (!variacoes.has(linha.palavra)) {
        return { original: termo, sugerido: linha.palavra, similaridade: Math.round(Number(linha.sim) * 100) / 100 }
      }
    }
    return null
  })
}

// Recebe os termos que não acharam nada e devolve a melhor sugestão (a palavra
// mais parecida, de maior similaridade), ou null se nenhum termo tiver uma.
export async function sugerirTermoParecido(termos: string[]): Promise<SugestaoDeTermo | null> {
  let melhor: SugestaoDeTermo | null = null
  for (const termo of termosParaSugerir(termos)) {
    const sugestao = await sugerirParaUmTermo(termo)
    if (sugestao && (melhor === null || sugestao.similaridade > melhor.similaridade)) melhor = sugestao
  }
  return melhor
}
