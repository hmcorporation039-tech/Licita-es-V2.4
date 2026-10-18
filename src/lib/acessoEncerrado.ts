export const CODIGO_ACESSO_EXPIRADO = 'ACESSO_EXPIRADO'
export const PLANO_DE_TESTE = 'TESTE'

const DIA_EM_BRASILIA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })

export type PedidoDeAcessoEncerrado = 'continuar' | 'exportar'

export function acessoExpirou(accessExpiresAt: Date | null | undefined, agora: Date = new Date()): boolean {
  return Boolean(accessExpiresAt && accessExpiresAt.getTime() < agora.getTime())
}

export function mensagemDeAcessoEncerrado(acessoAte: Date, emTeste: boolean): string {
  const dia = DIA_EM_BRASILIA.format(acessoAte)
  return emTeste
    ? `Seu teste grátis terminou em ${dia}. Seus dados continuam guardados: fale com a equipe do Monitor para assinar ou pedir uma cópia deles.`
    : `O prazo de acesso da sua conta terminou em ${dia}. Seus dados continuam guardados: fale com a equipe do Monitor para renovar ou pedir uma cópia deles.`
}

export function detalhesDoAcessoEncerrado(acessoAte: Date, planCode: string | null | undefined): Record<string, unknown> {
  return { code: CODIGO_ACESSO_EXPIRADO, acessoAte: acessoAte.toISOString(), emTeste: planCode === PLANO_DE_TESTE }
}

export function avisoDoPedidoDeAcessoEncerrado(
  pedido: PedidoDeAcessoEncerrado,
  dados: { email: string; empresa: string | null; companyId: string; planCode: string | null; acessoAte: Date }
): { assunto: string; texto: string; resposta: string } {
  const quando = DIA_EM_BRASILIA.format(dados.acessoAte)
  const quem = `Empresa: ${dados.empresa ?? '(sem nome)'} (${dados.companyId})\nE-mail da conta: ${dados.email}\nPlano: ${dados.planCode ?? '(sem plano)'}\nAcesso terminou em: ${quando}`
  if (pedido === 'exportar') {
    return {
      assunto: 'Pedido de cópia dos dados de conta com acesso encerrado (LGPD)',
      texto: `${quem}\n\nA pessoa pediu a exportação dos dados (LGPD, art. 18). Prazo legal: até 15 dias. Gere o arquivo (o mesmo de /api/conta/meus-dados) e envie ao e-mail da conta.`,
      resposta: 'Pedido registrado. A equipe do Monitor vai enviar a cópia dos seus dados para o e-mail da conta em até 15 dias.',
    }
  }
  return {
    assunto: 'Cliente com acesso encerrado quer continuar',
    texto: `${quem}\n\nA pessoa quer continuar usando o Monitor. Entre em contato pelo e-mail da conta para combinar o plano e estender o acesso.`,
    resposta: 'Pedido registrado. A equipe do Monitor vai falar com você pelo e-mail da conta para combinar como continuar.',
  }
}
