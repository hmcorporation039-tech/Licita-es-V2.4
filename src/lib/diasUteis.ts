// ============================================================
// lib/diasUteis.ts — Cálculo de prazos em dias úteis (calendário de Brasília).
//
// Feriados considerados: os NACIONAIS por lei (confraternização, sexta-feira
// santa, Tiradentes, trabalho, independência, Aparecida, finados, república,
// consciência negra — nacional desde 2024 — e natal). Carnaval e Corpus
// Christi são ponto facultativo, não feriado: ficam de fora por padrão e
// podem ser incluídos por parâmetro. Feriados estaduais e municipais NÃO são
// conhecidos aqui: o resultado vale como estimativa e o prazo oficial é
// sempre o do edital. As regras legais citadas devem ser validadas por advogado.
// ============================================================

const MS_DIA = 24 * 60 * 60 * 1000

// Datas de calendário sem fuso: representadas como "AAAA-MM-DD".
export type Dia = string

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function toDia(d: Date): Dia {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

function fromDia(dia: Dia): Date {
  const [y, m, d] = dia.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

// Instante -> dia de calendário em Brasília (UTC-3).
export function diaEmBrasilia(instante: Date): Dia {
  return toDia(new Date(instante.getTime() - 3 * 60 * 60 * 1000))
}

export function somarDias(dia: Dia, n: number): Dia {
  return toDia(new Date(fromDia(dia).getTime() + n * MS_DIA))
}

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher).
function pascoa(ano: number): Dia {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const diaDoMes = ((h + l - 7 * m + 114) % 31) + 1
  return `${ano}-${pad(mes)}-${pad(diaDoMes)}`
}

export function feriadosNacionais(ano: number, opcoes: { pontosFacultativos?: boolean } = {}): Dia[] {
  const p = pascoa(ano)
  const lista: Dia[] = [
    `${ano}-01-01`,
    somarDias(p, -2), // sexta-feira santa
    `${ano}-04-21`,
    `${ano}-05-01`,
    `${ano}-09-07`,
    `${ano}-10-12`,
    `${ano}-11-02`,
    `${ano}-11-15`,
    `${ano}-12-25`,
  ]
  if (ano >= 2024) lista.push(`${ano}-11-20`)
  if (opcoes.pontosFacultativos) {
    lista.push(somarDias(p, -48), somarDias(p, -47), somarDias(p, 60)) // carnaval seg/ter e corpus christi
  }
  return lista
}

export function ehDiaUtil(dia: Dia, opcoes: { pontosFacultativos?: boolean } = {}): boolean {
  const dow = fromDia(dia).getUTCDay()
  if (dow === 0 || dow === 6) return false
  return !feriadosNacionais(Number(dia.slice(0, 4)), opcoes).includes(dia)
}

// Soma (ou subtrai, se n < 0) n dias úteis. Não conta o dia de partida.
export function somarDiasUteis(dia: Dia, n: number, opcoes: { pontosFacultativos?: boolean } = {}): Dia {
  const passo = n >= 0 ? 1 : -1
  let restante = Math.abs(n)
  let atual = dia
  while (restante > 0) {
    atual = somarDias(atual, passo)
    if (ehDiaUtil(atual, opcoes)) restante--
  }
  return atual
}

// Dias úteis entre duas datas, contando (de, até]. Negativo se `ate` é anterior a `de`.
export function diasUteisEntre(de: Dia, ate: Dia, opcoes: { pontosFacultativos?: boolean } = {}): number {
  if (de === ate) return 0
  const sinal = ate > de ? 1 : -1
  let atual = de
  let total = 0
  while (atual !== ate) {
    atual = somarDias(atual, sinal)
    if (ehDiaUtil(atual, opcoes)) total += sinal
  }
  return total
}

// Lei 14.133/2021, art. 164: pedido de esclarecimento e impugnação até 3 dias
// úteis antes da data de abertura da sessão. (Validar com advogado.)
export const DIAS_UTEIS_PRAZO_IMPUGNACAO = 3

export interface PrazosDaSessao {
  dataSessao: Dia
  limiteImpugnacao: Dia
  limiteEsclarecimento: Dia
  diasUteisAteSessao: number
  diasUteisAteLimite: number
  limitePassou: boolean
  sessaoPassou: boolean
}

export function calcularPrazosDaSessao(
  sessao: Date,
  agora: Date = new Date(),
  opcoes: { pontosFacultativos?: boolean } = {}
): PrazosDaSessao {
  const dataSessao = diaEmBrasilia(sessao)
  const hoje = diaEmBrasilia(agora)
  const limite = somarDiasUteis(dataSessao, -DIAS_UTEIS_PRAZO_IMPUGNACAO, opcoes)
  return {
    dataSessao,
    limiteImpugnacao: limite,
    limiteEsclarecimento: limite,
    diasUteisAteSessao: diasUteisEntre(hoje, dataSessao, opcoes),
    diasUteisAteLimite: diasUteisEntre(hoje, limite, opcoes),
    limitePassou: hoje > limite,
    sessaoPassou: hoje > dataSessao,
  }
}

// Lê datas em texto livre vindas da IA ("10/11/2026", "10/11/2026 às 09:00",
// "2026-11-10"). Devolve null se não reconhecer — nunca chuta.
export function lerDataTexto(texto: string | null | undefined): Date | null {
  if (!texto) return null
  const br = texto.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b(?:[^0-9]*(\d{1,2})[:h](\d{2}))?/)
  if (br) {
    const [, d, m, y, hh, mm] = br
    return validar(Number(y), Number(m), Number(d), Number(hh ?? 12), Number(mm ?? 0))
  }
  const iso = texto.match(/\b(\d{4})-(\d{2})-(\d{2})\b(?:[T\s](\d{2}):(\d{2}))?/)
  if (iso) {
    const [, y, m, d, hh, mm] = iso
    return validar(Number(y), Number(m), Number(d), Number(hh ?? 12), Number(mm ?? 0))
  }
  return null
}

// Hora local de Brasília -> instante UTC.
function validar(y: number, m: number, d: number, hh: number, mm: number): Date | null {
  if (hh > 23 || mm > 59) return null
  // Data inexistente (ex.: 31/02) não sobrevive ao ida-e-volta.
  const civil = new Date(Date.UTC(y, m - 1, d))
  if (civil.getUTCFullYear() !== y || civil.getUTCMonth() !== m - 1 || civil.getUTCDate() !== d) return null
  return new Date(Date.UTC(y, m - 1, d, hh + 3, mm))
}
