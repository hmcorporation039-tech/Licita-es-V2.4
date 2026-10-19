import { describe, expect, it } from 'vitest'
import type { Resend } from 'resend'
import { EnvioRecusadoPeloResend, enviarPeloResend } from '../src/lib/envioPeloResend'

function clienteQueResponde(resposta: unknown): Resend {
  return { emails: { send: async () => resposta } } as unknown as Resend
}

const mensagem = { from: 'a@b.com', to: 'c@d.com', subject: 'x', html: '<p>x</p>' }

describe('envio pelo Resend', () => {
  it('erro devolvido pelo Resend vira exceção com o motivo, em vez de passar calado', async () => {
    const cliente = clienteQueResponde({ data: null, error: { name: 'validation_error', message: 'The associated domain with your API key is not verified.' } })
    await expect(enviarPeloResend(cliente, mensagem)).rejects.toBeInstanceOf(EnvioRecusadoPeloResend)
    await expect(enviarPeloResend(cliente, mensagem)).rejects.toThrow(/not verified/)
  })

  it('envio aceito não lança', async () => {
    await expect(enviarPeloResend(clienteQueResponde({ data: { id: '1' }, error: null }), mensagem)).resolves.toBeUndefined()
  })
})
