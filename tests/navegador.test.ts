// ============================================================
// Serviço "portal dentro da Bela" com um Chromium de verdade e um portal falso local.
// O host do portal falso é resolvido para 127.0.0.1 (host-resolver-rules), assim a leitura
// usa os mesmos seletores da extensão para o Compras.gov.br. Pula se não houver Chromium.
// ============================================================

import http from 'node:http'
import { existsSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { chromium } from 'playwright-core'
import { criarServidor } from '../src/navegador/server'
import { moduloComoBloco, scriptDoLeitor } from '../src/navegador/leitor'
import { navegacaoPermitida, teclaParaPlaywright } from '../src/navegador/protocolo'
import type { ApiDaBela } from '../src/navegador/apiDaBela'

const HOST_DO_PORTAL = 'cnetmobile.estaleiro.serpro.gov.br'
const TENDER = '6f1d2c3b-4a5e-4f60-9a7b-8c9d0e1f2a3b'
const temChromium = (() => {
  try {
    return existsSync(chromium.executablePath())
  } catch {
    return false
  }
})()

const PAGINA = `<!doctype html><html><head><meta charset="utf-8"><title>Sala de disputa</title></head><body>
<h1>Item 1</h1>
<div>Melhor lance: <span id="melhorLance">R$ 1.234,56</span></div>
<ul class="chat"><li class="mensagem"><b>Pregoeiro</b> <span class="hora">10:01</span> <p class="texto">Senhores, a etapa aberta vai começar.</p></li></ul>
<label>Seu lance <input id="campoLance" formcontrolname="valorLance" style="width:200px"></label>
<input id="eco" style="position:absolute;left:10px;top:300px;width:300px;height:30px">
<a id="fora" href="https://example.com/">fora</a>
<script>
document.getElementById('eco').addEventListener('input', (e) => { if (e.target.value === 'olá') location.href = '/digitou' })
</script>
</body></html>`

const LOGIN = `<!doctype html><html><head><meta charset="utf-8"><title>Entrar</title></head><body>
<input type="hidden" name="csrf" value="x">
<input id="busca" placeholder="Buscar no site">
<form id="f" onsubmit="document.title='ENVIADO';return false">
<label>CPF <input id="usuario" name="cpf"></label>
<label>Senha <input id="senha" type="password" name="senha"></label>
<button>Entrar</button>
</form></body></html>`

describe('regras do navegador da Bela', () => {
  it('só navega para portais do governo em https', () => {
    expect(navegacaoPermitida('https://www.comprasnet.gov.br/seguro/loginPortal.asp')).toBe(true)
    expect(navegacaoPermitida('https://sso.acesso.gov.br/login')).toBe(true)
    expect(navegacaoPermitida('http://www.comprasnet.gov.br/')).toBe(false)
    expect(navegacaoPermitida('https://example.com/')).toBe(false)
    expect(navegacaoPermitida('https://gov.br.example.com/')).toBe(false)
    expect(navegacaoPermitida('about:blank')).toBe(true)
    expect(navegacaoPermitida('http://localhost:3000/', ['localhost'])).toBe(true)
  })

  it('também navega para os portais de compras de Meus Portais', () => {
    const portais = ['bllcompras.com', 'licitanet.com.br']
    expect(navegacaoPermitida('https://www.bllcompras.com/Process', [], portais)).toBe(true)
    expect(navegacaoPermitida('https://licitanet.com.br/', [], portais)).toBe(true)
    expect(navegacaoPermitida('http://licitanet.com.br/', [], portais)).toBe(false)
    expect(navegacaoPermitida('https://licitanet.com.br.example.com/', [], portais)).toBe(false)
  })

  it('traduz as teclas e recusa nomes estranhos', () => {
    expect(teclaParaPlaywright('a')).toBe('a')
    expect(teclaParaPlaywright('ç')).toBe('ç')
    expect(teclaParaPlaywright(' ')).toBe('Space')
    expect(teclaParaPlaywright('Enter')).toBe('Enter')
    expect(teclaParaPlaywright('Dead')).toBe('Dead')
    expect(teclaParaPlaywright('Unidentified-x')).toBeNull()
  })

  it('converte os módulos da extensão num script sem import/export', () => {
    const bloco = moduloComoBloco('lib/proposta.mjs', "import { a, b } from './preencher.mjs'\nexport function c() { return a + b }\nconst d = 1\n")
    expect(bloco).toContain('const { a, b } = m_preencher;')
    expect(bloco).toContain('return { c };')
    const script = scriptDoLeitor()
    expect(script).not.toMatch(/^\s*(import|export)\b/m)
    expect(() => new Function(script)).not.toThrow()
  })
})

describe.skipIf(!temChromium)('portal dentro da Bela (Chromium real)', () => {
  let portal: http.Server
  let portaDoPortal = 0
  let base = ''
  let servico: ReturnType<typeof criarServidor>
  const chamadas: { tipo: string; dados: unknown }[] = []

  const api: ApiDaBela = {
    autorizar: async (token, tenderId) => {
      if (token !== 'token-valido-123') throw Object.assign(new Error('Sessão expirada'), { status: 401 })
      return { userId: 'u1', companyId: 'c1', tenderId, inicio: `http://${HOST_DO_PORTAL}:${portaDoPortal}/sala`, portal: 'COMPRASNET', nomeDoPortal: 'Compras.gov.br', hostsPermitidos: [] }
    },
    acessoSalvo: async (_t, _id, host) => {
      chamadas.push({ tipo: 'acesso', dados: host })
      return { portal: 'COMPRASNET', login: '123.456.789-00', senha: 'senha-secreta-1' }
    },
    painel: async () => ({ robo: { disponivel: true, instrucoes: [{ alvo: 'global', acao: 'dar', valor: 1230 }] } }),
    registrarMelhorLance: async (_t, _id, valor) => void chamadas.push({ tipo: 'lance', dados: valor }),
    registrarMensagens: async (_t, _id, mensagens) => void chamadas.push({ tipo: 'mensagens', dados: mensagens }),
    registrarPreenchimento: async (_t, _id, valor) => void chamadas.push({ tipo: 'preenchido', dados: valor }),
  }

  beforeAll(async () => {
    portal = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(req.url === '/digitou' ? '<title>Digitou</title><p>ok</p>' : req.url === '/login' ? LOGIN : PAGINA)
    })
    await new Promise<void>((r) => portal.listen(0, '127.0.0.1', () => r()))
    portaDoPortal = (portal.address() as AddressInfo).port
    servico = criarServidor({
      api,
      origens: ['http://bela.test'],
      maxSessoes: 1,
      abrirNavegador: () => chromium.launch({ headless: true, args: ['--no-sandbox', `--host-resolver-rules=MAP ${HOST_DO_PORTAL} 127.0.0.1`] }),
      limites: { semConexaoMs: 60_000, ociosaMs: 60_000, maximaMs: 120_000, leituraMs: 300, hostsLocais: [HOST_DO_PORTAL] },
    })
    await new Promise<void>((r) => servico.servidor.listen(0, '127.0.0.1', () => r()))
    base = `ws://127.0.0.1:${(servico.servidor.address() as AddressInfo).port}/sessao`
  }, 60_000)

  afterAll(async () => {
    await servico?.fechar()
    portal?.close()
  }, 60_000)

  function conectar(origem = 'http://bela.test') {
    const ws = new WebSocket(base, { headers: { origin: origem } })
    const textos: Record<string, unknown>[] = []
    const quadros: Buffer[] = []
    ws.on('message', (d, binario) => {
      if (binario) quadros.push(d as Buffer)
      else textos.push(JSON.parse(String(d)))
    })
    const esperar = async (cond: () => unknown, ms = 20_000) => {
      const fim = Date.now() + ms
      while (Date.now() < fim) {
        const v = cond()
        if (v) return v
        await new Promise((r) => setTimeout(r, 50))
      }
      throw new Error(`Tempo esgotado. Mensagens: ${JSON.stringify(textos.slice(-5))}`)
    }
    const aberto = new Promise<void>((r, j) => {
      ws.once('open', () => r())
      ws.once('error', j)
    })
    const mandar = (m: unknown) => ws.send(JSON.stringify(m))
    return { ws, textos, quadros, esperar, aberto, mandar }
  }

  it('recusa origem desconhecida e token inválido', async () => {
    const estranho = conectar('https://outro-site.com')
    await expect(estranho.aberto).rejects.toThrow(/403/)

    const c = conectar()
    await c.aberto
    c.mandar({ t: 'entrar', token: 'token-invalido-000', tenderId: TENDER })
    await c.esperar(() => c.textos.find((m) => m.t === 'erro'))
  })

  it('abre o portal, transmite a tela, lê lance e chat, repassa teclado e preenche o lance sem enviar', async () => {
    const c = conectar()
    await c.aberto
    c.mandar({ t: 'entrar', token: 'token-valido-123', tenderId: TENDER })
    await c.esperar(() => c.textos.find((m) => m.t === 'pronto'))
    await c.esperar(() => c.textos.find((m) => m.t === 'estado' && m.portal === 'Compras.gov.br'))

    // A tela chega como JPEG.
    const quadro = (await c.esperar(() => c.quadros[0])) as Buffer
    expect(quadro.subarray(0, 2).toString('hex')).toBe('ffd8')

    // Leitura: melhor lance e chat vão para a API da Bela com o token da pessoa.
    await c.esperar(() => c.textos.find((m) => m.t === 'leitura' && m.melhorLance === 1234.56))
    await c.esperar(() => chamadas.find((x) => x.tipo === 'lance' && x.dados === 1234.56))
    const msgs = (await c.esperar(() => chamadas.find((x) => x.tipo === 'mensagens'))) as { dados: { texto: string }[] }
    expect(msgs.dados[0].texto).toContain('etapa aberta')

    // Lance diferente do sugerido é recusado; o sugerido é escrito no campo (nunca enviado).
    c.mandar({ t: 'preencher-lance', valor: 999 })
    await c.esperar(() => c.textos.find((m) => m.t === 'lance-preenchido' && m.ok === false))
    c.mandar({ t: 'preencher-lance', valor: 1230 })
    const ok = (await c.esperar(() => c.textos.find((m) => m.t === 'lance-preenchido' && m.ok === true))) as { texto: string }
    expect(ok.texto).toBe('1.230,00')
    await c.esperar(() => chamadas.find((x) => x.tipo === 'preenchido' && x.dados === 1230))

    // Navegação para fora do gov.br é bloqueada.
    c.mandar({ t: 'ir', url: 'https://example.com/' })
    await c.esperar(() => c.textos.find((m) => m.t === 'bloqueado'))

    // Clique e digitação da pessoa chegam à página (com acento).
    c.mandar({ t: 'mouse', tipo: 'descer', x: 60, y: 315 })
    c.mandar({ t: 'mouse', tipo: 'subir', x: 60, y: 315 })
    for (const tecla of ['o', 'l', 'á']) c.mandar({ t: 'tecla', tipo: 'descer', tecla, modificadores: 0 })
    await c.esperar(() => c.textos.find((m) => m.t === 'estado' && String(m.url).endsWith('/digitou')))

    // Login com o acesso de Meus Portais: escreve CPF e senha no formulário, sem enviar.
    c.mandar({ t: 'ir', url: `http://${HOST_DO_PORTAL}:${portaDoPortal}/login` })
    await c.esperar(() => c.textos.find((m) => m.t === 'estado' && String(m.url).endsWith('/login')))
    c.mandar({ t: 'preencher-login' })
    const login = (await c.esperar(() => c.textos.find((m) => m.t === 'login-preenchido'))) as { ok: boolean }
    expect(login.ok).toBe(true)
    expect(chamadas.find((x) => x.tipo === 'acesso')?.dados).toBe(HOST_DO_PORTAL)
    // A senha nunca vai para o site da Bela.
    expect(JSON.stringify(c.textos)).not.toContain('senha-secreta-1')
    const pagina = [...servico.sessoes.values()][0] as unknown as { ativa: import('playwright-core').Page }
    expect(await pagina.ativa.inputValue('#usuario')).toBe('123.456.789-00')
    expect(await pagina.ativa.inputValue('#senha')).toBe('senha-secreta-1')
    expect(await pagina.ativa.inputValue('#busca')).toBe('')
    expect(await pagina.ativa.title()).toBe('Entrar')

    // Uma sessão por pessoa: reconectar reaproveita a mesma.
    c.ws.close()
    const d = conectar()
    await d.aberto
    d.mandar({ t: 'entrar', token: 'token-valido-123', tenderId: TENDER })
    await d.esperar(() => d.textos.find((m) => m.t === 'pronto'))
    expect(servico.sessoes.size).toBe(1)

    d.mandar({ t: 'encerrar' })
    await d.esperar(() => d.textos.find((m) => m.t === 'encerrada'))
    await c.esperar(() => servico.sessoes.size === 0)
  }, 90_000)
})
