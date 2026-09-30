// ============================================================
// services/catalogoBootstrap.ts — Mantém sozinhos os dados de apoio do
// cadastro de item (UASGs e catálogo CATMAT/CATSER).
//
// Por quê: no Railway o banco só é alcançável de dentro da rede do serviço,
// então rodar os scripts de importação à mão é trabalhoso. Aqui a própria API,
// depois de subir, confere cada tabela e importa em segundo plano se estiver
// vazia ou velha (renovação ~mensal). Nunca bloqueia nem derruba a API.
//
// Liga/desliga:
//   AUTO_IMPORT_CATALOGOS=true|false  (padrão: ligado só com NODE_ENV=production,
//   para não baixar dados da internet em desenvolvimento/testes E2E)
//   AUTO_IMPORT_MAX_IDADE_DIAS        (padrão 35) — idade a partir da qual renova
// ============================================================

import { importarCatalogo, importarUasgs } from './catalogoImportService'
import { prisma } from './tenderService'

const UM_DIA_MS = 24 * 60 * 60 * 1000
const ESPERA_INICIAL_MS = 60_000 // deixa a API e os workers estabilizarem antes
const INTERVALO_CHECAGEM_MS = UM_DIA_MS

export type FonteDeApoio = 'uasg' | 'servico' | 'material'

interface StatusFonte {
  fonte: FonteDeApoio
  emAndamento: boolean
  ultimaExecucao: string | null
  ultimoErro: string | null
  registros: number | null
}

const status: Record<FonteDeApoio, StatusFonte> = {
  uasg: { fonte: 'uasg', emAndamento: false, ultimaExecucao: null, ultimoErro: null, registros: null },
  servico: { fonte: 'servico', emAndamento: false, ultimaExecucao: null, ultimoErro: null, registros: null },
  material: { fonte: 'material', emAndamento: false, ultimaExecucao: null, ultimoErro: null, registros: null },
}

// Uma importação por vez neste processo (a API pública é rate-limited e o
// CATMAT é pesado). As importações são upsert, então duas instâncias rodando
// ao mesmo tempo não corrompem nada — só gastam requisições à toa.
let rodando = false

export function autoImportHabilitado(): boolean {
  const v = process.env.AUTO_IMPORT_CATALOGOS
  if (v === 'true') return true
  if (v === 'false') return false
  return process.env.NODE_ENV === 'production'
}

function maxIdadeMs(): number {
  const dias = Number(process.env.AUTO_IMPORT_MAX_IDADE_DIAS)
  return (Number.isFinite(dias) && dias > 0 ? dias : 35) * UM_DIA_MS
}

async function contagemEIdade(fonte: FonteDeApoio): Promise<{ total: number; maisRecente: Date | null }> {
  if (fonte === 'uasg') {
    const [total, agg] = await Promise.all([
      prisma.uasg.count(),
      prisma.uasg.aggregate({ _max: { updatedAt: true } }),
    ])
    return { total, maisRecente: agg._max.updatedAt }
  }
  const tipo = fonte === 'material' ? 'MATERIAL' : 'SERVICO'
  const [total, agg] = await Promise.all([
    prisma.catalogItem.count({ where: { tipo } }),
    prisma.catalogItem.aggregate({ where: { tipo }, _max: { updatedAt: true } }),
  ])
  return { total, maisRecente: agg._max.updatedAt }
}

// Executa a importação de uma fonte registrando o resultado. Não lança.
async function executar(fonte: FonteDeApoio): Promise<void> {
  const s = status[fonte]
  s.emAndamento = true
  s.ultimoErro = null
  const log = (m: string) => console.log(`[Importação ${fonte}] ${m}`)
  try {
    s.registros =
      fonte === 'uasg' ? await importarUasgs(log) : await importarCatalogo(fonte, log)
    s.ultimaExecucao = new Date().toISOString()
  } catch (err) {
    s.ultimoErro = err instanceof Error ? err.message : String(err)
    console.error(`[Importação ${fonte}] Falhou:`, s.ultimoErro)
  } finally {
    s.emAndamento = false
  }
}

// Confere cada fonte e importa as que estiverem vazias ou velhas. Ordem:
// UASG e CATSER (rápidos) antes do CATMAT (pesado).
export async function verificarEImportar(opcoes: { forcar?: boolean } = {}): Promise<FonteDeApoio[]> {
  if (rodando) return []
  rodando = true
  const importadas: FonteDeApoio[] = []
  try {
    for (const fonte of ['uasg', 'servico', 'material'] as FonteDeApoio[]) {
      const { total, maisRecente } = await contagemEIdade(fonte)
      const velha = maisRecente != null && Date.now() - maisRecente.getTime() > maxIdadeMs()
      if (opcoes.forcar || total === 0 || velha) {
        console.log(
          `[Importação] ${fonte}: ${opcoes.forcar ? 'forçada' : total === 0 ? 'tabela vazia' : 'dados antigos'} — importando...`
        )
        await executar(fonte)
        importadas.push(fonte)
      }
    }
  } catch (err) {
    // Falha ao consultar o banco (ex.: tabela ainda sem migration) não deve
    // derrubar a API — a próxima checagem tenta de novo.
    console.error('[Importação] Falha na verificação:', err instanceof Error ? err.message : err)
  } finally {
    rodando = false
  }
  return importadas
}

export function statusImportacoes() {
  return { habilitado: autoImportHabilitado(), emAndamento: rodando, fontes: Object.values(status) }
}

export function importacaoEmAndamento(): boolean {
  return rodando
}

// Liga a rotina: primeira checagem ~1 min após o boot e depois a cada 24 h.
// Os timers não seguram o processo aberto (unref).
export function iniciarImportacaoAutomatica(): void {
  if (!autoImportHabilitado()) {
    console.log('[Importação] automática desligada (AUTO_IMPORT_CATALOGOS / NODE_ENV).')
    return
  }
  const primeira = setTimeout(() => void verificarEImportar(), ESPERA_INICIAL_MS)
  const periodica = setInterval(() => void verificarEImportar(), INTERVALO_CHECAGEM_MS)
  primeira.unref()
  periodica.unref()
  console.log('[Importação] automática ligada — primeira checagem em ~1 min.')
}
