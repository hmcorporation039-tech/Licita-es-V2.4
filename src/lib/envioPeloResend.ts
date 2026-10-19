import { Resend } from 'resend'

type MensagemDoResend = Parameters<Resend['emails']['send']>[0]

export class EnvioRecusadoPeloResend extends Error {}

export async function enviarPeloResend(cliente: Resend, mensagem: MensagemDoResend): Promise<void> {
  const { error } = await cliente.emails.send(mensagem)
  if (error) throw new EnvioRecusadoPeloResend(`Resend recusou o e-mail (${error.name}): ${error.message}`)
}
