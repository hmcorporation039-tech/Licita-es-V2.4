// "Me leva para…": a pessoa pede à Bela, falando ou digitando, uma tela do
// sistema e a Bela abre a tela certa (já no ponto certo quando dá: o formulário
// do cofre com o documento escolhido, a explicação de uma certidão). Regra pura,
// sem tela. null = não é pedido de navegação (a Bela segue com a busca).

import { normalizarPedido } from './pedidoDoEdital'
import { linkDoPasso, linkParaCadastrarNoCofre } from './prepararEmpresa'

export interface DestinoDaNavegacao {
  href: string
  rotulo: string
}

const VERBO_DE_IR =
  /\b(abr[ae]|abrir|abre|vai|vamos|va|leva|levar|me leva|ir|entra|entrar|mostra|mostrar|quero ver|ver|ve|acessar|acessa|onde (fica|esta|ta|vejo)|cade|falar|conversar|chamar)\b/
const VERBO_DE_CADASTRAR = /\b(cadastr\w*|envi\w*|mand\w*|anex\w*|sub\w*|guard\w*|coloc\w*|bot\w*|incluir|inclui|adicion\w*|salv\w*)\b/
const COMO_TIRAR = /\b(como|onde|aonde|qual site|que site|preciso|quero|me ajuda a|ajuda a)\b.*\b(tir\w*|emit\w*|consig\w*|consegu\w*|pega\w*|baix\w*|fa(z|co|zer)|ach\w*)\b/

// Documentos que a pessoa costuma citar pelo nome. A ordem importa.
const DOCUMENTOS: [RegExp, string, string][] = [
  [/\b(fgts|crf)\b/, 'crf-fgts', 'a certidão do FGTS'],
  [/\b(trabalhist\w*|cndt|tst)\b/, 'cndt', 'a certidão trabalhista'],
  [/\bfalenc\w*|recuperacao judicial\b/, 'cnd-falencia', 'a certidão de falência'],
  [/\b(estadual|sefaz|icms)\b/, 'regularidade-estadual', 'a certidão estadual'],
  [/\b(municipal|prefeitura|iss)\b/, 'regularidade-municipal', 'a certidão municipal'],
  [/\b(federa\w*|receita|pgfn|uniao)\b(?!.*\bcnpj\b)/, 'cnd-federal', 'a certidão federal'],
  [/\b(cartao( do)? cnpj|comprovante( de inscricao)?( do)? cnpj)\b/, 'cartao-cnpj', 'o cartão CNPJ'],
  [/\b(contrato social|estatuto|ccmei)\b/, 'contrato-social', 'o contrato social'],
  [/\bbalanco\b/, 'balanco-patrimonial', 'o balanço'],
  [/\bsicaf\b/, 'sicaf', 'o cadastro no SICAF'],
  [/\b(gov ?br|conta (prata|ouro)|nivel (prata|ouro))\b/, 'conta-gov-br', 'a conta gov.br'],
]

// Telas do sistema. A ordem importa: o primeiro que casar vale.
const TELAS: [RegExp, DestinoDaNavegacao][] = [
  [/\b(preparar|preparacao|deixar a empresa pronta|empresa pronta|documentos basicos|o que (eu )?preciso (ter|para participar|pra participar))\b/, { href: '/preparar', rotulo: 'Preparar a empresa' }],
  [/\b(cofre|meus documentos|documentos da empresa|minhas certidoes|certidoes)\b/, { href: '/empresa#cadastrar-documento', rotulo: 'o cofre de documentos' }],
  [/\b(dados da empresa|cadastro da empresa|minha empresa|papel timbrado)\b/, { href: '/empresa', rotulo: 'Empresa' }],
  [/\b(meus itens|itens monitorados|o que (eu )?vendo|o que a empresa vende|meus produtos)\b/, { href: '/items', rotulo: 'Itens monitorados' }],
  [/\b(salvas|salvos|favoritas|guardadas)\b/, { href: '/salvas', rotulo: 'Minhas salvas' }],
  [/\bescolhidas\b/, { href: '/escolhidas', rotulo: 'Escolhidas' }],
  [/\b(matches?|que (voce|vc) (achou|encontrou)|achou pra mim|achou para mim)\b/, { href: '/matches', rotulo: 'Meus matches' }],
  [/\b(sessoes|minhas sessoes)\b/, { href: '/sessoes', rotulo: 'Minhas sessões' }],
  [/\b(base de precos|precos? (de referencia|pagos?|vencedores?))\b/, { href: '/base-de-precos', rotulo: 'Base de preços' }],
  [/\bradar\b/, { href: '/radar', rotulo: 'Radar' }],
  [/\b(obras e ganhadores|ganhadores)\b/, { href: '/obras', rotulo: 'Obras e ganhadores' }],
  [/\b(portais|meus portais)\b/, { href: '/portais', rotulo: 'Meus Portais' }],
  [/\b(suporte|falar com (alguem|uma pessoa|um humano|voces))\b/, { href: '/suporte', rotulo: 'Suporte' }],
  [/\b(guia|passo a passo|como (funciona|participar|participo))\b/, { href: '/guia', rotulo: 'Guia' }],
  [/\b(minha conta|meu plano|minha assinatura|trocar (a )?senha)\b/, { href: '/conta', rotulo: 'Conta' }],
  [/\b(painel|inicio|tela inicial|comeco)\b/, { href: '/dashboard', rotulo: 'Painel' }],
]

function documentoCitado(t: string): { id: string; nome: string } | null {
  const achado = DOCUMENTOS.find(([re]) => re.test(t))
  return achado ? { id: achado[1], nome: achado[2] } : null
}

export function interpretarPedidoDeNavegacao(texto: string): DestinoDaNavegacao | null {
  const t = normalizarPedido(texto)
  if (!t) return null
  // "licitação de ..." é busca, mesmo com "quero ver" na frase.
  if (/\blicitac\w*\b/.test(t) && !/\b(preparar|participar)\b/.test(t)) return null

  const documento = documentoCitado(t)
  const pareceDocumento = documento && (/\b(certid\w*|cnd|documento|cartao|contrato|balanco|cadastro|conta)\b/.test(t) || /\b(fgts|cndt|sicaf|gov ?br)\b/.test(t))
  if (documento && pareceDocumento) {
    const ehDoCofre = !['sicaf', 'conta-gov-br'].includes(documento.id)
    if (ehDoCofre && VERBO_DE_CADASTRAR.test(t) && !COMO_TIRAR.test(t)) {
      return { href: linkParaCadastrarNoCofre(documento.id), rotulo: `o cofre para cadastrar ${documento.nome}` }
    }
    if (COMO_TIRAR.test(t) || VERBO_DE_IR.test(t) || t.split(' ').length <= 4) {
      return { href: linkDoPasso(documento.id), rotulo: `como conseguir ${documento.nome}` }
    }
  }

  // "O que preciso para participar?" já é o pedido, mesmo sem "abre" ou "me leva".
  const [preparo, destinoDoPreparo] = TELAS[0]
  if (preparo.test(t)) return destinoDoPreparo

  const curto = t.split(' ').length <= 3
  if (!VERBO_DE_IR.test(t) && !curto) return null
  return TELAS.find(([re]) => re.test(t))?.[1] ?? null
}
