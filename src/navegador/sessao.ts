// ============================================================
// navegador/sessao.ts — Uma sessão do "portal dentro da Bela": um contexto novo do
// Chromium (sem nada salvo de antes), a tela transmitida em JPEG pelo WebSocket e o
// mouse/teclado da pessoa repassados para a página.
//
// Regras que não mudam:
//  - quem entra no portal é a pessoa: ela resolve o CAPTCHA e clica em "Entrar". Se ela
//    pedir, a Bela escreve no formulário o acesso salvo em Meus Portais, sem enviar;
//  - a Bela nunca clica em "enviar lance" nem confirma nada sozinha: só lê o lance e o
//    chat e, quando a pessoa pede, escreve o lance sugerido no campo;
//  - nada da sessão é guardado: ao fechar, o contexto (cookies, login) é descartado.
// ============================================================

import type { Browser, BrowserContext, CDPSession, Dialog, FileChooser, Page } from 'playwright-core'
import type { WebSocket } from 'ws'
import { scriptDoLeitor } from './leitor'
import {
  ALTURA_PADRAO,
  LARGURA_PADRAO,
  MAX_ARQUIVO_BYTES,
  navegacaoPermitida,
  teclaParaPlaywright,
  type MensagemDaWeb,
  type MensagemDoNavegador,
} from './protocolo'
import { ErroDaApi, type ApiDaBela } from './apiDaBela'

export interface LimitesDaSessao {
  /** Fecha depois deste tempo sem a página da Bela conectada. */
  semConexaoMs: number
  /** Fecha depois deste tempo sem mouse/teclado. */
  ociosaMs: number
  /** Duração máxima da sessão. */
  maximaMs: number
  /** Intervalo da leitura do lance e do chat. */
  leituraMs: number
  /** Hosts liberados em http, só para teste local. */
  hostsLocais?: string[]
}

export const LIMITES_PADRAO: LimitesDaSessao = {
  semConexaoMs: 2 * 60_000,
  ociosaMs: 30 * 60_000,
  maximaMs: 6 * 60 * 60_000,
  leituraMs: 1_500,
}

export interface DestinoDaSessao {
  /** Portal de Meus Portais aberto nesta sessão (ex.: COMPRASNET, BLL). */
  portal: string
  nomeDoPortal: string
  /** Primeira página: o processo no portal ou o início do portal. */
  inicio: string
  /** Domínios dos portais de compras liberados para navegação (além do gov.br). */
  hostsPermitidos: string[]
}

const FORA_DOS_PORTAIS = 'O navegador da Bela abre só os portais do governo e os portais de compras de Meus Portais.'

const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024
const MAX_BUFFER_WS = 3 * 1024 * 1024

export class SessaoDoPortal {
  readonly criadaEm = Date.now()
  private contexto: BrowserContext | null = null
  private paginas: Page[] = []
  private ativa: Page | null = null
  private cdp: CDPSession | null = null
  private cliente: WebSocket | null = null
  private ultimoUso = Date.now()
  private desconectadaEm: number | null = null
  private relogio: NodeJS.Timeout | null = null
  private leitura: NodeJS.Timeout | null = null
  private arquivoPendente: FileChooser | null = null
  private dialogoPendente: Dialog | null = null
  private ultimoLance: number | null = null
  private encerrada = false
  private largura = LARGURA_PADRAO
  private altura = ALTURA_PADRAO

  constructor(
    readonly userId: string,
    readonly tenderId: string,
    private token: string,
    private readonly api: ApiDaBela,
    private readonly destino: DestinoDaSessao,
    private readonly aoEncerrar: (s: SessaoDoPortal) => void,
    private readonly limites: LimitesDaSessao = LIMITES_PADRAO
  ) {}

  get portal(): string {
    return this.destino.portal
  }

  private get inicio(): string {
    return this.destino.inicio
  }

  private permitida(url: string): boolean {
    return navegacaoPermitida(url, this.limites.hostsLocais, this.destino.hostsPermitidos)
  }

  get fechada(): boolean {
    return this.encerrada
  }

  async iniciar(navegador: Browser): Promise<void> {
    this.contexto = await navegador.newContext({
      viewport: { width: this.largura, height: this.altura },
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      acceptDownloads: true,
    })
    await this.contexto.addInitScript({ content: scriptDoLeitor() })
    // Só a navegação da página principal é limitada aos portais do governo.
    await this.contexto.route('**/*', async (rota) => {
      const pedido = rota.request()
      if (ehNavegacaoPrincipal(pedido) && !this.permitida(pedido.url())) {
        this.enviar({ t: 'bloqueado', url: pedido.url().slice(0, 300), motivo: FORA_DOS_PORTAIS })
        await rota.abort('blockedbyclient')
        return
      }
      await rota.fallback()
    })
    this.contexto.on('page', (p) => void this.adotar(p))
    const primeira = await this.contexto.newPage()
    await this.adotar(primeira)
    await primeira.goto(this.inicio, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => {
      this.enviar({ t: 'aviso', mensagem: 'O portal demorou para abrir. Use "Recarregar" se a tela ficar em branco.' })
    })
    this.relogio = setInterval(() => void this.conferirLimites(), 15_000)
    this.leitura = setInterval(() => void this.ler(), this.limites.leituraMs)
  }

  // ---------- conexão com a página da Bela ----------

  conectar(ws: WebSocket, token: string): void {
    if (this.cliente && this.cliente !== ws) this.cliente.close(4000, 'Aberto em outra janela')
    this.cliente = ws
    this.token = token
    this.desconectadaEm = null
    this.ultimoUso = Date.now()
    this.enviar({ t: 'pronto', largura: this.largura, altura: this.altura, portal: this.destino.portal, nomeDoPortal: this.destino.nomeDoPortal })
    void this.anunciarEstado()
    void this.transmitir()
  }

  desconectar(ws: WebSocket): void {
    if (this.cliente !== ws) return
    this.cliente = null
    this.desconectadaEm = Date.now()
    void this.pararTransmissao()
  }

  private enviar(m: MensagemDoNavegador): void {
    const c = this.cliente
    if (c && c.readyState === c.OPEN) c.send(JSON.stringify(m))
  }

  // ---------- páginas e transmissão ----------

  private async adotar(p: Page): Promise<void> {
    this.paginas.push(p)
    p.on('close', () => {
      this.paginas = this.paginas.filter((x) => x !== p)
      if (this.ativa === p) void this.ativar(this.paginas[this.paginas.length - 1] ?? null)
    })
    p.on('framenavigated', (f) => {
      if (f === p.mainFrame() && p === this.ativa) void this.anunciarEstado()
    })
    p.on('filechooser', (fc) => {
      this.arquivoPendente = fc
      this.enviar({ t: 'pedido-de-arquivo', multiplo: fc.isMultiple() })
    })
    p.on('dialog', (d) => {
      this.dialogoPendente = d
      this.enviar({ t: 'dialogo', tipo: d.type(), mensagem: d.message().slice(0, 2000), padrao: d.defaultValue() })
    })
    p.on('download', (d) => void this.repassarDownload(d))
    // Janela nova (popup do gov.br, documento): passa a ser a que a pessoa vê.
    await this.ativar(p)
  }

  private async ativar(p: Page | null): Promise<void> {
    await this.pararTransmissao()
    this.ativa = p
    if (!p) return
    await p.setViewportSize({ width: this.largura, height: this.altura }).catch(() => undefined)
    await this.anunciarEstado()
    await this.transmitir()
  }

  private async transmitir(): Promise<void> {
    const p = this.ativa
    if (!p || !this.cliente || !this.contexto) return
    try {
      const cdp = await this.contexto.newCDPSession(p)
      this.cdp = cdp
      cdp.on('Page.screencastFrame', (quadro: { data: string; sessionId: number }) => {
        // Confirma sempre (senão o Chrome para de mandar); descarta se a conexão está lenta.
        void cdp.send('Page.screencastFrameAck', { sessionId: quadro.sessionId }).catch(() => undefined)
        const c = this.cliente
        if (c && c.readyState === c.OPEN && c.bufferedAmount < MAX_BUFFER_WS) c.send(Buffer.from(quadro.data, 'base64'))
      })
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, maxWidth: this.largura, maxHeight: this.altura, everyNthFrame: 1 })
    } catch {
      /* página fechando */
    }
  }

  private async pararTransmissao(): Promise<void> {
    const cdp = this.cdp
    this.cdp = null
    if (!cdp) return
    await cdp.send('Page.stopScreencast').catch(() => undefined)
    await cdp.detach().catch(() => undefined)
  }

  private async anunciarEstado(): Promise<void> {
    const p = this.ativa
    if (!p) return
    const url = p.url()
    let host = ''
    try {
      host = new URL(url).hostname
    } catch {
      /* about:blank */
    }
    const portal = await p.evaluate(() => (globalThis as unknown as { __bela?: { portal: string | null } }).__bela?.portal ?? null).catch(() => null)
    this.enviar({ t: 'estado', url: url.slice(0, 500), titulo: (await p.title().catch(() => '')).slice(0, 200), host, portal })
  }

  // ---------- comandos da pessoa ----------

  async receber(m: MensagemDaWeb): Promise<void> {
    const p = this.ativa
    if (m.t !== 'ping') this.ultimoUso = Date.now()
    switch (m.t) {
      case 'ping':
        this.enviar({ t: 'pong' })
        return
      case 'tamanho':
        this.largura = m.largura
        this.altura = m.altura
        if (p) await this.ativar(p)
        return
      case 'mouse':
        if (!p) return
        if (m.tipo === 'mover') await p.mouse.move(m.x, m.y)
        else {
          await p.mouse.move(m.x, m.y)
          if (m.tipo === 'descer') await p.mouse.down({ button: m.botao, clickCount: m.cliques })
          else await p.mouse.up({ button: m.botao, clickCount: m.cliques })
        }
        return
      case 'rolar':
        if (!p) return
        await p.mouse.move(m.x, m.y)
        await p.mouse.wheel(m.dx, m.dy)
        return
      case 'tecla': {
        if (!p) return
        const tecla = teclaParaPlaywright(m.tecla)
        if (!tecla) return
        // Caractere comum sem Ctrl/Alt/Meta: digita (gera keydown, input e keyup, inclusive "ç" e "ã").
        if (tecla.length === 1 && (m.modificadores & 7) === 0) {
          if (m.tipo === 'descer') await p.keyboard.type(tecla)
          return
        }
        if (m.tipo === 'descer') await p.keyboard.down(tecla)
        else await p.keyboard.up(tecla)
        return
      }
      case 'texto':
        if (p) await p.keyboard.insertText(m.texto)
        return
      case 'navegar':
        if (!p) return
        if (m.acao === 'voltar') await p.goBack({ timeout: 30_000 }).catch(() => undefined)
        else if (m.acao === 'avancar') await p.goForward({ timeout: 30_000 }).catch(() => undefined)
        else if (m.acao === 'recarregar') await p.reload({ timeout: 45_000 }).catch(() => undefined)
        else await p.goto(this.inicio, { timeout: 45_000 }).catch(() => undefined)
        return
      case 'ir':
        if (!p) return
        if (!this.permitida(m.url)) {
          this.enviar({ t: 'bloqueado', url: m.url, motivo: FORA_DOS_PORTAIS })
          return
        }
        await p.goto(m.url, { timeout: 45_000 }).catch(() => undefined)
        return
      case 'preencher-lance':
        await this.preencherLance(m.valor)
        return
      case 'preencher-login':
        await this.preencherLogin()
        return
      case 'arquivos': {
        const fc = this.arquivoPendente
        this.arquivoPendente = null
        if (!fc) return
        const arquivos = m.arquivos.map((a) => ({ name: a.nome, mimeType: a.tipo, buffer: Buffer.from(a.base64, 'base64') }))
        const total = arquivos.reduce((s, a) => s + a.buffer.length, 0)
        if (total > MAX_ARQUIVO_BYTES) {
          this.enviar({ t: 'aviso', mensagem: 'Arquivo grande demais (máximo 20 MB).' })
          return
        }
        await fc.setFiles(fc.isMultiple() ? arquivos : arquivos.slice(0, 1)).catch(() => this.enviar({ t: 'aviso', mensagem: 'O portal não aceitou o arquivo.' }))
        return
      }
      case 'dialogo': {
        const d = this.dialogoPendente
        this.dialogoPendente = null
        if (!d) return
        if (m.aceitar) await d.accept(m.texto).catch(() => undefined)
        else await d.dismiss().catch(() => undefined)
        return
      }
      case 'encerrar':
        await this.encerrar('Você fechou o portal.')
        return
      case 'entrar':
        return
    }
  }

  // Etapa 2 do robô dentro do navegador da Bela: só escreve o valor que a Bela
  // sugeriu (o mesmo do painel, que já respeita piso, limite de lances e a vedação
  // do edital). Quem confere e clica em enviar no portal é a pessoa.
  private async preencherLance(valor: number): Promise<void> {
    const p = this.ativa
    if (!p) return
    const painel = await this.api.painel(this.token, this.tenderId).catch(() => null)
    const robo = painel?.robo
    const instrucao = (robo?.instrucoes ?? []).find((i) => i.acao === 'dar' && typeof i.valor === 'number')
    if (!robo?.disponivel || !instrucao || Math.abs((instrucao.valor ?? 0) - valor) > 0.004) {
      this.enviar({
        t: 'lance-preenchido',
        ok: false,
        motivo: robo?.disponivel === false ? 'O edital veda robô: digite o lance à mão.' : 'O lance sugerido mudou. Confira o painel e tente de novo.',
      })
      return
    }
    for (const f of p.frames()) {
      const r = (await f
        .evaluate((v) => (globalThis as unknown as { __bela?: { preencherLance(v: number): unknown } }).__bela?.preencherLance(v) ?? null, valor)
        .catch(() => null)) as { ok: boolean; texto?: string; motivo?: string } | null
      if (r?.ok) {
        this.enviar({ t: 'lance-preenchido', ok: true, texto: r.texto })
        void this.api.registrarPreenchimento(this.token, this.tenderId, valor).catch(() => undefined)
        return
      }
    }
    this.enviar({ t: 'lance-preenchido', ok: false, motivo: 'Não achei o campo de lance nesta tela. Abra a sala de disputa do item.' })
  }

  // Login com o acesso de Meus Portais, quando a pessoa pede: a Bela só escreve o usuário
  // e a senha no formulário da tela. O CAPTCHA e o clique em "Entrar" são da pessoa.
  // A senha vem da API direto para cá e não passa pelo site nem fica guardada.
  private async preencherLogin(): Promise<void> {
    const p = this.ativa
    if (!p) return
    let host = ''
    try {
      host = new URL(p.url()).hostname
    } catch {
      /* about:blank */
    }
    if (!host) {
      this.enviar({ t: 'login-preenchido', ok: false, mensagem: 'Abra a tela de login do portal primeiro.' })
      return
    }
    let acesso: { login: string; senha: string }
    try {
      acesso = await this.api.acessoSalvo(this.token, this.tenderId, host)
    } catch (err) {
      this.enviar({ t: 'login-preenchido', ok: false, mensagem: err instanceof ErroDaApi ? err.message : 'Não consegui buscar o acesso salvo agora.' })
      return
    }
    try {
      for (const f of p.frames()) {
        const r = await preencherFormularioDeLogin(f, acesso.login, acesso.senha)
        if (!r) continue
        const mensagem =
          r === 'tudo'
            ? 'Usuário e senha de Meus Portais escritos na tela. Resolva o CAPTCHA, se houver, e clique em Entrar.'
            : r === 'so-login'
              ? 'Usuário escrito na tela. Clique em Continuar e, na tela da senha, clique de novo em "Preencher meu login".'
              : 'Senha escrita na tela. Confira o usuário e clique em Entrar.'
        this.enviar({ t: 'login-preenchido', ok: true, mensagem })
        return
      }
      this.enviar({ t: 'login-preenchido', ok: false, mensagem: 'Não achei o formulário de login nesta tela. Abra a página "Entrar" do portal e tente de novo.' })
    } finally {
      acesso.senha = ''
    }
  }

  // ---------- leitura do lance e do chat ----------

  private async ler(): Promise<void> {
    const p = this.ativa
    if (!p || this.encerrada) return
    let melhor: number | null = null
    const mensagens: unknown[] = []
    for (const f of p.frames()) {
      const r = (await f.evaluate(() => (globalThis as unknown as { __bela?: { ler(): unknown } }).__bela?.ler() ?? null).catch(() => null)) as {
        melhorLance: number | null
        mensagens: unknown[]
      } | null
      if (!r) continue
      if (melhor === null && r.melhorLance !== null) melhor = r.melhorLance
      mensagens.push(...r.mensagens)
    }
    let mudou = false
    if (melhor !== null && melhor !== this.ultimoLance) {
      this.ultimoLance = melhor
      mudou = true
      void this.api.registrarMelhorLance(this.token, this.tenderId, melhor).catch(() => undefined)
    }
    if (mensagens.length > 0) {
      mudou = true
      void this.api.registrarMensagens(this.token, this.tenderId, mensagens.slice(-50)).catch(() => undefined)
    }
    if (mudou) this.enviar({ t: 'leitura', melhorLance: this.ultimoLance, mensagensNovas: mensagens.length })
  }

  // ---------- downloads, limites, fim ----------

  private async repassarDownload(d: import('playwright-core').Download): Promise<void> {
    try {
      const fluxo = await d.createReadStream()
      const partes: Buffer[] = []
      let total = 0
      for await (const parte of fluxo) {
        total += (parte as Buffer).length
        if (total > MAX_DOWNLOAD_BYTES) {
          this.enviar({ t: 'aviso', mensagem: 'O arquivo baixado passa de 25 MB e não foi repassado.' })
          await d.cancel().catch(() => undefined)
          return
        }
        partes.push(parte as Buffer)
      }
      const nome = d.suggestedFilename().slice(0, 200)
      this.enviar({ t: 'download', nome, tipo: tipoPeloNome(nome), base64: Buffer.concat(partes).toString('base64') })
    } catch {
      this.enviar({ t: 'aviso', mensagem: 'Não consegui baixar o arquivo.' })
    }
  }

  private async conferirLimites(): Promise<void> {
    const agora = Date.now()
    if (agora - this.criadaEm > this.limites.maximaMs) return this.encerrar('A sessão chegou ao tempo máximo. Abra o portal de novo.')
    if (this.desconectadaEm && agora - this.desconectadaEm > this.limites.semConexaoMs) return this.encerrar('A página da Bela ficou fechada.')
    if (agora - this.ultimoUso > this.limites.ociosaMs) return this.encerrar('Sessão parada há muito tempo.')
  }

  async encerrar(motivo: string): Promise<void> {
    if (this.encerrada) return
    this.encerrada = true
    if (this.relogio) clearInterval(this.relogio)
    if (this.leitura) clearInterval(this.leitura)
    this.enviar({ t: 'encerrada', motivo })
    await this.pararTransmissao()
    await this.contexto?.close().catch(() => undefined)
    this.contexto = null
    this.cliente?.close(1000, 'Sessão encerrada')
    this.cliente = null
    this.aoEncerrar(this)
  }
}

function ehNavegacaoPrincipal(pedido: import('playwright-core').Request): boolean {
  if (!pedido.isNavigationRequest()) return false
  try {
    const f = pedido.frame()
    return f === f.page().mainFrame()
  } catch {
    return false // pedido de service worker: não é a página principal
  }
}

function tipoPeloNome(nome: string): string {
  const ext = nome.toLowerCase().split('.').pop() ?? ''
  const tipos: Record<string, string> = {
    pdf: 'application/pdf',
    zip: 'application/zip',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    csv: 'text/csv',
    txt: 'text/plain',
  }
  return tipos[ext] ?? 'application/octet-stream'
}

// Marca na página o campo da senha e o campo do usuário (o texto antes da senha, no mesmo
// formulário; sem senha na tela, um campo com cara de CPF/usuário/e-mail). Roda no portal,
// por isso é texto: o valor da senha não entra aqui, só é escrito depois pelo Playwright.
const MARCAR_LOGIN = `(() => {
  for (const e of document.querySelectorAll('[data-bela-login],[data-bela-senha]')) { e.removeAttribute('data-bela-login'); e.removeAttribute('data-bela-senha') }
  const visivel = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' }
  const editavel = (el) => !el.disabled && !el.readOnly && visivel(el)
  const campos = [...document.querySelectorAll('input')]
  const deTexto = (i) => ['text', 'email', 'tel', 'number', ''].includes((i.getAttribute('type') || '').toLowerCase()) && editavel(i)
  const senha = campos.find((i) => i.type === 'password' && editavel(i))
  let login
  if (senha) {
    const antes = campos.slice(0, campos.indexOf(senha)).filter(deTexto)
    const doFormulario = senha.form ? antes.filter((i) => i.form === senha.form) : []
    const lista = doFormulario.length ? doFormulario : antes
    login = lista[lista.length - 1]
    senha.setAttribute('data-bela-senha', '1')
  } else {
    const cara = /cpf|cnpj|login|usu[aá]rio|user|e-?mail|documento|conta|account/i
    login = campos.find((i) => deTexto(i) && cara.test([i.name, i.id, i.placeholder, i.getAttribute('aria-label') || '', i.autocomplete].join(' ')))
  }
  if (login) login.setAttribute('data-bela-login', '1')
  return { senha: !!senha, login: !!login }
})()`

const DESMARCAR_LOGIN = `(() => { for (const e of document.querySelectorAll('[data-bela-login],[data-bela-senha]')) { e.removeAttribute('data-bela-login'); e.removeAttribute('data-bela-senha') } })()`

/** Escreve usuário e senha no formulário de login deste frame. Nunca clica em "Entrar". */
export async function preencherFormularioDeLogin(
  f: import('playwright-core').Frame,
  login: string,
  senha: string
): Promise<'tudo' | 'so-login' | 'so-senha' | null> {
  const marcado = (await f.evaluate(MARCAR_LOGIN).catch(() => null)) as { senha: boolean; login: boolean } | null
  if (!marcado || (!marcado.senha && !marcado.login)) return null
  try {
    if (marcado.login) await f.locator('[data-bela-login]').first().fill(login, { timeout: 5_000 })
    if (marcado.senha) await f.locator('[data-bela-senha]').first().fill(senha, { timeout: 5_000 })
  } catch {
    return null
  } finally {
    await f.evaluate(DESMARCAR_LOGIN).catch(() => undefined)
  }
  return marcado.senha ? (marcado.login ? 'tudo' : 'so-senha') : 'so-login'
}
