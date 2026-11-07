// Captura da estrutura da sala de disputa, para mapear os seletores do portal
// (melhor lance, cronômetro, fase, campo e botão de lance) sem ver a tela ao vivo.
// Guarda só o esqueleto: tag, id, classes, papéis e um trecho curto do texto, com
// CPF, CNPJ e e-mail mascarados. Nunca lê o valor digitado em campo nenhum.

const LIMITE_PADRAO = 600
const TAM_DO_TEXTO = 80
// Inclui o chat do pregoeiro (mensagens, convocação, pedido de anexo), para o monitor do chat.
const TERMOS_DA_DISPUTA = /lance|melhor|menor|valor|r\$|tempo|cron|restante|fase|disputa|item|grupo|lote|enviar|aberto|fechad|prorroga|encerr|posi[cç][aã]o|iminente|fornecedor|proposta|classifica|chat|mensage|pregoeir|convoca|anexo|negocia|aceita|habilita|recurso|diligencia/i
const INTERATIVOS = new Set(['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'A'])
const ATRIBUTOS = ['role', 'aria-label', 'name', 'type', 'placeholder', 'title', 'formcontrolname']

export function mascarar(texto) {
  return String(texto ?? '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[e-mail]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[cnpj]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[cpf]')
    .replace(/\s+/g, ' ')
    .trim()
}

function textoProprio(el) {
  let texto = ''
  for (const no of el.childNodes ?? []) if (no.nodeType === 3) texto += no.textContent
  return mascarar(texto).slice(0, TAM_DO_TEXTO)
}

function classesDe(el) {
  const bruto = typeof el.className === 'string' ? el.className : (el.getAttribute?.('class') ?? '')
  return bruto.split(/\s+/).filter(Boolean).slice(0, 8)
}

function caminho(el) {
  const partes = []
  for (let atual = el; atual && atual.tagName && partes.length < 5; atual = atual.parentElement) {
    const tag = atual.tagName.toLowerCase()
    partes.unshift(atual.id ? `${tag}#${atual.id}` : classesDe(atual)[0] ? `${tag}.${classesDe(atual)[0]}` : tag)
    if (atual.id) break
  }
  return partes.join(' > ')
}

function interessa(el, texto, atributos) {
  if (INTERATIVOS.has(el.tagName)) return true
  if (TERMOS_DA_DISPUTA.test(texto)) return true
  if (el.id && TERMOS_DA_DISPUTA.test(el.id)) return true
  if (classesDe(el).some((c) => TERMOS_DA_DISPUTA.test(c))) return true
  return Object.values(atributos).some((v) => TERMOS_DA_DISPUTA.test(v))
}

export function capturarEstrutura(documento, limite = LIMITE_PADRAO) {
  const elementos = []
  for (const el of documento.querySelectorAll('*')) {
    if (elementos.length >= limite) break
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'PATH', 'META', 'LINK'].includes(el.tagName)) continue
    const atributos = {}
    for (const nome of ATRIBUTOS) {
      const valor = el.getAttribute?.(nome)
      if (valor) atributos[nome] = mascarar(valor).slice(0, TAM_DO_TEXTO)
    }
    for (const attr of el.attributes ?? []) {
      if (attr.name.startsWith('data-') && !(attr.name in atributos)) atributos[attr.name] = mascarar(attr.value).slice(0, 40)
    }
    const texto = textoProprio(el)
    if (!interessa(el, texto, atributos)) continue
    elementos.push({
      tag: el.tagName.toLowerCase(),
      ...(el.id ? { id: el.id } : {}),
      ...(classesDe(el).length ? { classes: classesDe(el) } : {}),
      ...(Object.keys(atributos).length ? { atributos } : {}),
      ...(texto ? { texto } : {}),
      caminho: caminho(el),
    })
  }
  const local = documento.location ?? {}
  return {
    pagina: `${local.origin ?? ''}${local.pathname ?? ''}`,
    titulo: mascarar(documento.title).slice(0, 120),
    capturadoEm: new Date().toISOString(),
    total: elementos.length,
    elementos,
  }
}
