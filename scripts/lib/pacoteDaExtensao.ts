// Pacote da extensão "Bela na disputa" para a Chrome Web Store.
//
// A pasta extensao-bela/ é a versão de desenvolvimento: ela também abre em http://localhost
// para testar com o site rodando no computador. A loja não deve receber isso, então o
// pacote tira o localhost do manifesto (host_permissions, content_scripts e
// web_accessible_resources) e põe o nome e a descrição curta da loja (até 132 caracteres).
// O código vai igual: o que o Google revisa é o que roda.
//
// O nome e a descrição ficam aqui, e não no manifest.json, de propósito: mudar a pasta
// extensao-bela/ republica o navegador da Bela no Fly e fecha as sessões abertas.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { zipSync } from 'fflate'

/** Limite da descrição curta na Chrome Web Store. */
export const LIMITE_DA_DESCRICAO = 132

/** Só o que a extensão usa; README e afins ficam fora do pacote. */
const EXTENSOES_DO_PACOTE = /\.(json|mjs|js|html|png)$/i

type Manifesto = Record<string, unknown> & {
  description?: string
  host_permissions?: string[]
  content_scripts?: { matches?: string[] }[]
  web_accessible_resources?: { matches?: string[] }[]
}

export const NOME_NA_LOJA = 'Bela na disputa – Licita Bela'
export const DESCRICAO_NA_LOJA =
  'Lê o melhor lance e o chat do pregoeiro na sessão aberta no portal e escreve o lance sugerido para você conferir e enviar.'

const ehDeTeste = (padrao: string) => /^https?:\/\/localhost(?::\d+)?\//i.test(padrao)

export function manifestoDaLoja(original: Manifesto): Manifesto {
  const m = structuredClone(original)
  m.name = NOME_NA_LOJA
  m.description = DESCRICAO_NA_LOJA
  if (m.host_permissions) m.host_permissions = m.host_permissions.filter((p) => !ehDeTeste(p))
  for (const c of m.content_scripts ?? []) if (c.matches) c.matches = c.matches.filter((p) => !ehDeTeste(p))
  for (const w of m.web_accessible_resources ?? []) if (w.matches) w.matches = w.matches.filter((p) => !ehDeTeste(p))
  return m
}

/** Problemas que a loja recusaria. Vazio = pode enviar. */
export function problemasDoManifesto(m: Manifesto, arquivos: Set<string>): string[] {
  const problemas: string[] = []
  if (m.manifest_version !== 3) problemas.push('manifest_version precisa ser 3')
  if (!m.description || m.description.length > LIMITE_DA_DESCRICAO) {
    problemas.push(`descrição precisa ter até ${LIMITE_DA_DESCRICAO} caracteres`)
  }
  const padroes = [
    ...(m.host_permissions ?? []),
    ...(m.content_scripts ?? []).flatMap((c) => c.matches ?? []),
    ...(m.web_accessible_resources ?? []).flatMap((w) => w.matches ?? []),
  ]
  for (const p of padroes) if (ehDeTeste(p)) problemas.push(`endereço de teste no pacote: ${p}`)
  const referidos = JSON.stringify(m).match(/[\w/-]+\.(?:mjs|js|html|png)\b/g) ?? []
  for (const r of new Set(referidos)) if (!arquivos.has(r)) problemas.push(`arquivo citado e ausente: ${r}`)
  return problemas
}

function listar(pasta: string, base = pasta): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome)
    if (statSync(caminho).isDirectory()) return listar(caminho, base)
    return EXTENSOES_DO_PACOTE.test(nome) ? [relative(base, caminho).split(sep).join('/')] : []
  })
}

/** Monta o .zip (bytes) a partir da pasta da extensão. Lança erro se a loja fosse recusar. */
export function montarPacote(pasta: string): { zip: Uint8Array; versao: string; arquivos: string[] } {
  const arquivos = listar(pasta).sort()
  const original = JSON.parse(readFileSync(join(pasta, 'manifest.json'), 'utf8')) as Manifesto
  const manifesto = manifestoDaLoja(original)
  const problemas = problemasDoManifesto(manifesto, new Set(arquivos))
  if (problemas.length) throw new Error(`Pacote recusado:\n- ${problemas.join('\n- ')}`)
  const conteudo: Record<string, Uint8Array> = {}
  for (const a of arquivos) {
    conteudo[a] = a === 'manifest.json' ? new TextEncoder().encode(`${JSON.stringify(manifesto, null, 2)}\n`) : readFileSync(join(pasta, a))
  }
  return { zip: zipSync(conteudo, { level: 9 }), versao: String(manifesto.version), arquivos }
}
