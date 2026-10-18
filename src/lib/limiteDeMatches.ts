export const MAX_MATCHES_POR_ITEM = 2_000

export interface CandidatoComAderencia {
  tenderId: string
  score: number
  encerramentoAt: Date | null
}

function prazoParaOrdenar(encerramentoAt: Date | null): number {
  return encerramentoAt ? encerramentoAt.getTime() : Number.POSITIVE_INFINITY
}

function compararAderenciaEPrazo(a: CandidatoComAderencia, b: CandidatoComAderencia): number {
  if (a.score !== b.score) return b.score - a.score
  const prazoA = prazoParaOrdenar(a.encerramentoAt)
  const prazoB = prazoParaOrdenar(b.encerramentoAt)
  if (prazoA !== prazoB) return prazoA < prazoB ? -1 : 1
  return 0
}

function compararPorTenderId(a: CandidatoComAderencia, b: CandidatoComAderencia): number {
  if (a.tenderId === b.tenderId) return 0
  return a.tenderId < b.tenderId ? -1 : 1
}

export function compararPorAderenciaEPrazo(a: CandidatoComAderencia, b: CandidatoComAderencia): number {
  return compararAderenciaEPrazo(a, b) || compararPorTenderId(a, b)
}

export interface SelecaoDentroDoLimite<T> {
  selecionados: T[]
  limitado: boolean
}

export function selecionarDentroDoLimite<T extends CandidatoComAderencia>(
  novos: T[],
  abertosJaGravados: number,
  limite: number = MAX_MATCHES_POR_ITEM
): SelecaoDentroDoLimite<T> {
  const vagas = Math.max(0, limite - abertosJaGravados)
  const ordenados = [...novos].sort(compararPorAderenciaEPrazo)
  return { selecionados: ordenados.slice(0, vagas), limitado: abertosJaGravados + novos.length > limite }
}

export interface MatchAbertoNoLimite extends CandidatoComAderencia {
  id: string
  protegido: boolean
}

export interface SubstituicaoNoLimite<T> {
  entram: T[]
  saem: MatchAbertoNoLimite[]
  limitado: boolean
}

type NaDisputa<T> = { candidato: CandidatoComAderencia; novo: T; aberto?: undefined } | { candidato: CandidatoComAderencia; novo?: undefined; aberto: MatchAbertoNoLimite }

function compararNaDisputa<T>(a: NaDisputa<T>, b: NaDisputa<T>): number {
  const porAderencia = compararAderenciaEPrazo(a.candidato, b.candidato)
  if (porAderencia !== 0) return porAderencia
  if (Boolean(a.aberto) !== Boolean(b.aberto)) return a.aberto ? -1 : 1
  return compararPorTenderId(a.candidato, b.candidato)
}

export function substituirMenosAderentes<T extends CandidatoComAderencia>(
  novos: T[],
  abertos: MatchAbertoNoLimite[],
  limite: number = MAX_MATCHES_POR_ITEM
): SubstituicaoNoLimite<T> {
  const vagas = Math.max(0, limite - abertos.filter((m) => m.protegido).length)
  const disputa: NaDisputa<T>[] = [
    ...abertos.filter((m) => !m.protegido).map((aberto) => ({ candidato: aberto, aberto })),
    ...novos.map((novo) => ({ candidato: novo, novo })),
  ].sort(compararNaDisputa)
  return {
    entram: disputa.slice(0, vagas).flatMap((d) => (d.novo ? [d.novo] : [])),
    saem: disputa.slice(vagas).flatMap((d) => (d.aberto ? [d.aberto] : [])),
    limitado: disputa.length > vagas,
  }
}

export function avisoDoLimite(limite: number = MAX_MATCHES_POR_ITEM): string {
  return `Palavra muito genérica: mostrando as ${limite.toLocaleString('pt-BR')} mais aderentes; novas licitações substituem as menos aderentes. Refine com estados, valor ou palavras de exclusão.`
}
