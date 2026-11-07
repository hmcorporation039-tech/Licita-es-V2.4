// Leitura do chat do pregoeiro na sala de disputa (monitor do chat).
// Só lê o texto que já está na tela do cliente; nunca escreve nem clica.
// Os seletores vêm de config.mjs (candidatos até a captura da tela real).

const HORA = /\b([01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b/
// "Pregoeiro: texto", "Sistema - texto", "Pregoeiro(a) diz: texto"
const AUTOR_NO_TEXTO = /^\s*(pregoeir[oa](?:\(a\))?|sistema|fornecedor|licitante|autoridade|equipe de apoio)\s*(?:diz)?\s*[:\-–]\s*/i

function textoDe(el) {
  return String(el?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function primeiro(el, seletores) {
  for (const s of seletores ?? []) {
    try {
      const achado = el.querySelector(s)
      if (achado && textoDe(achado)) return achado
    } catch {
      /* seletor inválido */
    }
  }
  return null
}

export function lerMensagem(el, seletores = {}) {
  let texto = textoDe(primeiro(el, seletores.texto) ?? el)
  if (!texto) return null
  let autor = textoDe(primeiro(el, seletores.autor)) || null
  let horaNoPortal = textoDe(primeiro(el, seletores.hora)).match(HORA)?.[0] ?? null
  if (!horaNoPortal) horaNoPortal = texto.match(HORA)?.[0] ?? null
  if (!autor) {
    const m = texto.match(AUTOR_NO_TEXTO)
    if (m) {
      autor = m[1]
      texto = texto.slice(m[0].length).trim()
    }
  } else if (texto.startsWith(autor)) {
    texto = texto.slice(autor.length).replace(/^\s*[:\-–]\s*/, '').trim()
  }
  if (!texto) return null
  return { autor, texto: texto.slice(0, 4000), horaNoPortal }
}

export function extrairMensagens(raiz, seletores = {}) {
  if (!raiz || typeof raiz.querySelectorAll !== 'function') return []
  for (const seletor of seletores.mensagem ?? []) {
    let lista
    try {
      lista = raiz.querySelectorAll(seletor)
    } catch {
      continue
    }
    const mensagens = [...(lista ?? [])].map((el) => lerMensagem(el, seletores)).filter(Boolean)
    if (mensagens.length > 0) return mensagens
  }
  return []
}

export function chaveLocal(m) {
  return `${m.autor ?? ''}|${m.horaNoPortal ?? ''}|${m.texto}`
}
