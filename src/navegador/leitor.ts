// ============================================================
// navegador/leitor.ts — O script que roda DENTRO das páginas do portal no navegador da
// Bela. Reaproveita as mesmas funções da extensão "Bela na disputa" (extensao-bela/lib e
// config.mjs), para a leitura do lance e do chat ser uma só nos dois caminhos.
// Monta um script único (sem import/export) e expõe `window.__bela`.
// ============================================================

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

// Ordem importa: proposta.mjs usa funções de preencher.mjs.
const MODULOS = ['config.mjs', 'lib/valor.mjs', 'lib/chat.mjs', 'lib/preencher.mjs', 'lib/proposta.mjs'] as const

function pastaDaExtensao(): string {
  const candidatos = [path.resolve(__dirname, '../../extensao-bela'), path.resolve(process.cwd(), 'extensao-bela')]
  const achada = candidatos.find((p) => existsSync(path.join(p, 'config.mjs')))
  if (!achada) throw new Error('Pasta extensao-bela não encontrada: o navegador precisa dela para ler a disputa.')
  return achada
}

const nomeDoModulo = (arquivo: string) => `m_${path.basename(arquivo, '.mjs').replace(/\W/g, '_')}`

/** Converte um módulo ES simples (import nomeado + export de declarações) num bloco que devolve as exportações. */
export function moduloComoBloco(arquivo: string, codigo: string): string {
  const exportados: string[] = []
  const corpo = codigo
    .replace(/^import\s*\{([^}]+)\}\s*from\s*['"]\.\/([\w.-]+)['"];?\s*$/gm, (_m, nomes: string, origem: string) => `const {${nomes}} = ${nomeDoModulo(origem)};`)
    .replace(/^export\s+(async\s+function|function|const|let|class)\s+([\w$]+)/gm, (_m, tipo: string, nome: string) => {
      exportados.push(nome)
      return `${tipo} ${nome}`
    })
  if (/^\s*(import|export)\b/m.test(corpo)) throw new Error(`${arquivo}: import/export que o navegador não sabe converter.`)
  return `const ${nomeDoModulo(arquivo)} = (function () {\n${corpo}\nreturn { ${exportados.join(', ')} };\n})();`
}

let emCache: string | null = null

export function scriptDoLeitor(): string {
  if (emCache) return emCache
  const pasta = pastaDaExtensao()
  const blocos = MODULOS.map((m) => moduloComoBloco(m, readFileSync(path.join(pasta, m), 'utf8')))
  emCache = `(function () {
  if (window.__bela) return;
  ${blocos.join('\n')}
  const portal = m_config.portalDoHost(location.hostname);
  const vistas = new Set();
  window.__bela = {
    portal: portal ? portal.nome : null,
    // Melhor lance e mensagens novas do chat desta página (só lê; nunca clica).
    ler() {
      if (!portal) return null;
      const lance = m_valor.extrairMelhorLance(document, portal.seletoresDoMelhorLance);
      const novas = portal.seletoresDoChat
        ? m_chat.extrairMensagens(document, portal.seletoresDoChat).filter((m) => !vistas.has(m_chat.chaveLocal(m)))
        : [];
      for (const m of novas) vistas.add(m_chat.chaveLocal(m));
      return { melhorLance: lance ? lance.valor : null, mensagens: novas.slice(-50) };
    },
    // Escreve o lance no campo; nunca envia.
    preencherLance(valor) {
      if (!portal) return { ok: false, motivo: 'Esta tela não é a sala de disputa de um portal conhecido.' };
      return m_preencher.preencherLance(document, { valor, seletores: portal.seletoresDoCampoDeLance, formato: portal.formatoDoCampoDeLance }, window);
    },
    // Escreve os preços da proposta; nunca envia.
    preencherProposta(itens) {
      if (!portal) return { ok: false, motivo: 'Esta tela não é a de um portal conhecido.' };
      return m_proposta.preencherProposta(document, { itens, seletores: portal.seletoresDaProposta, formato: portal.formatoDoCampoDeLance }, window);
    },
  };
})();`
  return emCache
}
