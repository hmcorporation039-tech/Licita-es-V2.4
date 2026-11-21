// "Preparar a empresa": o que a empresa precisa ter UMA VEZ antes de disputar
// qualquer licitação, com onde tirar cada coisa. A Bela explica e leva até a
// tela certa; quem tira a certidão, entra no gov.br e cadastra nos portais é a
// própria pessoa (a Bela nunca entra em site nenhum por ela). Regra pura, sem
// tela: a página /preparar e a Bela usam o que está aqui.

export type SituacaoDoDocumento = 'pronto' | 'vencendo' | 'vencido' | 'falta'

export interface PassoDoPreparo {
  /** Para documentos, é o mesmo código do cofre (lib/documentTypes.ts). */
  id: string
  titulo: string
  /** Em uma frase, por que precisa. */
  paraQue: string
  /** Como conseguir, em passos curtos. */
  comoTirar: string[]
  site?: { rotulo: string; url: string }
  /** true = documento do cofre: a situação sai das validades cadastradas. */
  vaiProCofre: boolean
}

export const PASSOS_DO_PREPARO: PassoDoPreparo[] = [
  {
    id: 'conta-gov-br',
    titulo: 'Conta gov.br prata ou ouro',
    paraQue: 'É com ela que você entra no Compras.gov.br e tira várias certidões.',
    comoTirar: [
      'Baixe o app gov.br no celular ou entre no site.',
      'Entre com o CPF de quem representa a empresa.',
      'Suba o nível para prata ou ouro: o jeito mais fácil é pelo app, com a validação facial ou pelo login do seu banco.',
    ],
    site: { rotulo: 'Abrir o gov.br', url: 'https://www.gov.br/governodigital/pt-br/conta-gov-br' },
    vaiProCofre: false,
  },
  {
    id: 'cartao-cnpj',
    titulo: 'Cartão CNPJ',
    paraQue: 'Mostra que a empresa existe e está ativa.',
    comoTirar: ['Abra o site da Receita Federal.', 'Digite o CNPJ e confirme que não é robô.', 'Salve a página em PDF.'],
    site: { rotulo: 'Abrir o site da Receita', url: 'https://solucoes.receita.fazenda.gov.br/servicos/cnpjreva/cnpjreva_solicitacao.asp' },
    vaiProCofre: true,
  },
  {
    id: 'contrato-social',
    titulo: 'Contrato social e alterações',
    paraQue: 'Mostra quem são os sócios e o que a empresa pode vender.',
    comoTirar: [
      'Peça ao seu contador a última versão (ou a consolidada).',
      'Também dá para pedir a certidão simplificada na Junta Comercial do seu estado.',
      'MEI: use o Certificado da Condição de MEI (CCMEI), no Portal do Empreendedor.',
    ],
    vaiProCofre: true,
  },
  {
    id: 'cnd-federal',
    titulo: 'Certidão federal (Receita e PGFN)',
    paraQue: 'Prova que a empresa não deve impostos federais. Vale 180 dias.',
    comoTirar: ['Abra o site de certidões da Receita Federal.', 'Escolha "Pessoa Jurídica" e digite o CNPJ.', 'Baixe o PDF.'],
    site: { rotulo: 'Abrir o site da Receita', url: 'https://servicos.receitafederal.gov.br/servico/certidoes/#/home' },
    vaiProCofre: true,
  },
  {
    id: 'crf-fgts',
    titulo: 'Certidão do FGTS (CRF)',
    paraQue: 'Prova que o FGTS dos funcionários está em dia. Vale 30 dias.',
    comoTirar: ['Abra o site da Caixa.', 'Digite o CNPJ e consulte.', 'Clique em "Obtenha o Certificado" e salve em PDF.'],
    site: { rotulo: 'Abrir o site da Caixa', url: 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf' },
    vaiProCofre: true,
  },
  {
    id: 'cndt',
    titulo: 'Certidão trabalhista (CNDT)',
    paraQue: 'Prova que a empresa não tem dívida na Justiça do Trabalho. Vale 180 dias.',
    comoTirar: ['Abra o site do TST.', 'Clique em "Emitir Certidão" e digite o CNPJ.', 'Baixe o PDF.'],
    site: { rotulo: 'Abrir o site do TST', url: 'https://cndt-certidao.tst.jus.br/inicio.faces' },
    vaiProCofre: true,
  },
  {
    id: 'regularidade-estadual',
    titulo: 'Certidão estadual',
    paraQue: 'Prova que a empresa não deve impostos ao estado (ICMS).',
    comoTirar: ['Entre no site da Secretaria da Fazenda (Sefaz) do estado onde fica a empresa.', 'Procure "certidão negativa de débitos" e digite o CNPJ.', 'Baixe o PDF.'],
    vaiProCofre: true,
  },
  {
    id: 'regularidade-municipal',
    titulo: 'Certidão municipal',
    paraQue: 'Prova que a empresa não deve impostos à prefeitura (ISS, IPTU).',
    comoTirar: ['Entre no site da prefeitura da cidade da empresa.', 'Procure "certidão negativa de débitos" ou "certidão de regularidade fiscal".', 'Se não achar, o seu contador tira para você.'],
    vaiProCofre: true,
  },
  {
    id: 'cnd-falencia',
    titulo: 'Certidão de falência',
    paraQue: 'Prova que a empresa não está falida nem em recuperação judicial.',
    comoTirar: ['Entre no site do Tribunal de Justiça do seu estado.', 'Procure "certidão de falência e recuperação judicial" e digite o CNPJ.', 'Baixe o PDF.'],
    vaiProCofre: true,
  },
  {
    id: 'balanco-patrimonial',
    titulo: 'Balanço do último ano',
    paraQue: 'Mostra que a empresa tem saúde financeira para cumprir o contrato.',
    comoTirar: ['Peça ao seu contador o balanço patrimonial e as demonstrações do último ano, assinados.'],
    vaiProCofre: true,
  },
  {
    id: 'sicaf',
    titulo: 'Cadastro no SICAF (Compras.gov.br)',
    paraQue: 'É o cadastro de fornecedor do governo federal. Com ele, muitas certidões ficam lá e você não precisa mandar de novo em cada licitação.',
    comoTirar: [
      'Entre no Compras.gov.br com a sua conta gov.br.',
      'Escolha "Fornecedor" e faça o credenciamento da empresa.',
      'Preencha os níveis do SICAF com os documentos que você já juntou aqui.',
    ],
    site: { rotulo: 'Abrir o Compras.gov.br', url: 'https://www.gov.br/compras' },
    vaiProCofre: false,
  },
]

const DIA = 24 * 60 * 60 * 1000
export const DIAS_PARA_AVISAR = 15

export interface DocumentoDoCofre {
  tipo: string | null
  dataValidade: string | null
}

/** O melhor documento do cofre para aquele código: o que vence por último (sem validade = não vence). */
export function situacaoDoDocumento(id: string, docs: DocumentoDoCofre[], agora: Date = new Date()): SituacaoDoDocumento {
  const doTipo = docs.filter((d) => d.tipo === id)
  if (doTipo.length === 0) return 'falta'
  if (doTipo.some((d) => !d.dataValidade)) return 'pronto'
  const ultima = Math.max(...doTipo.map((d) => new Date(d.dataValidade as string).getTime()).filter(Number.isFinite))
  if (!Number.isFinite(ultima)) return 'pronto'
  // A validade é uma data pura: vale até o fim daquele dia.
  const fimDoDia = ultima + DIA - 1
  if (fimDoDia < agora.getTime()) return 'vencido'
  if (fimDoDia - agora.getTime() <= DIAS_PARA_AVISAR * DIA) return 'vencendo'
  return 'pronto'
}

export interface ResumoDoPreparo {
  documentos: number
  prontos: number
  proximo: string | null
}

export function resumoDoPreparo(docs: DocumentoDoCofre[], agora: Date = new Date()): ResumoDoPreparo {
  const doCofre = PASSOS_DO_PREPARO.filter((p) => p.vaiProCofre)
  const situacoes = doCofre.map((p) => ({ id: p.id, s: situacaoDoDocumento(p.id, docs, agora) }))
  return {
    documentos: doCofre.length,
    prontos: situacoes.filter((x) => x.s === 'pronto').length,
    proximo: situacoes.find((x) => x.s !== 'pronto')?.id ?? null,
  }
}

/** A tela do cofre já aberta no formulário, com o tipo escolhido. */
export function linkParaCadastrarNoCofre(id: string): string {
  return `/empresa?documento=${encodeURIComponent(id)}#cadastrar-documento`
}

export function linkDoPasso(id: string): string {
  return `/preparar#${id}`
}
