import { FonteEnum } from '@prisma/client'
import { prisma } from './tenderService'
import { avisarAdministrador } from './alertaOperacional'

export const JANELA_SEM_COLETA_MS = 24 * 60 * 60 * 1000
export const SILENCIO_DO_AVISO_MS = 24 * 60 * 60 * 1000

export interface RegistroDeColeta {
  fonte: FonteEnum | null
  status: string
  totalFetched: number | null
  totalNew: number | null
  totalDupes: number | null
  errorMsg: string | null
  finishedAt: Date | null
}

export interface ColetorParado {
  fonte: FonteEnum
  execucoes: number
  falhas: number
  ultimoErro: string | null
}

function coletouAlgo(r: RegistroDeColeta): boolean {
  return (r.totalFetched ?? 0) > 0 || (r.totalNew ?? 0) > 0 || (r.totalDupes ?? 0) > 0
}

export function coletoresSemColeta(fontes: FonteEnum[], registros: RegistroDeColeta[]): ColetorParado[] {
  return [...new Set(fontes)].flatMap((fonte) => {
    const daFonte = registros.filter((r) => r.fonte === fonte && r.status !== 'RUNNING')
    if (daFonte.some(coletouAlgo)) return []
    const ordenados = [...daFonte].sort((a, b) => (b.finishedAt?.getTime() ?? 0) - (a.finishedAt?.getTime() ?? 0))
    return [
      {
        fonte,
        execucoes: daFonte.length,
        falhas: daFonte.filter((r) => r.status === 'FAILED' || r.status === 'PARTIAL').length,
        ultimoErro: ordenados.find((r) => r.errorMsg)?.errorMsg ?? null,
      },
    ]
  })
}

export function textoDoColetorParado(c: ColetorParado): string {
  const execucoes =
    c.execucoes === 0
      ? 'nenhuma execução registrada'
      : `${c.execucoes} execução(ões), ${c.falhas} com falha`
  return `${c.fonte}: 0 licitações coletadas nas últimas 24 h (${execucoes})${c.ultimoErro ? ` — último erro: ${c.ultimoErro.slice(0, 300)}` : ''}`
}

const ultimosAvisos = new Map<FonteEnum, number>()

export function limparAvisosDeColetor(): void {
  ultimosAvisos.clear()
}

export interface DependenciasDaSaude {
  registros(desde: Date): Promise<RegistroDeColeta[]>
  avisar(chave: string, assunto: string, texto: string): Promise<unknown>
}

const DEPENDENCIAS_PADRAO: DependenciasDaSaude = {
  registros: (desde) =>
    prisma.workerLog.findMany({
      where: { createdAt: { gte: desde }, fonte: { not: null } },
      select: { fonte: true, status: true, totalFetched: true, totalNew: true, totalDupes: true, errorMsg: true, finishedAt: true },
    }),
  avisar: (chave, assunto, texto) => avisarAdministrador(chave, assunto, texto),
}

export async function verificarColetoresParados(
  fontes: FonteEnum[],
  agora: Date = new Date(),
  dep: DependenciasDaSaude = DEPENDENCIAS_PADRAO
): Promise<ColetorParado[]> {
  const parados = coletoresSemColeta(fontes, await dep.registros(new Date(agora.getTime() - JANELA_SEM_COLETA_MS)))
  const novos = parados.filter((c) => {
    const ultimo = ultimosAvisos.get(c.fonte)
    return ultimo === undefined || agora.getTime() - ultimo >= SILENCIO_DO_AVISO_MS
  })
  for (const c of parados) console.warn(`[Saúde dos coletores] ${textoDoColetorParado(c)}`)
  if (novos.length === 0) return parados

  for (const c of novos) ultimosAvisos.set(c.fonte, agora.getTime())
  await dep.avisar(
    `coletor-parado|${novos.map((c) => c.fonte).sort().join(',')}`,
    `${novos.length === 1 ? 'Coletor' : 'Coletores'} sem licitação coletada há 24 h`,
    `${novos.map(textoDoColetorParado).join('\n')}\n\nA fonte pode ter mudado de formato, bloqueado o acesso ou parado de publicar. Confira os logs do worker.`
  )
  return parados
}
