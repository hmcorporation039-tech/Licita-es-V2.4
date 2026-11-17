/* eslint-disable @typescript-eslint/no-require-imports -- script CommonJS rodado direto pelo node */
/* global AbortSignal, document -- document só existe dentro do navegador (page.evaluate) */
// Vigia do site: abre o site no ar como um cliente abriria e confere o caminho
// que traz cliente novo (página inicial, cadastro com captcha, login, API,
// sitemap e páginas públicas). Roda pelo GitHub Actions (.github/workflows/vigia-do-site.yml)
// a cada 2 horas e depois de cada deploy. Se algo falhar, o job fica vermelho e
// abre/atualiza um aviso (issue) no GitHub, que manda e-mail ao dono do repositório.
//
// Não cria conta, não envia formulário e não guarda nada: só lê páginas.
//
//   SITE_URL   padrão https://www.licitabela.com.br
//   API_URL    padrão https://api-production-4375e.up.railway.app
//   RELATORIO  arquivo onde grava o resumo em Markdown (opcional)
//
// Uso local: node scripts/ops/vigiaDoSite.cjs   (precisa do pacote "playwright")

const fs = require('node:fs')

const SITE = (process.env.SITE_URL || 'https://www.licitabela.com.br').replace(/\/$/, '')
const API = (process.env.API_URL || 'https://api-production-4375e.up.railway.app').replace(/\/$/, '')
const TEMPO_DO_CAPTCHA_MS = 40_000

// Erros do Turnstile que são de configuração (nunca resolvem sozinhos):
// 110100/110110 chave inválida, 110200 domínio não autorizado, 400020 chave inexistente.
// Outros códigos (ex.: desafio interativo para robô) não derrubam o vigia.
const ERROS_DE_CONFIGURACAO = /\b(1101\d\d|110200|4000\d\d)\b/

async function pagina(caminho, { contem, minimo } = {}) {
  const r = await fetch(SITE + caminho, { redirect: 'follow', signal: AbortSignal.timeout(20_000) })
  if (r.status !== 200) throw new Error(`respondeu ${r.status}`)
  const texto = await r.text()
  if (contem && !texto.includes(contem)) throw new Error(`não contém "${contem}"`)
  if (minimo) {
    const n = (texto.match(/<loc>/g) || []).length
    if (n < minimo) throw new Error(`só ${n} endereços (esperado ${minimo} ou mais)`)
    return `${n} endereços`
  }
  return 'ok'
}

async function api(caminho) {
  const r = await fetch(API + caminho, { signal: AbortSignal.timeout(20_000) })
  if (r.status !== 200) throw new Error(`respondeu ${r.status}`)
  return 'ok'
}

async function captchaDoCadastro() {
  const { chromium } = require('playwright')
  const navegador = await chromium.launch()
  try {
    const p = await navegador.newPage({ locale: 'pt-BR' })
    let erro = null
    // A conferência do captcha passa por ".../challenge-platform/.../fo/...": 200 quando a
    // Cloudflare aceita o site, 400 quando recusa (ex.: domínio fora da lista do widget).
    const conferencias = { aceitas: 0, recusadas: 0 }
    p.on('response', (r) => {
      if (!/challenges\.cloudflare\.com\/cdn-cgi\/challenge-platform\/.*\/fo\//.test(r.url())) return
      if (r.status() === 200) conferencias.aceitas++
      else if (r.status() >= 400 && r.status() < 500) conferencias.recusadas++
    })
    p.on('console', (m) => {
      const t = m.text()
      if (t.includes('Turnstile') && /error/i.test(t)) erro = t
    })
    const r = await p.goto(SITE + '/cadastro', { waitUntil: 'load', timeout: 30_000 })
    if (!r || r.status() !== 200) throw new Error(`página respondeu ${r ? r.status() : 'sem resposta'}`)
    const inicio = Date.now()
    let token = ''
    while (Date.now() - inicio < TEMPO_DO_CAPTCHA_MS) {
      if (conferencias.aceitas > 0) break
      if (conferencias.recusadas >= 2) break
      if (erro && ERROS_DE_CONFIGURACAO.test(erro)) break
      token = await p.evaluate(() => document.querySelector('input[name="cf-turnstile-response"]')?.value || '')
      if (token) break
      await p.waitForTimeout(1000)
    }
    if (token || conferencias.aceitas > 0) return 'a Cloudflare aceitou o captcha do site'
    if (conferencias.recusadas >= 2 || (erro && ERROS_DE_CONFIGURACAO.test(erro))) {
      throw new Error(
        `a Cloudflare recusou o captcha${erro ? ` (${erro})` : ''}: ninguém consegue se cadastrar. ` +
          'O mais comum é o domínio não estar na lista de hostnames do widget (painel Cloudflare → Turnstile) ou a chave do site estar errada.'
      )
    }
    const temWidget = await p.evaluate(() => !!document.querySelector('iframe[src*="challenges.cloudflare.com"], input[name="cf-turnstile-response"]'))
    if (!temWidget) throw new Error('o captcha não apareceu na página')
    return `captcha apareceu, sem resposta da Cloudflare em ${TEMPO_DO_CAPTCHA_MS / 1000}s${erro ? ` (${erro})` : ''}`
  } finally {
    await navegador.close()
  }
}

const VERIFICACOES = [
  ['Página inicial', () => pagina('/', { contem: 'Licita Bela' })],
  ['API no ar', () => api('/api/health')],
  ['API com banco de dados', () => api('/api/health/ready')],
  ['Página de cadastro e captcha', captchaDoCadastro],
  ['Página de login', () => pagina('/login')],
  ['Sitemap', () => pagina('/sitemap.xml', { minimo: 100 })],
  ['Página pública de ramo', () => pagina('/licitacoes/limpeza')],
  ['Ícone do site', () => pagina('/favicon.ico')],
]

async function main() {
  const linhas = []
  let falhas = 0
  for (const [nome, verificar] of VERIFICACOES) {
    // Uma nova tentativa depois de 10 s evita alarme por um soluço de rede.
    let resultado
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      try {
        resultado = { ok: true, texto: await verificar() }
        break
      } catch (e) {
        resultado = { ok: false, texto: e instanceof Error ? e.message : String(e) }
        if (tentativa === 1) await new Promise((r) => setTimeout(r, 10_000))
      }
    }
    if (!resultado.ok) falhas++
    linhas.push(`- ${resultado.ok ? '✅' : '❌'} **${nome}**: ${resultado.texto}`)
  }
  const resumo = [
    falhas ? `## 🚨 ${falhas} problema(s) no site ${SITE}` : `## ✅ Site ${SITE} funcionando`,
    '',
    ...linhas,
    '',
    `Conferido em ${new Date().toISOString()}.`,
  ].join('\n')
  console.log(resumo)
  if (process.env.RELATORIO) fs.writeFileSync(process.env.RELATORIO, resumo)
  process.exitCode = falhas ? 1 : 0
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
