// ============================================================
// lib/aptidaoParaObra.ts — "Minha empresa é apta?": para cada contrato da aba
// "Ganhadores perto de mim", uma conferência rápida do cadastro da empresa
// (CNAE na Receita, distância, documentos, registro no conselho, vigência).
// Só confere o que a Bela já tem: não decide nada pelo ganhador.
// Sem rede e sem banco: a rota monta as entradas uma vez por pedido.
// ============================================================

import { CATALOGO_DE_NICHOS } from './obrasEGanhadores'

export type TomDoItem = 'ok' | 'atencao' | 'problema'
export type Veredito = 'boa' | 'confira' | 'fora'

export interface ItemDaAptidao {
  tom: TomDoItem
  texto: string
}

export interface Aptidao {
  veredito: Veredito
  titulo: string
  itens: ItemDaAptidao[]
}

export interface DocumentoDaEmpresa {
  nome: string
  tipo: string | null
  dataValidade: Date | null
}

export interface EmpresaParaAptidao {
  pessoaFisica: boolean
  /** Códigos CNAE (só dígitos) do cadastro na Receita; null = não deu para conferir. */
  cnaes: string[] | null
  documentos: DocumentoDaEmpresa[]
  raioKm: number | null
}

export interface ContratoParaAptidao {
  /** Nomes dos nichos da empresa que o contrato pediu. */
  nichos: string[]
  distanciaKm: number | null
  vigenciaFim: Date | null
}

// Nicho do catálogo -> começo dos códigos CNAE que costumam cobrir o serviço.
export const CNAES_DO_NICHO: Record<string, { rotulo: string; prefixos: string[] }> = {
  eletrica: { rotulo: 'instalações elétricas', prefixos: ['4321', '4329', '4221'] },
  hidraulica: { rotulo: 'instalações hidráulicas e saneamento', prefixos: ['4322', '4222', '3600', '3701', '3702'] },
  pintura: { rotulo: 'pintura e acabamento', prefixos: ['4330'] },
  climatizacao: { rotulo: 'ar-condicionado', prefixos: ['4322', '3314'] },
  esquadrias: { rotulo: 'esquadrias e serralheria', prefixos: ['4330', '4329', '2511', '2512', '2539', '2542'] },
  cobertura: { rotulo: 'telhados e impermeabilização', prefixos: ['4391', '4399', '4330'] },
  terraplenagem: { rotulo: 'terraplenagem', prefixos: ['4313', '4312', '4399', '7732'] },
  pavimentacao: { rotulo: 'pavimentação', prefixos: ['4211', '4213', '4299', '4313'] },
  equipamentos: { rotulo: 'locação de equipamentos', prefixos: ['7732', '7739', '4399'] },
  materiais: { rotulo: 'materiais de construção', prefixos: ['4744', '4679', '4672', '4673', '2330', '0810'] },
  transporte: { rotulo: 'transporte e remoção de entulho', prefixos: ['4930', '3811', '3812', '3821', '3839'] },
  projetos: { rotulo: 'projetos de engenharia e topografia', prefixos: ['7111', '7112', '7119'] },
  spda: { rotulo: 'SPDA e aterramento', prefixos: ['4321', '7112', '7119'] },
  'mao-de-obra': { rotulo: 'construção', prefixos: ['41', '42', '43'] },
  'limpeza-pos-obra': { rotulo: 'limpeza', prefixos: ['8121', '8129', '4399'] },
  paisagismo: { rotulo: 'paisagismo', prefixos: ['8130'] },
  gerador: { rotulo: 'geradores e energia', prefixos: ['4321', '3314', '7739'] },
}

// Nichos que, na obra, são serviço de engenharia (ART/RRT, registro no conselho).
const NICHOS_DE_ENGENHARIA = new Set(['eletrica', 'hidraulica', 'climatizacao', 'esquadrias', 'cobertura', 'terraplenagem', 'pavimentacao', 'projetos', 'spda', 'mao-de-obra', 'gerador'])

// Construção, engenharia e aluguel de máquinas: CNAE "do ramo", mesmo que não seja o do nicho.
const PREFIXOS_DO_RAMO = ['41', '42', '43', '71', '77']

const TIPO_REGISTRO_NO_CONSELHO = 'registro-conselho-classe'
const DIAS_PARA_VENCER = 15
const DIAS_DE_VIGENCIA_CURTA = 30
const RAIO_PADRAO_KM = 150
const DIA_MS = 24 * 60 * 60 * 1000

const idDoNicho = (nome: string) => CATALOGO_DE_NICHOS.find((n) => n.nome === nome)?.id ?? null
const dataLegivel = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/')
const cnaeLegivel = (c: string) => (c.length === 7 ? `${c.slice(0, 4)}-${c.slice(4, 5)}/${c.slice(5)}` : c)
const listaCurta = (nomes: string[], max = 2) => (nomes.length > max ? `${nomes.slice(0, max).join(', ')} e mais ${nomes.length - max}` : nomes.join(', '))
const diasAte = (d: Date, hoje: Date) => Math.ceil((d.getTime() - hoje.getTime()) / DIA_MS)

function itemDoCnae(empresa: EmpresaParaAptidao, idsDosNichos: string[]): { item: ItemDaAptidao; bloqueia: boolean } | null {
  if (empresa.pessoaFisica) {
    return { item: { tom: 'atencao', texto: 'Cadastro como pessoa física: quem ganhou costuma pedir CNPJ e nota fiscal.' }, bloqueia: false }
  }
  const mapeados = idsDosNichos.filter((id) => CNAES_DO_NICHO[id])
  if (mapeados.length === 0) return null
  if (empresa.cnaes === null) {
    return { item: { tom: 'atencao', texto: 'Não consegui conferir seus CNAEs na Receita agora.' }, bloqueia: false }
  }
  for (const id of mapeados) {
    const achado = empresa.cnaes.find((c) => CNAES_DO_NICHO[id].prefixos.some((p) => c.startsWith(p)))
    if (achado) return { item: { tom: 'ok', texto: `CNAE compatível com ${CNAES_DO_NICHO[id].rotulo} (${cnaeLegivel(achado)}).` }, bloqueia: false }
  }
  const rotulos = mapeados.map((id) => CNAES_DO_NICHO[id].rotulo)
  const doRamo = empresa.cnaes.some((c) => PREFIXOS_DO_RAMO.some((p) => c.startsWith(p)))
  if (doRamo) {
    return { item: { tom: 'atencao', texto: `Não achei CNAE de ${listaCurta(rotulos)} no seu cadastro na Receita; confira se as suas atividades cobrem o serviço.` }, bloqueia: false }
  }
  return { item: { tom: 'problema', texto: `Nenhum CNAE seu na Receita é de ${listaCurta(rotulos)} nem de construção.` }, bloqueia: true }
}

function itemDaDistancia(empresa: EmpresaParaAptidao, distanciaKm: number | null): ItemDaAptidao | null {
  if (distanciaKm === null) return null
  const raio = empresa.raioKm ?? RAIO_PADRAO_KM
  if (distanciaKm <= raio) return { tom: 'ok', texto: distanciaKm === 0 ? 'Na cidade da sua base.' : `A ${distanciaKm} km da sua base.` }
  return { tom: 'atencao', texto: `A ${distanciaKm} km da sua base, além do seu raio de ${raio} km: conte o deslocamento.` }
}

function itemDosDocumentos(documentos: DocumentoDaEmpresa[], hoje: Date): ItemDaAptidao {
  if (documentos.length === 0) return { tom: 'atencao', texto: 'Nenhum documento cadastrado em Empresa e documentos.' }
  // Do mesmo tipo, vale o que estiver em dia (um renovado cobre o antigo vencido).
  const validoPorTipo = new Set(documentos.filter((d) => d.tipo && (!d.dataValidade || d.dataValidade >= hoje)).map((d) => d.tipo))
  const vencidos = documentos.filter((d) => d.dataValidade && d.dataValidade < hoje && !(d.tipo && validoPorTipo.has(d.tipo)))
  if (vencidos.length > 0) {
    const n = vencidos.length
    return { tom: 'problema', texto: `${n} ${n === 1 ? 'documento vencido' : 'documentos vencidos'}: ${listaCurta(vencidos.map((d) => d.nome))}.` }
  }
  const limite = new Date(hoje.getTime() + DIAS_PARA_VENCER * DIA_MS)
  const vencendo = documentos.filter((d) => d.dataValidade && d.dataValidade >= hoje && d.dataValidade <= limite)
  if (vencendo.length > 0) {
    return { tom: 'atencao', texto: `${vencendo.length === 1 ? 'Vence' : 'Vencem'} em até ${DIAS_PARA_VENCER} dias: ${listaCurta(vencendo.map((d) => d.nome))}.` }
  }
  const n = documentos.length
  return { tom: 'ok', texto: n === 1 ? 'Seu documento cadastrado está em dia.' : `Seus ${n} documentos cadastrados estão em dia.` }
}

function itemDoConselho(documentos: DocumentoDaEmpresa[], idsDosNichos: string[], hoje: Date): ItemDaAptidao | null {
  if (!idsDosNichos.some((id) => NICHOS_DE_ENGENHARIA.has(id))) return null
  const registros = documentos.filter((d) => d.tipo === TIPO_REGISTRO_NO_CONSELHO)
  if (registros.some((d) => !d.dataValidade || d.dataValidade >= hoje)) return { tom: 'ok', texto: 'Serviço de engenharia: seu registro no conselho (CREA/CAU) está cadastrado.' }
  if (registros.length > 0) return { tom: 'atencao', texto: 'Serviço de engenharia: seu registro no conselho (CREA/CAU) está vencido.' }
  return { tom: 'atencao', texto: 'Serviço de engenharia: costuma exigir registro no CREA/CAU (não achei no seu cadastro).' }
}

function itemDaVigencia(vigenciaFim: Date | null, hoje: Date): { item: ItemDaAptidao; bloqueia: boolean } | null {
  if (!vigenciaFim) return null
  const dias = diasAte(vigenciaFim, hoje)
  if (dias < 0) return { item: { tom: 'problema', texto: `Contrato já terminou em ${dataLegivel(vigenciaFim)}.` }, bloqueia: true }
  if (dias <= DIAS_DE_VIGENCIA_CURTA) {
    return { item: { tom: 'atencao', texto: `Termina em ${dias === 0 ? 'hoje' : dias === 1 ? '1 dia' : `${dias} dias`} (${dataLegivel(vigenciaFim)}): pouco tempo para entrar.` }, bloqueia: false }
  }
  return { item: { tom: 'ok', texto: `Em vigência até ${dataLegivel(vigenciaFim)}.` }, bloqueia: false }
}

export const TITULO_DO_VEREDITO: Record<Veredito, string> = {
  boa: 'Boa chance',
  confira: 'Confira antes',
  fora: 'Fora do seu perfil',
}

/** Conferência do cadastro da empresa para um contrato: veredito e os motivos, na ordem de leitura. */
export function aptidaoParaObra(contrato: ContratoParaAptidao, empresa: EmpresaParaAptidao, hoje: Date = new Date()): Aptidao {
  const ids = contrato.nichos.map(idDoNicho).filter((id): id is string => id !== null)
  const cnae = itemDoCnae(empresa, ids)
  const vigencia = itemDaVigencia(contrato.vigenciaFim, hoje)
  const itens = [
    cnae?.item ?? null,
    itemDaDistancia(empresa, contrato.distanciaKm),
    itemDosDocumentos(empresa.documentos, hoje),
    itemDoConselho(empresa.documentos, ids, hoje),
    vigencia?.item ?? null,
  ].filter((i): i is ItemDaAptidao => i !== null)
  const veredito: Veredito = cnae?.bloqueia || vigencia?.bloqueia ? 'fora' : itens.some((i) => i.tom !== 'ok') ? 'confira' : 'boa'
  return { veredito, titulo: TITULO_DO_VEREDITO[veredito], itens }
}
