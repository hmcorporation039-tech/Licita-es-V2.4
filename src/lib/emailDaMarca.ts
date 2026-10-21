import { escapeHtml, safeHttpUrl } from './html'

const COR = {
  fundo: '#eef3fb',
  azul: '#0a4fd6',
  azulSuave: '#9fd3ff',
  tinta: '#0b1f44',
  texto: '#33415c',
  apagado: '#5b6b8c',
  linha: '#dbe6f7',
  verde: '#18c25a',
  verdeTinta: '#04220f',
  papel: '#ffffff',
}

const FONTE = "'Nunito','Segoe UI',Arial,Helvetica,sans-serif"

export const RODAPE_DA_EMPRESA = 'Licita Bela · H&amp;M Engenharia e Tecnologia LTDA · CNPJ 04.003.376/0001-00 · Brasília/DF'

export interface LinkDoEmail {
  texto: string
  link: string
}

export interface DetalheDoEmail {
  rotulo: string
  valor: string
}

export interface CartaoDoEmail {
  titulo: string
  destaque?: string
  linhas: string[]
  link?: LinkDoEmail
}

export interface ConteudoDoEmail {
  previa: string
  titulo: string
  corpo?: string
  cartoes?: CartaoDoEmail[]
  notaDosCartoes?: string
  detalhes?: DetalheDoEmail[]
  botao?: LinkDoEmail
  linkSecundario?: LinkDoEmail
  motivo?: string
  descadastro?: string
}

function botaoHtml({ texto, link }: LinkDoEmail): string {
  const href = safeHttpUrl(link)
  if (!href) return ''
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px">
      <tr>
        <td style="border-radius:999px;background:${COR.verde}">
          <a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 26px;font-family:${FONTE};font-size:15px;font-weight:800;color:${COR.verdeTinta};text-decoration:none;border-radius:999px">${escapeHtml(texto)}</a>
        </td>
      </tr>
    </table>
    <p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:${COR.apagado}">Se o botão não funcionar, copie este endereço no navegador:<br><span style="word-break:break-all;color:${COR.azul}">${escapeHtml(href)}</span></p>`
}

function linkSecundarioHtml({ texto, link }: LinkDoEmail): string {
  const href = safeHttpUrl(link)
  if (!href) return ''
  return `<p style="margin:16px 0 0;font-size:14px"><a href="${escapeHtml(href)}" style="color:${COR.azul};font-weight:700;text-decoration:none">${escapeHtml(texto)} &rarr;</a></p>`
}

function detalhesHtml(detalhes: DetalheDoEmail[]): string {
  if (detalhes.length === 0) return ''
  const linhas = detalhes
    .map(
      (d) => `
      <tr>
        <td style="padding:10px 0;border-top:1px solid ${COR.linha}">
          <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${COR.apagado}">${escapeHtml(d.rotulo)}</div>
          <div style="margin-top:2px;font-size:15px;line-height:1.45;color:${COR.tinta}">${escapeHtml(d.valor)}</div>
        </td>
      </tr>`
    )
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;border-bottom:1px solid ${COR.linha}">${linhas}</table>`
}

function cartaoHtml(cartao: CartaoDoEmail): string {
  const href = cartao.link ? safeHttpUrl(cartao.link.link) : null
  const destaque = cartao.destaque
    ? `<div style="margin-top:6px;font-size:13px;font-weight:700;line-height:1.45;color:${COR.azul}">${escapeHtml(cartao.destaque)}</div>`
    : ''
  const linhas = cartao.linhas.map((linha) => `<div style="margin-top:2px;font-size:13px;line-height:1.45;color:${COR.texto}">${escapeHtml(linha)}</div>`).join('')
  const link =
    href && cartao.link
      ? `<div style="margin-top:8px;font-size:13px"><a href="${escapeHtml(href)}" style="color:${COR.azul};font-weight:800;text-decoration:none">${escapeHtml(cartao.link.texto)} &rarr;</a></div>`
      : ''
  return `
      <tr>
        <td style="padding:14px 16px;border:1px solid ${COR.linha};border-radius:12px;background:${COR.papel}">
          <div style="font-size:15px;font-weight:800;line-height:1.4;color:${COR.tinta}">${escapeHtml(cartao.titulo)}</div>
          ${destaque}${linhas}${link}
        </td>
      </tr>
      <tr><td style="height:10px;line-height:10px;font-size:0">&nbsp;</td></tr>`
}

function cartoesHtml(cartoes: CartaoDoEmail[], nota?: string): string {
  if (cartoes.length === 0) return ''
  const notaHtml = nota ? `<p style="margin:2px 0 0;font-size:14px;font-weight:700;color:${COR.tinta}">${escapeHtml(nota)}</p>` : ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;border-collapse:separate">${cartoes.map(cartaoHtml).join('')}</table>${notaHtml}`
}

function descadastroHtml(link: string | undefined): string {
  const href = link ? safeHttpUrl(link) : null
  if (!href) return ''
  return `<br>Não quer mais receber este tipo de e-mail? <a href="${escapeHtml(href)}" style="color:${COR.apagado};text-decoration:underline">Descadastrar</a>`
}

export function emailDaMarca(conteudo: ConteudoDoEmail): string {
  const motivo = conteudo.motivo ?? 'Você recebeu este e-mail por causa da sua conta na Licita Bela.'
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(conteudo.titulo)}</title></head>
<body style="margin:0;padding:0;background:${COR.fundo}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(conteudo.previa)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COR.fundo}">
    <tr>
      <td align="center" style="padding:28px 12px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;font-family:${FONTE}">
          <tr>
            <td style="background:${COR.azul};border-radius:16px 16px 0 0;padding:22px 28px">
              <span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-.01em">Licita</span><span style="font-size:22px;font-weight:300;color:${COR.azulSuave}"> Bela</span>
            </td>
          </tr>
          <tr>
            <td style="background:${COR.papel};border-radius:0 0 16px 16px;padding:28px;color:${COR.texto};font-size:15px;line-height:1.6">
              <h1 style="margin:0 0 12px;font-size:21px;line-height:1.3;font-weight:800;color:${COR.tinta}">${escapeHtml(conteudo.titulo)}</h1>
              ${conteudo.corpo ?? ''}
              ${cartoesHtml(conteudo.cartoes ?? [], conteudo.notaDosCartoes)}
              ${detalhesHtml(conteudo.detalhes ?? [])}
              ${conteudo.botao ? botaoHtml(conteudo.botao) : ''}
              ${conteudo.linkSecundario ? linkSecundarioHtml(conteudo.linkSecundario) : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 12px 0;text-align:center;font-size:12px;line-height:1.6;color:${COR.apagado}">
              ${escapeHtml(motivo)}${descadastroHtml(conteudo.descadastro)}<br>${RODAPE_DA_EMPRESA}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function paragrafo(texto: string): string {
  return `<p style="margin:0 0 12px">${texto}</p>`
}
