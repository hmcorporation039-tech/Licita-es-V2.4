// Endereço da extensão "Bela na disputa" na Chrome Web Store.
//
// Fica em NEXT_PUBLIC_EXTENSAO_BELA_URL (Vercel) depois que o Google aprovar a extensão.
// Sem ele, ou com um endereço que não seja da loja do Chrome, a tela continua dizendo para
// pedir a instalação ao suporte.

const DA_LOJA = /^https:\/\/(?:chromewebstore\.google\.com\/detail\/|chrome\.google\.com\/webstore\/detail\/)[\w%.-]+(?:\/[a-p]{32})?\/?(?:\?[\w=&.-]*)?$/i

export function enderecoDaExtensao(valor: string | undefined = process.env.NEXT_PUBLIC_EXTENSAO_BELA_URL): string | null {
  const v = valor?.trim()
  return v && DA_LOJA.test(v) ? v : null
}
