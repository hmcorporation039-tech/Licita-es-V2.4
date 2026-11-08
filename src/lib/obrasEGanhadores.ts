// ============================================================
// lib/obrasEGanhadores.ts — Oportunidades entre empresas: quem acabou de ganhar
// uma licitação (contrato assinado no PNCP) e vai precisar de quem execute uma
// parte, alugue equipamento ou forneça material. A empresa cadastra os nichos
// que atende e a região; aqui ficam o catálogo de nichos, o casamento com o
// objeto do contrato, o filtro de região e a mensagem de apresentação.
// Sem rede e sem banco.
// ============================================================

import { haversineKm, normalize } from './geoService'
import { buildKeywordRegex } from './matching'

export interface NichoPronto {
  id: string
  nome: string
  descricao: string
  /** Palavras que, no objeto do contrato, mostram que o ganhador vai precisar do serviço. */
  alvos: string[]
  exclusoes: string[]
}

// Obra de edificação: quase todo nicho de construção serve para ela.
// ("obra de" sozinho não entra: estrada e terraplenagem também são "obra de…").
const EDIFICACAO = ['construcao', 'reforma', 'ampliacao', 'edificacao', 'edificio', 'predio', 'manutencao predial', 'revitalizacao']

export const CATALOGO_DE_NICHOS: NichoPronto[] = [
  { id: 'eletrica', nome: 'Instalações elétricas', descricao: 'Instalação, quadros, cabeamento, iluminação', alvos: [...EDIFICACAO, 'iluminacao', 'subestacao', 'rede eletrica', 'energia solar', 'fotovoltaica', 'eficiencia energetica'], exclusoes: ['iluminacao cenica', 'sonorizacao', 'evento', 'show'] },
  { id: 'hidraulica', nome: 'Hidráulica e saneamento', descricao: 'Água, esgoto, drenagem, instalações hidrossanitárias', alvos: [...EDIFICACAO, 'rede de agua', 'esgoto', 'saneamento', 'drenagem', 'abastecimento de agua', 'reservatorio'], exclusoes: [] },
  { id: 'pintura', nome: 'Pintura', descricao: 'Pintura predial, textura, sinalização', alvos: [...EDIFICACAO, 'pintura', 'sinalizacao viaria'], exclusoes: [] },
  { id: 'climatizacao', nome: 'Ar-condicionado e climatização', descricao: 'Instalação e manutenção de ar-condicionado', alvos: [...EDIFICACAO, 'ar condicionado', 'climatizacao', 'refrigeracao'], exclusoes: [] },
  { id: 'esquadrias', nome: 'Esquadrias, vidros e serralheria', descricao: 'Portas, janelas, grades, alambrado, estruturas metálicas', alvos: [...EDIFICACAO, 'cobertura', 'quadra', 'alambrado', 'estrutura metalica', 'grades'], exclusoes: [] },
  { id: 'cobertura', nome: 'Telhados e impermeabilização', descricao: 'Cobertura, telhado, calha, impermeabilização', alvos: [...EDIFICACAO, 'cobertura', 'telhado', 'impermeabilizacao', 'reservatorio'], exclusoes: [] },
  { id: 'terraplenagem', nome: 'Terraplenagem e máquinas', descricao: 'Escavação, aterro, máquinas pesadas', alvos: ['pavimentacao', 'terraplenagem', 'drenagem', 'estrada', 'rodovia', 'recapeamento', 'loteamento', 'barragem', 'ponte', 'construcao', 'urbanizacao'], exclusoes: [] },
  { id: 'pavimentacao', nome: 'Pavimentação e calçamento', descricao: 'Asfalto, bloquete, meio-fio, calçada', alvos: ['pavimentacao', 'calcamento', 'recapeamento', 'drenagem', 'urbanizacao', 'praca', 'calcada', 'estrada', 'rodovia'], exclusoes: [] },
  { id: 'equipamentos', nome: 'Locação de equipamentos', descricao: 'Andaime, betoneira, gerador, caçamba', alvos: [...EDIFICACAO, 'pavimentacao', 'terraplenagem', 'ponte'], exclusoes: [] },
  { id: 'materiais', nome: 'Materiais de construção e concreto', descricao: 'Concreto usinado, agregados, materiais', alvos: ['construcao', 'ampliacao', 'pavimentacao', 'ponte', 'muro', 'calcada', 'edificacao', 'reforma'], exclusoes: [] },
  { id: 'transporte', nome: 'Transporte e frete', descricao: 'Caminhão, caçamba, remoção de entulho', alvos: ['pavimentacao', 'terraplenagem', 'construcao', 'demolicao', 'residuos', 'entulho', 'coleta de lixo', 'limpeza urbana'], exclusoes: [] },
  { id: 'projetos', nome: 'Topografia e projetos de engenharia', descricao: 'Levantamento, projetos, laudos, ART', alvos: ['pavimentacao', 'construcao', 'loteamento', 'regularizacao fundiaria', 'estrada', 'rodovia', 'drenagem', 'ampliacao', 'edificacao'], exclusoes: [] },
  { id: 'spda', nome: 'SPDA e aterramento', descricao: 'Para-raios, aterramento, laudos', alvos: [...EDIFICACAO, 'subestacao', 'torre'], exclusoes: [] },
  { id: 'mao-de-obra', nome: 'Mão de obra de construção', descricao: 'Pedreiros, equipe de obra, empreitada', alvos: EDIFICACAO, exclusoes: [] },
  { id: 'limpeza-pos-obra', nome: 'Limpeza pós-obra', descricao: 'Limpeza fina e entrega da obra', alvos: EDIFICACAO, exclusoes: [] },
  { id: 'seguranca', nome: 'Segurança do trabalho e EPI', descricao: 'PCMSO, PGR, treinamentos, EPI', alvos: [...EDIFICACAO, 'pavimentacao', 'limpeza urbana', 'coleta de lixo', 'terraplenagem'], exclusoes: [] },
  { id: 'paisagismo', nome: 'Paisagismo e jardinagem', descricao: 'Jardins, gramado, poda, roçagem', alvos: ['praca', 'parque', 'urbanizacao', 'revitalizacao', 'rocagem', 'jardinagem', 'construcao'], exclusoes: [] },
  { id: 'gerador', nome: 'Geradores e energia', descricao: 'Grupo gerador, nobreak, energia de emergência', alvos: ['subestacao', 'grupo gerador', 'hospital', 'construcao', 'ampliacao', 'energia'], exclusoes: [] },
]

export const MAX_NICHOS = 12
export const MAX_PALAVRAS_POR_NICHO = 30

export interface NichoDaEmpresa {
  nome: string
  alvos: string[]
  exclusoes: string[]
}

export interface ContratoParaCasar {
  objetoNorm: string
  categoria?: string | null
}

// Terceirização de pessoal (recepção, copa, apoio administrativo, vigilância): o ganhador
// fornece gente, não executa obra. Palavras como "saneamento" aí costumam ser o nome do órgão.
const TERCEIRIZACAO = /\b(dedicacao exclusiva|terceirizad\w*|terceirizacao|apoio administrativo|copeiragem|recepcionistas?|vigilancia|vigilantes?|limpeza e conservacao|postos? de trabalho|motoristas?)\b/

const MAO_DE_OBRA = /\bmao de obra\b/g
// "Aquisição de cimento" foi ganho por um fornecedor, não por quem vai executar uma obra.
const SO_COMPRA = /^\s*(aquisicao|compra|fornecimento)\b|\b(aquisicao|aquisicoes|compra|fornecimento) de (materia|equipament|produto|insumo|genero|pecas)/

export interface NichoCompilado {
  nome: string
  alvos: { palavra: string; regex: RegExp }[]
  exclusoes: RegExp[]
}

export function compilarNichos(nichos: NichoDaEmpresa[]): NichoCompilado[] {
  return nichos.map((n) => ({
    nome: n.nome,
    alvos: n.alvos.flatMap((palavra) => {
      const regex = buildKeywordRegex(palavra)
      return regex ? [{ palavra, regex }] : []
    }),
    exclusoes: n.exclusoes.flatMap((p) => {
      const r = buildKeywordRegex(p)
      return r ? [r] : []
    }),
  }))
}

/** Nichos da empresa que este contrato pede, com as palavras que casaram. */
export function nichosDoContrato(contrato: ContratoParaCasar, nichos: NichoCompilado[]): { nome: string; palavras: string[] }[] {
  if (contrato.categoria === 'Mão de Obra' || TERCEIRIZACAO.test(contrato.objetoNorm)) return []
  const texto = contrato.objetoNorm.replace(MAO_DE_OBRA, ' ')
  if (SO_COMPRA.test(texto) && !/\b(execucao|instalacao|empreitada)\b/.test(texto)) return []
  const achados: { nome: string; palavras: string[] }[] = []
  for (const n of nichos) {
    if (n.exclusoes.some((r) => r.test(texto))) continue
    const palavras = n.alvos.filter((a) => a.regex.test(texto)).map((a) => a.palavra)
    if (palavras.length > 0) achados.push({ nome: n.nome, palavras })
  }
  return achados
}

export interface RegiaoDaEmpresa {
  raioKm: number | null
  ufs: string[]
  base: { lat: number; lng: number } | null
}

export interface LocalDoContrato {
  uf: string | null
  lat: number | null
  lng: number | null
}

/** Dentro da região? Raio a partir da base OU uma das UFs escolhidas. Devolve a distância quando dá para calcular. */
export function naRegiao(regiao: RegiaoDaEmpresa, local: LocalDoContrato): { dentro: boolean; distanciaKm: number | null } {
  const distanciaKm = regiao.base && local.lat !== null && local.lng !== null ? Math.round(haversineKm(regiao.base.lat, regiao.base.lng, local.lat, local.lng)) : null
  const pelaUf = regiao.ufs.length > 0 && local.uf !== null && regiao.ufs.includes(local.uf)
  const peloRaio = regiao.raioKm !== null && distanciaKm !== null && distanciaKm <= regiao.raioKm
  return { dentro: pelaUf || peloRaio, distanciaKm }
}

export function regiaoValida(regiao: RegiaoDaEmpresa): string | null {
  if (regiao.ufs.length > 0) return null
  if (regiao.raioKm === null) return 'Escolha um raio a partir da sua base ou pelo menos um estado.'
  if (!regiao.base) return 'Para buscar por raio, cadastre a cidade da sua base em Empresa (ou escolha os estados).'
  return null
}

export function limparPalavras(palavras: string[]): string[] {
  const vistas = new Set<string>()
  const limpas: string[] = []
  for (const p of palavras) {
    const t = p.replace(/\s+/g, ' ').trim().slice(0, 60)
    const chave = normalize(t)
    if (!t || chave.length < 3 || vistas.has(chave)) continue
    vistas.add(chave)
    limpas.push(t)
    if (limpas.length >= MAX_PALAVRAS_POR_NICHO) break
  }
  return limpas
}

const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const resumoDoObjeto = (objeto: string) => {
  const t = objeto.replace(/\s+/g, ' ').trim()
  return t.length > 160 ? `${t.slice(0, 160).trim()}…` : t
}

export interface DadosDaMensagem {
  fornecedor: string
  orgao: string
  objeto: string
  municipio: string | null
  uf: string | null
  valor: number | null
  minhaEmpresa: string
  minhaCidade: string | null
  meusNichos: string[]
  meuContato: string | null
}

/** Primeira mensagem para o ganhador: curta, diz de onde veio o contato e o que a empresa oferece. */
export function mensagemDeApresentacao(d: DadosDaMensagem): string {
  const onde = d.municipio ? ` em ${d.municipio}${d.uf ? `/${d.uf}` : ''}` : ''
  const nichos = d.meusNichos.length > 0 ? d.meusNichos.map((n) => n.toLowerCase()).join(', ') : 'serviços para obras'
  const linhas = [
    `Olá, equipe da ${d.fornecedor}.`,
    '',
    `Vi no Portal Nacional de Contratações Públicas que vocês assinaram contrato com ${d.orgao} para "${resumoDoObjeto(d.objeto)}"${onde}${d.valor ? ` (${reais(d.valor)})` : ''}. Parabéns pelo resultado.`,
    '',
    `Somos a ${d.minhaEmpresa}${d.minhaCidade ? `, de ${d.minhaCidade}` : ''}, e trabalhamos com ${nichos}. Se for útil para a execução desse contrato, podemos enviar um orçamento sem compromisso.`,
    '',
    d.meuContato ? `Fico à disposição: ${d.meuContato}.` : 'Fico à disposição.',
  ]
  return linhas.join('\n')
}
