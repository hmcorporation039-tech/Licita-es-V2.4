// Texto do alerta ao administrador quando o captcha do cadastro falha no navegador
// de um visitante. Explica o código em português para quem não é técnico.

const EXPLICACOES: Array<[RegExp, string]> = [
  [/^110200$/, 'O domínio do site não está autorizado no captcha. Ninguém consegue se cadastrar por este endereço. Correção: painel da Cloudflare → Turnstile → widget do cadastro → adicionar o domínio na lista de hostnames.'],
  [/^1101\d\d$|^4000\d\d$/, 'A chave do captcha está errada ou foi apagada. Ninguém consegue se cadastrar. Correção: conferir NEXT_PUBLIC_TURNSTILE_SITE_KEY na Vercel e o widget no painel Turnstile da Cloudflare.'],
  [/^300\d\d\d$|^600\d\d\d$/, 'A Cloudflare desconfiou do navegador desta pessoa (bloqueador, extensão ou rede). Costuma ser caso isolado; se repetir muito, vale olhar.'],
]

export function textoDoAvisoDoCadastro(codigo: string, endereco: string): { assunto: string; texto: string } {
  const explicacao = EXPLICACOES.find(([padrao]) => padrao.test(codigo))?.[1] ?? 'Erro do captcha sem explicação conhecida. Teste o cadastro numa janela anônima.'
  return {
    assunto: `Captcha do cadastro falhou para um visitante (código ${codigo || 'sem código'})`,
    texto: `${explicacao}\n\nEndereço da página: ${endereco || 'desconhecido'}\n\nAvisos iguais ficam em silêncio por 15 minutos.`,
  }
}
