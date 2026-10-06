// ============================================================
// lib/resendResultado.ts — O Resend NÃO lança erro quando recusa um envio (domínio não verificado,
// remetente inválido, destinatário não permitido...): devolve `{ data, error }`. Quem ignora o
// retorno acha que o e-mail saiu. Estas funções transformam a recusa em erro legível.
// ============================================================

export interface RespostaDoResend {
  error?: { name?: string; message?: string } | null
}

// Lança se o Resend recusou. A mensagem do Resend não contém segredos (é texto como
// "You can only send testing emails to your own email address...").
export function exigirEnvioOk(resposta: RespostaDoResend | null | undefined): void {
  if (resposta?.error) {
    throw new Error(`O Resend recusou o envio (${resposta.error.name ?? 'erro'}): ${resposta.error.message ?? 'sem detalhe'}`)
  }
}

// Remetentes que o Resend só aceita para o dono da conta (ou que nem existem).
export function problemaNoRemetente(from: string | undefined): string | null {
  const v = (from ?? '').trim()
  if (!v) return 'EMAIL_FROM não está definido.'
  if (/seudominio/i.test(v)) return 'EMAIL_FROM ainda é o valor de exemplo (noreply@seudominio.com.br).'
  if (/@resend\.dev\b/i.test(v)) {
    return 'EMAIL_FROM usa o domínio de teste do Resend (resend.dev): só entrega para o e-mail dono da conta Resend. Verifique um domínio próprio em resend.com/domains.'
  }
  return null
}
