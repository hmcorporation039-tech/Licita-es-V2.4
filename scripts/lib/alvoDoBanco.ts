// ============================================================
// scripts/lib/alvoDoBanco.ts — Porteiro dos scripts destrutivos.
//
// Existe porque a DATABASE_URL de desenvolvimento aponta para o banco de
// produção neste projeto, e dois scripts passaram a apagar/reescrever de
// verdade: tenders:cleanup (que até a migration do cascade morria com erro
// de chave estrangeira antes de apagar qualquer coisa) e rawjson:enxugar
// (que reescreve a tabela inteira). Rodar qualquer um deles distraído, do
// terminal errado, não deve ser possível sem dizer o nome do alvo em voz
// alta.
//
// Banco local passa direto: em desenvolvimento a confirmação só atrapalha.
// ============================================================

import { createInterface } from 'node:readline/promises'

const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal'])

export function hostDoBanco(databaseUrl: string): string | null {
  try {
    // IPv6 volta entre colchetes do parser de URL ([::1]) — tira para comparar.
    return new URL(databaseUrl).hostname.replace(/^\[|\]$/g, '')
  } catch {
    return null
  }
}

// URL ilegível conta como remota de propósito: na dúvida, pergunta.
export function ehBancoLocal(databaseUrl: string): boolean {
  const host = hostDoBanco(databaseUrl)
  return host !== null && HOSTS_LOCAIS.has(host)
}

export function descreverAlvo(databaseUrl: string): string {
  return databaseUrl.replace(/\/\/[^@]*@/, '//***:***@')
}

export async function confirmarAlvoRemoto(acao: string): Promise<void> {
  const url = process.env.DATABASE_URL

  if (!url) {
    console.error('DATABASE_URL não definida.')
    process.exit(1)
  }

  if (ehBancoLocal(url)) return

  const host = hostDoBanco(url)

  console.log('')
  console.log('  ATENÇÃO — o banco alvo não é local.')
  console.log('')
  console.log(`  Ação:  ${acao}`)
  console.log(`  Alvo:  ${descreverAlvo(url)}`)
  console.log('')

  if (process.argv.includes('--sim')) {
    console.log('  --sim informado: seguindo sem perguntar.\n')
    return
  }

  if (!process.stdin.isTTY) {
    console.error('  Sem terminal interativo para confirmar. Rode de novo com --sim se for isso mesmo.\n')
    process.exit(1)
  }

  const leitor = createInterface({ input: process.stdin, output: process.stdout })

  try {
    // Pede o host, e não um "s/n": digitar o nome do alvo obriga a olhar para
    // qual banco é, que é justamente o passo que se pula no automático.
    const resposta = await leitor.question(`  Para confirmar, digite o host do banco (${host}): `)

    if (resposta.trim() !== host) {
      console.error('\n  Não confere. Nada foi alterado.\n')
      process.exit(1)
    }
  } finally {
    leitor.close()
  }

  console.log('')
}
