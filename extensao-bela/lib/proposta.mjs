// Proposta no portal: escreve o preço unitário de cada item na tela de cadastro
// de proposta, casando pelo número do item. NUNCA envia nem confirma a proposta.
// Os seletores vêm de config.mjs (candidatos até a captura da tela real).

import { escreverNoCampo, formatarValor } from './preencher.mjs'

// "Item 3", "Item nº 3", "3 - Câmera" ou uma célula só com "3".
const NUMERO_DO_ITEM = /\bitem\s*(?:n[º°o.]?\s*)?(\d{1,4})\b|^\s*(\d{1,4})\s*(?:[-–.)]|\s|$)/i

function primeiro(el, seletores) {
  for (const s of seletores ?? []) {
    try {
      const achado = el.querySelector(s)
      if (achado) return achado
    } catch {
      /* seletor inválido */
    }
  }
  return null
}

export function numeroDaLinha(linha, seletores) {
  const el = primeiro(linha, seletores?.numeroDoItem)
  const texto = String((el ?? linha).textContent ?? '').replace(/\s+/g, ' ')
  const m = texto.match(NUMERO_DO_ITEM)
  const n = Number(m?.[1] ?? m?.[2])
  return Number.isInteger(n) && n > 0 ? n : null
}

export function preencherProposta(raiz, { itens, seletores, formato }, janela = globalThis) {
  if (!raiz || typeof raiz.querySelectorAll !== 'function') return { ok: false, motivo: 'Tela indisponível.' }
  let linhas = []
  for (const s of seletores?.linha ?? []) {
    try {
      linhas = [...raiz.querySelectorAll(s)]
    } catch {
      linhas = []
    }
    if (linhas.length > 0) break
  }
  if (linhas.length === 0) return { ok: false, motivo: 'Não achei a lista de itens da proposta nesta tela.' }

  const porNumero = new Map(itens.filter((i) => Number.isInteger(i.numero)).map((i) => [i.numero, i]))
  const preenchidos = []
  const semCampo = []
  const usados = new Set()
  for (const linha of linhas) {
    const numero = numeroDaLinha(linha, seletores)
    const item = numero !== null ? porNumero.get(numero) : null
    if (!item || usados.has(numero)) continue
    const campo = primeiro(linha, seletores?.campoDoPreco)
    const texto = formatarValor(item.precoUnitario, formato)
    if (!campo || campo.tagName !== 'INPUT' || campo.disabled || campo.readOnly || !texto) {
      semCampo.push(numero)
      continue
    }
    escreverNoCampo(campo, texto, janela)
    usados.add(numero)
    preenchidos.push(numero)
  }
  const naoEncontrados = [...porNumero.keys()].filter((n) => !usados.has(n) && !semCampo.includes(n))
  return { ok: preenchidos.length > 0, preenchidos, semCampo, naoEncontrados, motivo: preenchidos.length === 0 ? 'Nenhum item da proposta casou com os itens desta tela.' : null }
}
