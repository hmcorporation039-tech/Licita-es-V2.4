// ============================================================
// services/analiseEmDupla.ts — Orquestra a análise de edital em dupla:
// o ANALISTA (Gemini) lê o edital; o REVISOR (Claude) confere a análise contra
// o mesmo edital e entrega a versão final. Sem I/O próprio (analistas e
// revisores entram por parâmetro), então é testável com modelos de mentira.
//
// Degradação deliberada:
//  - Revisor falhou (erro, recusa, resposta cortada): vale a análise do analista,
//    marcada como NÃO REVISADA, e os tokens gastos entram na medição.
//  - Analista falhou: a análise falha (não há o que revisar).
//  - Só uma chave de IA configurada: análise simples, sem revisão, dita como tal.
// ============================================================

import { compararAnalises, AlteracaoDaRevisao } from '../lib/revisaoDaAnalise'
import { DocumentoParaVerificar, ExigenciaVerificada, verificarExigencias } from '../lib/matrizExigencias'
import type { EditalAnalysisResult, EditalAnalyzer, EditalDocumento, UsoDeIa } from './llm/types'
import { ErroComUso } from './llm/types'
import type { EditalReviewer } from './llm/revisao'

export type ProvedorDeIa = 'gemini' | 'claude'
export type ModoDeIa = 'dupla' | 'gemini' | 'claude'

export interface ConfiguracaoDeIa {
  modo: ModoDeIa | null
  analista: ProvedorDeIa | null
  revisor: ProvedorDeIa | null
  avisos: string[]
}

const temChave = (v: string | undefined) => !!v && v.trim().length > 0

// Decide como analisar, a partir das chaves disponíveis e de AI_PIPELINE
// ('dupla' | 'gemini' | 'claude'). Sem AI_PIPELINE: ambas as chaves = dupla; uma só = ela;
// nenhuma = AI_PROVIDER (legado). Pedir 'dupla' sem as duas chaves degrada com aviso.
export function configuracaoDeIa(env: NodeJS.ProcessEnv = process.env): ConfiguracaoDeIa {
  const gemini = temChave(env.GEMINI_API_KEY)
  const claude = temChave(env.ANTHROPIC_API_KEY)
  const pedido = (env.AI_PIPELINE ?? '').trim().toLowerCase()
  const avisos: string[] = []

  if (pedido && !['dupla', 'gemini', 'claude'].includes(pedido)) {
    avisos.push(`AI_PIPELINE inválido ("${pedido}"): use dupla, gemini ou claude.`)
  }
  const modoPedido = ['dupla', 'gemini', 'claude'].includes(pedido) ? (pedido as ModoDeIa) : null

  const dupla = (): ConfiguracaoDeIa => ({ modo: 'dupla', analista: 'gemini', revisor: 'claude', avisos })
  const simples = (p: ProvedorDeIa): ConfiguracaoDeIa => ({ modo: p, analista: p, revisor: null, avisos })

  if (modoPedido === 'dupla') {
    if (gemini && claude) return dupla()
    if (gemini) return { ...simples('gemini'), avisos: [...avisos, 'AI_PIPELINE=dupla, mas falta ANTHROPIC_API_KEY: análise sem revisão.'] }
    if (claude) return { ...simples('claude'), avisos: [...avisos, 'AI_PIPELINE=dupla, mas falta GEMINI_API_KEY: análise só com a Claude, sem revisão.'] }
    return { modo: null, analista: null, revisor: null, avisos: [...avisos, 'Nenhuma chave de IA configurada (GEMINI_API_KEY, ANTHROPIC_API_KEY).'] }
  }
  if (modoPedido === 'gemini') {
    return gemini ? simples('gemini') : { modo: null, analista: null, revisor: null, avisos: [...avisos, 'AI_PIPELINE=gemini, mas falta GEMINI_API_KEY.'] }
  }
  if (modoPedido === 'claude') {
    return claude ? simples('claude') : { modo: null, analista: null, revisor: null, avisos: [...avisos, 'AI_PIPELINE=claude, mas falta ANTHROPIC_API_KEY.'] }
  }

  if (gemini && claude) return dupla()
  if (gemini) return simples('gemini')
  if (claude) return simples('claude')
  return { modo: null, analista: null, revisor: null, avisos: [...avisos, 'Nenhuma chave de IA configurada (GEMINI_API_KEY, ANTHROPIC_API_KEY).'] }
}

export interface EtapaDeUso {
  etapa: 'analise' | 'revisao'
  uso: UsoDeIa
  status: 'OK' | 'ERRO'
  durationMs: number
}

export interface RevisaoRegistrada {
  status: 'OK' | 'FALHOU' | 'NAO_EXECUTADA'
  veredito: 'aprovada' | 'corrigida' | 'reprovada' | null
  resumo: string | null
  alteracoes: AlteracaoDaRevisao[]
  totalDeAlteracoes: number
  analista: { provider: string; model: string } | null
  revisor: { provider: string; model: string } | null
  // Por que não houve revisão (status FALHOU ou NAO_EXECUTADA).
  motivo: string | null
  // Mensagem técnica do erro (só o administrador vê; nunca vai ao usuário).
  detalheTecnico: string | null
}

export interface ResultadoDoPipeline {
  // Versão FINAL: a revisada, ou o rascunho do analista quando não houve revisão.
  resultado: Omit<EditalAnalysisResult, 'matrizExigencias'> & { matrizExigencias: ExigenciaVerificada[] }
  // Saída do analista antes da revisão (só quando houve revisão); serve para auditar.
  rascunho: EditalAnalysisResult | null
  revisao: RevisaoRegistrada
  pipeline: ModoDeIa
  usos: EtapaDeUso[]
}

function paraVerificar(documentos: EditalDocumento[]): DocumentoParaVerificar[] {
  return documentos.map((d) => ({ nome: d.nome, texto: d.tipo === 'texto' ? d.texto : null }))
}

function mensagemDoErro(err: unknown): string {
  const causa = err instanceof ErroComUso ? err.causa : err
  return causa instanceof Error ? causa.message : String(causa)
}

export async function executarPipeline(args: {
  objeto: string
  documentos: EditalDocumento[]
  analista: EditalAnalyzer
  revisor: EditalReviewer | null
  agora?: () => number
}): Promise<ResultadoDoPipeline> {
  const agora = args.agora ?? Date.now
  const usos: EtapaDeUso[] = []

  // 1) Analista. Se falhar, o erro sobe (a análise inteira falha); o chamador
  //    registra os tokens gastos quando o erro é um ErroComUso.
  const t0 = agora()
  const analise = await args.analista(args.objeto, args.documentos)
  usos.push({ etapa: 'analise', uso: analise.uso, status: 'OK', durationMs: agora() - t0 })

  const analistaInfo = { provider: analise.uso.provider, model: analise.uso.model }
  const docs = paraVerificar(args.documentos)

  const finalizar = (
    resultado: EditalAnalysisResult,
    rascunho: EditalAnalysisResult | null,
    revisao: RevisaoRegistrada,
    pipeline: ModoDeIa
  ): ResultadoDoPipeline => ({
    // A conferência de literalidade roda sempre, sobre a versão FINAL.
    resultado: { ...resultado, matrizExigencias: verificarExigencias(resultado.matrizExigencias, docs) },
    rascunho,
    revisao,
    pipeline,
    usos,
  })

  if (!args.revisor) {
    return finalizar(
      analise.resultado,
      null,
      {
        status: 'NAO_EXECUTADA',
        veredito: null,
        resumo: null,
        alteracoes: [],
        totalDeAlteracoes: 0,
        analista: analistaInfo,
        revisor: null,
        motivo: 'Análise sem revisão: só um provedor de IA está configurado.',
        detalheTecnico: null,
      },
      analise.uso.provider === 'claude' ? 'claude' : 'gemini'
    )
  }

  // 2) Revisor. Qualquer falha mantém o rascunho do analista, sinalizado como não revisado.
  const t1 = agora()
  try {
    const rev = await args.revisor(args.objeto, args.documentos, analise.resultado)
    usos.push({ etapa: 'revisao', uso: rev.uso, status: 'OK', durationMs: agora() - t1 })
    const alteracoes = compararAnalises(analise.resultado, rev.resultado, rev.relatorio.justificativas)
    return finalizar(
      rev.resultado,
      analise.resultado,
      {
        status: 'OK',
        veredito: rev.relatorio.veredito,
        resumo: rev.relatorio.resumo,
        alteracoes,
        totalDeAlteracoes: alteracoes.length,
        analista: analistaInfo,
        revisor: { provider: rev.uso.provider, model: rev.uso.model },
        motivo: null,
        detalheTecnico: null,
      },
      'dupla'
    )
  } catch (err) {
    if (err instanceof ErroComUso) {
      usos.push({ etapa: 'revisao', uso: err.uso, status: 'ERRO', durationMs: agora() - t1 })
    }
    return finalizar(
      analise.resultado,
      null,
      {
        status: 'FALHOU',
        veredito: null,
        resumo: null,
        alteracoes: [],
        totalDeAlteracoes: 0,
        analista: analistaInfo,
        revisor: err instanceof ErroComUso ? { provider: err.uso.provider, model: err.uso.model } : null,
        motivo: 'A revisão não pôde ser concluída: esta análise NÃO foi revisada.',
        detalheTecnico: mensagemDoErro(err).slice(0, 500),
      },
      'dupla'
    )
  }
}
