// Etapa 2 do robô: escrever o lance sugerido no campo do portal.
// NUNCA clica em "enviar" nem confirma nada: quem envia é a pessoa.
// Os seletores vêm de config.mjs (candidatos até a captura da tela real).

export function formatarValor(valor, formato = 'br') {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) return null
  const centavos = Math.round(valor * 100)
  if (formato === 'digitos') return String(centavos) // campo com máscara que monta a vírgula sozinho
  if (formato === 'ponto') return (centavos / 100).toFixed(2)
  return (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function visivel(el) {
  if (!el || el.disabled || el.readOnly) return false
  if (typeof el.getClientRects === 'function' && el.getClientRects().length === 0) return false
  return true
}

export function acharCampoDeLance(raiz, seletores) {
  if (!raiz || typeof raiz.querySelectorAll !== 'function') return null
  for (const seletor of seletores ?? []) {
    let lista
    try {
      lista = raiz.querySelectorAll(seletor)
    } catch {
      continue
    }
    const campos = [...(lista ?? [])].filter((el) => el.tagName === 'INPUT' && visivel(el))
    // Mais de um campo visível = vários itens na tela; não adivinhamos qual.
    if (campos.length === 1) return { campo: campos[0], seletor }
    if (campos.length > 1) return { campo: null, seletor, varios: campos.length }
  }
  return null
}

// Escreve como se fosse digitado: usa o setter nativo e dispara input/change, para
// frameworks (Angular, React) perceberem a mudança.
export function escreverNoCampo(campo, texto, janela = globalThis) {
  const prototipo = janela.HTMLInputElement?.prototype
  const setter = prototipo ? Object.getOwnPropertyDescriptor(prototipo, 'value')?.set : null
  campo.focus?.()
  if (setter) setter.call(campo, texto)
  else campo.value = texto
  const Evento = janela.Event ?? Event
  campo.dispatchEvent(new Evento('input', { bubbles: true }))
  campo.dispatchEvent(new Evento('change', { bubbles: true }))
  campo.style && (campo.style.outline = '3px solid #f59e0b')
  campo.style && (campo.style.outlineOffset = '2px')
}

export function preencherLance(raiz, { valor, seletores, formato }, janela = globalThis) {
  const texto = formatarValor(valor, formato)
  if (!texto) return { ok: false, motivo: 'Valor inválido.' }
  const achado = acharCampoDeLance(raiz, seletores)
  if (!achado) return { ok: false, motivo: 'Não achei o campo de lance nesta tela.' }
  if (!achado.campo) return { ok: false, motivo: `Há ${achado.varios} campos de lance na tela. Abra só o item da disputa e tente de novo.` }
  escreverNoCampo(achado.campo, texto, janela)
  return { ok: true, texto, seletor: achado.seletor }
}
