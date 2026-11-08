// ============================================================
// navegador/server.ts — Serviço "navegador da Bela" (um serviço próprio no Railway).
// Abre um Chromium e, para cada pessoa, uma sessão isolada com o portal de compras,
// transmitida por WebSocket para a página "Pregão com a Bela".
//
// Variáveis:
//   PORT                  porta HTTP/WebSocket (Railway define)
//   API_URL               URL da API da Bela (ex.: https://api-production-xxxx.up.railway.app)
//   NAVEGADOR_ORIGENS     origens do site que podem conectar (vírgula). Ex.: https://licitabela.com.br
//   NAVEGADOR_MAX_SESSOES quantas sessões ao mesmo tempo (padrão 3; cada uma usa ~300-500 MB)
//   CHROMIUM_PATH         caminho do Chromium (a imagem do Playwright já traz; normalmente vazio)
// Só para desenvolvimento: NAVEGADOR_HOSTS_LOCAIS (hosts liberados em http) e NAVEGADOR_CHROMIUM_ARGS.
// ============================================================

import http from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { chromium, type Browser } from 'playwright-core'
import { mensagemDaWeb, type MensagemDoNavegador } from './protocolo'
import { SessaoDoPortal, LIMITES_PADRAO, type LimitesDaSessao } from './sessao'
import { apiDaBela, ErroDaApi, type ApiDaBela } from './apiDaBela'

export interface OpcoesDoServidor {
  api: ApiDaBela
  origens: string[]
  maxSessoes: number
  abrirNavegador: () => Promise<Browser>
  limites?: LimitesDaSessao
  /** Espera pela mensagem "entrar" depois de conectar. */
  esperaParaEntrarMs?: number
}

const enviar = (ws: WebSocket, m: MensagemDoNavegador) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m))
}

export function criarServidor(op: OpcoesDoServidor) {
  const sessoes = new Map<string, SessaoDoPortal>()
  let navegador: Browser | null = null
  let abrindo: Promise<Browser> | null = null

  async function obterNavegador(): Promise<Browser> {
    if (navegador?.isConnected()) return navegador
    if (!abrindo) {
      abrindo = op.abrirNavegador().then((b) => {
        navegador = b
        b.on('disconnected', () => {
          navegador = null
          for (const s of [...sessoes.values()]) void s.encerrar('O navegador da Bela reiniciou. Abra o portal de novo.')
        })
        return b
      })
      abrindo.finally(() => (abrindo = null)).catch(() => undefined)
    }
    return abrindo
  }

  const servidor = http.createServer((req, res) => {
    if (req.url === '/saude') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, sessoes: sessoes.size, max: op.maxSessoes }))
      return
    }
    res.writeHead(404).end()
  })

  const wss = new WebSocketServer({ noServer: true, maxPayload: 30 * 1024 * 1024 })

  servidor.on('upgrade', (req, socket, cabeca) => {
    const origem = req.headers.origin ?? ''
    if (!req.url?.startsWith('/sessao') || !op.origens.includes(origem)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, cabeca, (ws) => wss.emit('connection', ws))
  })

  wss.on('connection', (ws: WebSocket) => {
    let sessao: SessaoDoPortal | null = null
    let entrando = false
    let fila: Promise<void> = Promise.resolve()
    const prazo = setTimeout(() => {
      if (!sessao) ws.close(4001, 'Sem identificação')
    }, op.esperaParaEntrarMs ?? 10_000)

    ws.on('message', async (dados, binario) => {
      if (binario) return
      let bruto: unknown
      try {
        bruto = JSON.parse(String(dados))
      } catch {
        return
      }
      const lido = mensagemDaWeb.safeParse(bruto)
      if (!lido.success) return
      const m = lido.data

      if (m.t === 'entrar') {
        if (sessao || entrando) return
        entrando = true
        try {
          const aut = await op.api.autorizar(m.token, m.tenderId)
          const existente = sessoes.get(aut.userId)
          if (existente && !existente.fechada && existente.tenderId === aut.tenderId) {
            sessao = existente
          } else {
            if (existente) await existente.encerrar('Você abriu o portal em outra licitação.')
            if (sessoes.size >= op.maxSessoes) {
              enviar(ws, { t: 'erro', codigo: 'LOTADO', mensagem: 'Todos os navegadores da Bela estão em uso agora. Tente de novo em alguns minutos ou use a extensão.' })
              ws.close(4003, 'Lotado')
              return
            }
            const nova = new SessaoDoPortal(aut.userId, aut.tenderId, m.token, op.api, aut.inicio, (s) => {
              if (sessoes.get(s.userId) === s) sessoes.delete(s.userId)
            }, op.limites ?? LIMITES_PADRAO)
            sessoes.set(aut.userId, nova)
            try {
              await nova.iniciar(await obterNavegador())
            } catch (err) {
              await nova.encerrar('Não consegui abrir o navegador.')
              throw err
            }
            sessao = nova
          }
          clearTimeout(prazo)
          sessao.conectar(ws, m.token)
        } catch (err) {
          const e = err instanceof ErroDaApi ? err : null
          enviar(ws, { t: 'erro', codigo: e?.codigo ?? (e ? `HTTP_${e.status}` : 'FALHA'), mensagem: e?.message ?? 'Não consegui abrir o portal agora.' })
          if (!e) console.error('[Navegador] falha ao abrir sessão:', err instanceof Error ? err.message : err)
          ws.close(4002, 'Não autorizado')
        } finally {
          entrando = false
        }
        return
      }
      if (!sessao || sessao.fechada) return
      const alvo = sessao
      // Em ordem: "descer" do mouse antes do "subir", letra antes da letra seguinte.
      fila = fila.then(async () => {
        try {
          await alvo.receber(m)
        } catch (err) {
          enviar(ws, { t: 'aviso', mensagem: 'O portal não respondeu a esse comando.' })
          console.error('[Navegador] comando falhou:', m.t, err instanceof Error ? err.message : err)
        }
      })
    })

    ws.on('close', () => {
      clearTimeout(prazo)
      sessao?.desconectar(ws)
    })
  })

  return {
    servidor,
    sessoes,
    async fechar() {
      for (const s of [...sessoes.values()]) await s.encerrar('O navegador da Bela foi desligado.')
      wss.close()
      await new Promise<void>((r) => servidor.close(() => r()))
      await navegador?.close().catch(() => undefined)
    },
  }
}

if (require.main === module) {
  const apiUrl = process.env.API_URL?.trim()
  const origens = (process.env.NAVEGADOR_ORIGENS ?? '').split(',').map((o) => o.trim()).filter(Boolean)
  if (!apiUrl || origens.length === 0) {
    console.error('[Navegador] Defina API_URL e NAVEGADOR_ORIGENS.')
    process.exit(1)
  }
  const { servidor, fechar } = criarServidor({
    api: apiDaBela(apiUrl),
    origens,
    maxSessoes: Number(process.env.NAVEGADOR_MAX_SESSOES) > 0 ? Number(process.env.NAVEGADOR_MAX_SESSOES) : 3,
    limites: { ...LIMITES_PADRAO, hostsLocais: (process.env.NAVEGADOR_HOSTS_LOCAIS ?? '').split(',').map((h) => h.trim()).filter(Boolean) },
    abrirNavegador: () =>
      chromium.launch({
        headless: true,
        executablePath: process.env.CHROMIUM_PATH || undefined,
        // Sem disfarce: o navegador se apresenta como é (não burla proteção do portal).
        args: ['--no-sandbox', '--disable-dev-shm-usage', ...(process.env.NAVEGADOR_CHROMIUM_ARGS ?? '').split(/\s+(?=--)/).map((a) => a.trim()).filter(Boolean)],
      }),
  })
  const porta = Number(process.env.PORT) || 8080
  servidor.listen(porta, () => console.log(`[Navegador] ouvindo na porta ${porta}`))
  for (const sinal of ['SIGTERM', 'SIGINT'] as const) process.on(sinal, () => void fechar().then(() => process.exit(0)))
}
