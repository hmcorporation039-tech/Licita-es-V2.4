// ============================================================
// lib/documentPriority.ts — Heurística de prioridade de documento pra
// análise de edital por IA. Extraída de pncpDocumentsService.ts pra virar
// genérica: qualquer fonte que só tenha {titulo} (sem tipoDocumentoNome,
// que é um campo específico do PNCP) já consegue usar.
//
// A classificação olha o TÍTULO primeiro, não o tipo: no PNCP o órgão
// carimba "Edital" no tipo de quase tudo que anexa ao processo, então
// classificar por tipo empurrava o Termo de Referência — que é onde ficam
// as exigências técnicas reais — para fora do corte. Fora do PNCP o título
// já costuma ser autoexplicativo ("Termo de Referência", "Minuta de
// Contrato"), então a mesma regra serve sem ajuste.
// ============================================================

export interface DocumentoComTitulo {
  titulo: string
  tipoDocumentoNome?: string
}

// Peças administrativas do processo: existem, mas não dizem nada sobre
// como participar. Autorização de abertura, comprovante de publicação e
// solicitação de parecer entram aqui.
const ADMINISTRATIVO =
  /autoriza[çc][ãa]o|comprovante|publica[çc][ãa]o|parecer|despacho|solicita[çc][ãa]o|^dfd$|\bdfd\b|aviso de licita/i

const EDITAL = /\bedital\b/i
// Documento convocatório da CONTRATAÇÃO DIRETA (dispensa/inexigibilidade): o
// "Aviso de Contratação Direta" / "Ato que autoriza a Contratação Direta" faz,
// nessas modalidades, o papel que o edital faz no pregão — é o documento
// principal. Precisa ser testado ANTES de ADMINISTRATIVO, senão "ato que
// autoriza..." cairia como peça administrativa (peso 0).
const CONTRATACAO_DIRETA = /contrata[çc][ãa]o\s*direta|aviso\s*de\s*contrata|ato\s*que\s*autoriza/i
const TERMO_DE_REFERENCIA = /termo\s*de\s*refer|projeto\s*b[aá]sico|\btr\b/i
const APOIO = /anexo|habilita|planilha|or[cç]ament|minuta|contrato/i

// Quanto mais alto, mais cedo o documento entra na análise.
export function prioridadeDocumento(doc: DocumentoComTitulo): number {
  const titulo = doc.titulo ?? ''
  const tipo = doc.tipoDocumentoNome ?? ''

  if (CONTRATACAO_DIRETA.test(titulo) || CONTRATACAO_DIRETA.test(tipo)) return 5
  if (ADMINISTRATIVO.test(titulo)) return 0
  if (EDITAL.test(titulo)) return 5
  if (TERMO_DE_REFERENCIA.test(titulo) || TERMO_DE_REFERENCIA.test(tipo)) return 4
  if (APOIO.test(titulo)) return 3
  if (EDITAL.test(tipo)) return 2
  return 1
}

// Ordena do mais relevante para o menos — não filtra nada, quem chama
// decide o que descartar antes (ex: statusAtivo no PNCP).
export function ordenarPorPrioridade<T extends DocumentoComTitulo>(docs: T[]): T[] {
  return docs
    .map((doc, ordem) => ({ doc, ordem, peso: prioridadeDocumento(doc) }))
    .sort((a, b) => b.peso - a.peso || a.ordem - b.ordem)
    .map(({ doc }) => doc)
}
