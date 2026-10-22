import http from 'node:http'
import net from 'node:net'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRateLimitedClient, enderecoDaPonteSemSenha } from '../src/lib/httpClient'

describe('ponte no Brasil', () => {
  let alvo: http.Server
  let ponte: http.Server
  let portaDoAlvo = 0
  let portaDaPonte = 0
  const tuneis: { destino: string; autorizacao: string | undefined }[] = []
  const enderecoAnterior = process.env.PROXY_BRASIL_URL

  beforeAll(async () => {
    alvo = http.createServer((_req, res) => res.end('resposta do portal'))
    ponte = http.createServer((_req, res) => res.writeHead(405).end())
    ponte.on('connect', (req, cliente, inicio) => {
      tuneis.push({ destino: String(req.url), autorizacao: req.headers['proxy-authorization'] })
      const [host, porta] = String(req.url).split(':')
      const servidor = net.connect(Number(porta), host, () => {
        cliente.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        servidor.write(inicio)
        servidor.pipe(cliente)
        cliente.pipe(servidor)
      })
    })
    await new Promise<void>((ok) => alvo.listen(0, '127.0.0.1', ok))
    await new Promise<void>((ok) => ponte.listen(0, '127.0.0.1', ok))
    portaDoAlvo = (alvo.address() as AddressInfo).port
    portaDaPonte = (ponte.address() as AddressInfo).port
  })

  afterAll(async () => {
    if (enderecoAnterior === undefined) delete process.env.PROXY_BRASIL_URL
    else process.env.PROXY_BRASIL_URL = enderecoAnterior
    alvo.closeAllConnections()
    ponte.closeAllConnections()
    await new Promise((ok) => alvo.close(ok))
    await new Promise((ok) => ponte.close(ok))
  })

  it('o cliente marcado sai pela ponte com usuário e senha, e o comum sai direto', async () => {
    process.env.PROXY_BRASIL_URL = `http://licitabela:segredo@127.0.0.1:${portaDaPonte}`
    const pelaPonte = createRateLimitedClient(`http://127.0.0.1:${portaDoAlvo}`, 0, undefined, { pelaPonteNoBrasil: true })
    const direto = createRateLimitedClient(`http://127.0.0.1:${portaDoAlvo}`, 0)

    expect((await pelaPonte.get('/licitacoes')).data).toBe('resposta do portal')
    expect(tuneis).toEqual([{ destino: `127.0.0.1:${portaDoAlvo}`, autorizacao: `Basic ${Buffer.from('licitabela:segredo').toString('base64')}` }])

    expect((await direto.get('/licitacoes')).data).toBe('resposta do portal')
    expect(tuneis).toHaveLength(1)
  })

  it('sem a variável, o cliente marcado sai direto', async () => {
    delete process.env.PROXY_BRASIL_URL
    const antes = tuneis.length
    const cliente = createRateLimitedClient(`http://127.0.0.1:${portaDoAlvo}`, 0, undefined, { pelaPonteNoBrasil: true })
    expect((await cliente.get('/')).data).toBe('resposta do portal')
    expect(tuneis).toHaveLength(antes)
  })

  it('o log mostra o endereço da ponte sem a senha', () => {
    expect(enderecoDaPonteSemSenha('http://licitabela:segredo@163.176.53.160:48231')).toBe('163.176.53.160:48231')
    expect(enderecoDaPonteSemSenha('  ')).toBeNull()
    expect(enderecoDaPonteSemSenha(undefined)).toBeNull()
    expect(enderecoDaPonteSemSenha('não é url')).toBe('endereço inválido')
  })
})
