// ============================================================
// lib/itensDoContrato.ts — "O que o contrato pede": os itens da compra (PNCP)
// que tocam os nichos da empresa vêm primeiro; o resto fica em "outros itens".
// O casamento usa as palavras do nicho (as mesmas do objeto do contrato), sem as
// genéricas de obra ("construção", "reforma"…, que num item só dizem que é obra),
// mais palavras próprias de item para os nichos do catálogo ("disjuntor", "tinta").
// Sem rede e sem banco.
// ============================================================

import { normalize } from './geoService'
import { buildKeywordRegex } from './matching'
import { CATALOGO_DE_NICHOS, type NichoCompilado, type NichoDaEmpresa } from './obrasEGanhadores'

export interface CompraDoPncp {
  cnpj: string
  ano: number
  sequencial: number
}

/** "07854402000100-1-000123/2026" (numeroControlePNCP da compra) -> órgão, ano e sequencial. */
export function compraDoControle(controle: string | null | undefined): CompraDoPncp | null {
  const m = controle?.trim().match(/^(\d{14})-\d+-(\d{1,9})\/(\d{4})$/)
  if (!m) return null
  const sequencial = Number(m[2])
  return sequencial > 0 ? { cnpj: m[1], ano: Number(m[3]), sequencial } : null
}

/** Página da compra no PNCP (a aba "Arquivos" tem o edital e os anexos). */
export function linkDaCompra(c: CompraDoPncp): string {
  return `https://pncp.gov.br/app/editais/${c.cnpj}/${c.ano}/${c.sequencial}`
}

// Palavras que, no objeto, mostram que é obra — mas num item não dizem de que parte se trata.
const GENERICAS_DE_OBRA = new Set(
  ['construcao', 'reforma', 'ampliacao', 'edificacao', 'edificio', 'predio', 'manutencao predial', 'revitalizacao', 'urbanizacao', 'obra', 'obras', 'loteamento', 'hospital', 'energia'].map(
    (p) => normalize(p)
  )
)

// Palavras de item por nicho do catálogo (pelo id). Escritas sem acento; plural é automático.
const PALAVRAS_DE_ITEM: Record<string, string[]> = {
  eletrica: ['eletrica', 'eletrico', 'eletricas', 'eletricos', 'disjuntor', 'quadro de distribuicao', 'quadro de medicao', 'luminaria', 'lampada', 'refletor', 'tomada', 'interruptor', 'eletroduto', 'eletrocalha', 'cabo flexivel', 'condutor', 'padrao de entrada', 'poste', 'transformador'],
  hidraulica: ['hidraulica', 'hidraulico', 'hidrossanitaria', 'hidrossanitario', 'sanitaria', 'sanitario', 'tubo', 'tubulacao', 'esgoto', 'agua fria', 'agua pluvial', 'caixa d agua', 'registro de gaveta', 'torneira', 'lavatorio', 'bacia sanitaria', 'fossa', 'sumidouro', 'caixa de inspecao', 'poco de visita'],
  pintura: ['pintura', 'tinta', 'massa corrida', 'textura', 'selador', 'verniz', 'emassamento', 'esmalte sintetico'],
  climatizacao: ['ar condicionado', 'split', 'climatizacao', 'refrigeracao', 'exaustor', 'exaustao', 'condensadora', 'evaporadora'],
  esquadrias: ['esquadria', 'janela', 'porta', 'vidro', 'grade', 'gradil', 'portao', 'alambrado', 'serralheria', 'guarda corpo', 'corrimao', 'estrutura metalica', 'perfil metalico'],
  cobertura: ['telhado', 'telha', 'cobertura', 'calha', 'rufo', 'cumeeira', 'impermeabilizacao', 'manta asfaltica', 'madeiramento'],
  terraplenagem: ['terraplenagem', 'escavacao', 'aterro', 'reaterro', 'compactacao', 'regularizacao do subleito', 'bota fora', 'retroescavadeira', 'escavadeira', 'motoniveladora', 'rolo compactador', 'desmatamento', 'destocamento'],
  pavimentacao: ['pavimentacao', 'pavimento', 'asfalto', 'cbuq', 'concreto betuminoso', 'imprimacao', 'pintura de ligacao', 'meio fio', 'sarjeta', 'bloquete', 'paver', 'piso intertravado', 'paralelepipedo', 'calcada', 'sub base', 'base granular', 'tratamento superficial', 'recapeamento'],
  equipamentos: ['locacao', 'aluguel', 'andaime', 'betoneira', 'gerador', 'cacamba', 'retroescavadeira', 'escavadeira', 'guindaste', 'compactador', 'container'],
  materiais: ['concreto', 'cimento', 'areia', 'brita', 'argamassa', 'vergalhao', 'aco ca', 'tijolo', 'bloco ceramico', 'bloco de concreto', 'cal hidratada', 'graute'],
  transporte: ['transporte', 'frete', 'carga e descarga', 'bota fora', 'entulho', 'cacamba', 'caminhao', 'dmt'],
  projetos: ['topografia', 'topografico', 'levantamento planialtimetrico', 'projeto executivo', 'projeto basico', 'projetos', 'sondagem', 'laudo', 'georreferenciamento', 'as built'],
  spda: ['spda', 'para raios', 'pararaios', 'aterramento', 'captor', 'haste de aterramento', 'descargas atmosfericas'],
  'mao-de-obra': ['mao de obra', 'pedreiro', 'servente', 'carpinteiro', 'armador', 'alvenaria', 'reboco', 'chapisco', 'emboco', 'contrapiso', 'encarregado'],
  'limpeza-pos-obra': ['limpeza final', 'limpeza da obra', 'limpeza geral', 'limpeza permanente', 'remocao de entulho'],
  seguranca: ['epi', 'epc', 'seguranca do trabalho', 'tapume', 'placa de obra', 'sinalizacao de obra', 'tecnico de seguranca', 'pcmso', 'pgr'],
  paisagismo: ['paisagismo', 'grama', 'gramado', 'plantio', 'muda', 'arvore', 'jardim', 'jardinagem', 'rocagem', 'poda', 'canteiro', 'forracao'],
  gerador: ['gerador', 'grupo gerador', 'nobreak', 'quadro de transferencia', 'usina fotovoltaica', 'modulo fotovoltaico', 'inversor'],
}

// Equipamento de quadra: "poste de vôlei", "trave de futsal", "rede de vôlei" não são elétrica.
const ESPORTES = ['volei', 'voleibol', 'peteca', 'futsal', 'futebol', 'handebol', 'basquete', 'basquetebol', 'tenis', 'badminton']
const EQUIPAMENTO_DE_QUADRA = ['poste', 'rede', 'tabela'].flatMap((peca) => ESPORTES.flatMap((esporte) => [`${peca} de ${esporte}`, `${peca} para ${esporte}`]))

// Num item, palavras do nicho com outro sentido: o item não conta para o nicho (pelo id).
// Valem também quando a empresa salvou a palavra no nicho dela (ex.: "poste" em elétrica).
const EXCLUSOES_DE_ITEM: Record<string, string[]> = {
  eletrica: [...EQUIPAMENTO_DE_QUADRA, 'trave', 'par com rede', 'rede de protecao', 'poste de alambrado', 'poste de cerca', 'poste de sinalizacao', 'condutor vertical', 'condutor horizontal', 'agua pluvial', 'tomada de agua', 'tomada d agua'],
  equipamentos: ['locacao de obra', 'locacao convencional de obra'],
  esquadrias: ['porta lampada', 'porta fusivel'],
  paisagismo: ['canteiro de obra'],
}

const ID_PELO_NOME = new Map(CATALOGO_DE_NICHOS.map((n) => [n.nome, n.id]))

/** Nichos prontos para casar com descrição de item. */
export function compilarNichosParaItens(nichos: NichoDaEmpresa[]): NichoCompilado[] {
  return nichos.map((n) => {
    const id = ID_PELO_NOME.get(n.nome)
    const palavras = [...n.alvos.filter((a) => !GENERICAS_DE_OBRA.has(normalize(a).trim())), ...(id ? PALAVRAS_DE_ITEM[id] ?? [] : [])]
    const vistas = new Set<string>()
    return {
      nome: n.nome,
      alvos: palavras.flatMap((palavra) => {
        const chave = normalize(palavra).trim()
        if (vistas.has(chave)) return []
        vistas.add(chave)
        const regex = buildKeywordRegex(palavra)
        return regex ? [{ palavra, regex }] : []
      }),
      exclusoes: [...n.exclusoes, ...(id ? EXCLUSOES_DE_ITEM[id] ?? [] : [])].flatMap((p) => {
        const r = buildKeywordRegex(p)
        return r ? [r] : []
      }),
    }
  })
}

const textoDoItem = (t: string) =>
  normalize(t)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Nomes dos nichos que este item toca. */
export function nichosDoItem(descricao: string, nichos: NichoCompilado[]): string[] {
  const texto = textoDoItem(descricao)
  if (!texto) return []
  return nichos.filter((n) => !n.exclusoes.some((r) => r.test(texto)) && n.alvos.some((a) => a.regex.test(texto))).map((n) => n.nome)
}

export interface ItemDaCompra {
  numero: number
  descricao: string
  complemento: string | null
  quantidade: number | null
  unidade: string | null
  valorEstimado: number | null
  valorHomologado: number | null
  temResultado: boolean
}

export interface ItemComNichos extends ItemDaCompra {
  nichos: string[]
}

/** Separa os itens: primeiro os que tocam os nichos (na ordem da compra), depois os outros. */
export function separarItens(itens: ItemDaCompra[], nichos: NichoCompilado[]): { doNicho: ItemComNichos[]; outros: ItemComNichos[] } {
  const doNicho: ItemComNichos[] = []
  const outros: ItemComNichos[] = []
  for (const item of itens) {
    const casados = nichosDoItem(`${item.descricao} ${item.complemento ?? ''}`, nichos)
    ;(casados.length > 0 ? doNicho : outros).push({ ...item, nichos: casados })
  }
  return { doNicho, outros }
}

const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim() : null)

/** Item cru do PNCP (/compras/{ano}/{seq}/itens) -> item da tela. */
export function itemDoPncp(bruto: Record<string, unknown>): ItemDaCompra | null {
  const n = numero(bruto.numeroItem)
  const descricao = texto(bruto.descricao)
  if (n === null || !descricao) return null
  const unidade = texto(bruto.unidadeMedida)
  return {
    numero: n,
    descricao: descricao.slice(0, 500),
    complemento: texto(bruto.informacaoComplementar)?.slice(0, 500) ?? null,
    quantidade: numero(bruto.quantidade),
    unidade: unidade && !/^nao utilizado$/i.test(normalize(unidade)) ? unidade : null,
    // Orçamento sigiloso: o valor estimado não é público.
    valorEstimado: bruto.orcamentoSigiloso === true ? null : numero(bruto.valorTotal),
    valorHomologado: null,
    temResultado: bruto.temResultado === true,
  }
}

/**
 * Valor homologado de um item (/itens/{n}/resultados), sem os resultados cancelados.
 * Em registro de preços o item tem vários fornecedores: com o CNPJ do ganhador, vale só o dele
 * (null se o item foi para outra empresa).
 */
export function valorHomologadoDosResultados(resultados: unknown, fornecedorNi?: string | null): number | null {
  if (!Array.isArray(resultados)) return null
  const validos = (resultados as Record<string, unknown>[]).filter((r) => r && !r.dataCancelamento)
  const ni = fornecedorNi?.replace(/\D/g, '')
  const considerados = ni ? validos.filter((r) => String(r.niFornecedor ?? '').replace(/\D/g, '') === ni) : validos
  let soma = 0
  let algum = false
  for (const r of considerados) {
    const v = numero(r?.valorTotalHomologado)
    if (v === null) continue
    soma += v
    algum = true
  }
  return algum ? Math.round(soma * 100) / 100 : null
}
