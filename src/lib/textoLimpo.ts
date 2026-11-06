// ============================================================
// lib/textoLimpo.ts — Texto que vem dos portais, pronto para mostrar.
//
// Visto em produção (06/11/2026): "<p>Alfabeto silábico</p>" na descrição do item,
// caractere de controle (\x13) no título e entidade HTML sem o "&"
// ("PRESTACcedil;Atilde;O"). Tira tags, decodifica entidades (com ou sem "&") e
// remove caracteres de controle. Mesma regra em web/src/lib/textoLimpo.ts.
// ============================================================

const NOMEADAS: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ordm: 'º', ordf: 'ª', deg: '°', ndash: '–', mdash: '—', hellip: '…' }
const ACENTOS: Record<string, string> = { acute: '́', grave: '̀', circ: '̂', tilde: '̃', uml: '̈', cedil: '̧' }

function acentuada(letra: string, acento: string): string {
  return (letra + ACENTOS[acento]).normalize('NFC')
}

export function textoLimpo(texto: string | null | undefined): string {
  if (!texto) return ''
  return (
    texto
      // Tags HTML (inclusive <br>, <p>, <strong>): viram espaço.
      .replace(/<\/?[a-z][a-z0-9]*(?:\s[^<>]*)?\/?>/gi, ' ')
      // Letra acentuada como entidade, com ou sem "&": "&ccedil;", "Atilde;".
      .replace(/&?([AEIOUYaeiouyCcNn])(acute|grave|circ|tilde|uml|cedil);/g, (m, letra: string, acento: string) => {
        const r = acentuada(letra, acento)
        return r.length === 1 ? r : m
      })
      .replace(/&(amp|lt|gt|quot|apos|nbsp|ordm|ordf|deg|ndash|mdash|hellip);/g, (_, nome: string) => NOMEADAS[nome])
      .replace(/&#(\d{1,6});/g, (m, n: string) => (Number(n) > 31 && Number(n) < 0x110000 ? String.fromCodePoint(Number(n)) : ' '))
      .replace(/&#x([0-9a-f]{1,6});/gi, (m, n: string) => (parseInt(n, 16) > 31 && parseInt(n, 16) < 0x110000 ? String.fromCodePoint(parseInt(n, 16)) : ' '))
      // Caracteres de controle (menos tab e quebra de linha).
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
  )
}
