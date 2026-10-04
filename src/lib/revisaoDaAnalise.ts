// ============================================================
// lib/revisaoDaAnalise.ts — O que o revisor MUDOU, calculado por código.
//
// Não se confia na lista de alterações que o próprio revisor declara: o sistema
// compara o rascunho do analista com a versão final, campo a campo, e usa as
// justificativas do revisor apenas para explicar cada mudança. Assim, o que
// aparece como "alterado" é exatamente o que mudou, nem mais nem menos.
// ============================================================

import { chaveDaExigencia, simplificar } from './matrizExigencias'
import type { EditalAnalysisResult } from '../services/llm/types'
import type { JustificativaDeRevisao } from '../services/llm/revisao'

export interface AlteracaoDaRevisao {
  campo: string
  tipo: 'alterado' | 'adicionado' | 'removido'
  antes: string | null
  depois: string | null
  motivo: string | null
}

const CAMPOS_DE_TEXTO = [
  'resumo',
  'valorEstimado',
  'dataSessao',
  'registroPrecos',
  'prazoEntrega',
  'local',
  'pagamento',
  'criterioJulgamento',
  'adesaoAta',
  'prazoImpugnacao',
  'prazoEsclarecimento',
  'garantiaProposta',
  'garantiaContratual',
  'patrimonioLiquidoMinimo',
  'visitaTecnica',
] as const

const CAMPOS_DE_LISTA = ['exigenciasTecnicas', 'documentosExigidos'] as const

const LIMITE_POR_CAMPO = 60

function igual(a: string, b: string): boolean {
  return a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim()
}

function motivoDe(justificativas: JustificativaDeRevisao[], campo: string): string | null {
  const alvo = campo.toLowerCase()
  return justificativas.find((j) => j.campo.toLowerCase() === alvo)?.motivo ?? null
}

export function compararAnalises(
  rascunho: EditalAnalysisResult,
  final: EditalAnalysisResult,
  justificativas: JustificativaDeRevisao[] = []
): AlteracaoDaRevisao[] {
  const alteracoes: AlteracaoDaRevisao[] = []

  for (const campo of CAMPOS_DE_TEXTO) {
    const antes = rascunho[campo] ?? ''
    const depois = final[campo] ?? ''
    if (!igual(antes, depois)) {
      alteracoes.push({ campo, tipo: 'alterado', antes, depois, motivo: motivoDe(justificativas, campo) })
    }
  }

  for (const campo of CAMPOS_DE_LISTA) {
    const a = rascunho[campo] ?? []
    const f = final[campo] ?? []
    const chavesA = new Set(a.map(simplificar))
    const chavesF = new Set(f.map(simplificar))
    const motivo = motivoDe(justificativas, campo)
    for (const item of a) if (!chavesF.has(simplificar(item))) alteracoes.push({ campo, tipo: 'removido', antes: item, depois: null, motivo })
    for (const item of f) if (!chavesA.has(simplificar(item))) alteracoes.push({ campo, tipo: 'adicionado', antes: null, depois: item, motivo })
  }

  // Riscos: pelo título.
  {
    const motivo = motivoDe(justificativas, 'riscos')
    const a = new Map(rascunho.riscos.map((r) => [simplificar(r.titulo), r]))
    const f = new Map(final.riscos.map((r) => [simplificar(r.titulo), r]))
    for (const [k, r] of a) {
      const nova = f.get(k)
      if (!nova) alteracoes.push({ campo: 'riscos', tipo: 'removido', antes: `${r.titulo} (${r.severidade})`, depois: null, motivo })
      else if (nova.severidade !== r.severidade || !igual(nova.descricao, r.descricao)) {
        alteracoes.push({
          campo: 'riscos',
          tipo: 'alterado',
          antes: `${r.titulo} (${r.severidade})`,
          depois: `${nova.titulo} (${nova.severidade})`,
          motivo,
        })
      }
    }
    for (const [k, r] of f) if (!a.has(k)) alteracoes.push({ campo: 'riscos', tipo: 'adicionado', antes: null, depois: `${r.titulo} (${r.severidade})`, motivo })
  }

  // Matriz de exigências: pela chave do texto literal.
  {
    const motivo = motivoDe(justificativas, 'matrizExigencias')
    const a = new Map(rascunho.matrizExigencias.map((e) => [chaveDaExigencia(e.texto), e]))
    const f = new Map(final.matrizExigencias.map((e) => [chaveDaExigencia(e.texto), e]))
    for (const [k, e] of a) {
      const nova = f.get(k)
      if (!nova) alteracoes.push({ campo: 'matrizExigencias', tipo: 'removido', antes: e.texto, depois: null, motivo })
      else {
        const mudou: string[] = []
        if (nova.pagina !== e.pagina) mudou.push(`página ${e.pagina || '—'} → ${nova.pagina || '—'}`)
        if (nova.item !== e.item) mudou.push(`item ${e.item || '—'} → ${nova.item || '—'}`)
        if (nova.categoria !== e.categoria) mudou.push(`categoria ${e.categoria} → ${nova.categoria}`)
        if (nova.responsavel !== e.responsavel) mudou.push(`responsável ${e.responsavel} → ${nova.responsavel}`)
        if (mudou.length > 0) alteracoes.push({ campo: 'matrizExigencias', tipo: 'alterado', antes: e.texto, depois: mudou.join('; '), motivo })
      }
    }
    for (const [k, e] of f) if (!a.has(k)) alteracoes.push({ campo: 'matrizExigencias', tipo: 'adicionado', antes: null, depois: e.texto, motivo })
  }

  // Teto por campo: a contagem total continua em resumoDasAlteracoes; o detalhe é limitado.
  const contagem = new Map<string, number>()
  return alteracoes.filter((al) => {
    const n = (contagem.get(al.campo) ?? 0) + 1
    contagem.set(al.campo, n)
    return n <= LIMITE_POR_CAMPO
  })
}

export function resumoDasAlteracoes(alteracoes: AlteracaoDaRevisao[]): { total: number; porCampo: Record<string, number> } {
  const porCampo: Record<string, number> = {}
  for (const a of alteracoes) porCampo[a.campo] = (porCampo[a.campo] ?? 0) + 1
  return { total: alteracoes.length, porCampo }
}
