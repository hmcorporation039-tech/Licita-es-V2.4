// ============================================================
// lib/documentTypes.ts — Tipos de documento do cofre da empresa
// (precisa bater com os ids de src/lib/checklistTemplate.ts no backend —
// é por esse código que o cofre cruza automaticamente com o checklist
// de cada licitação)
// ============================================================

export const DOCUMENT_TYPE_OPTIONS: { value: string; label: string; section: string }[] = [
  { value: 'contrato-social', label: 'Contrato social ou estatuto e alterações', section: 'Habilitação Jurídica' },
  { value: 'ata-eleicao-diretoria', label: 'Ata de eleição da diretoria', section: 'Habilitação Jurídica' },
  { value: 'rg-cpf-socios', label: 'RG e CPF dos sócios ou representantes legais', section: 'Habilitação Jurídica' },
  { value: 'procuracao', label: 'Procuração com poderes específicos', section: 'Habilitação Jurídica' },
  { value: 'cartao-cnpj', label: 'Cartão CNPJ atualizado', section: 'Habilitação Jurídica' },

  { value: 'cnd-federal', label: 'Certidão Negativa de Débitos Federais', section: 'Regularidade Fiscal e Trabalhista' },
  { value: 'crf-fgts', label: 'Certidão de Regularidade do FGTS (CRF)', section: 'Regularidade Fiscal e Trabalhista' },
  { value: 'cndt', label: 'Certidão Negativa de Débitos Trabalhistas (CNDT)', section: 'Regularidade Fiscal e Trabalhista' },
  { value: 'regularidade-estadual', label: 'Certidão de regularidade estadual', section: 'Regularidade Fiscal e Trabalhista' },
  { value: 'regularidade-municipal', label: 'Certidão de regularidade municipal', section: 'Regularidade Fiscal e Trabalhista' },

  { value: 'cnd-falencia', label: 'Certidão negativa de falência e recuperação judicial', section: 'Qualificação Econômico-Financeira' },
  { value: 'balanco-patrimonial', label: 'Balanço patrimonial e demonstrações contábeis', section: 'Qualificação Econômico-Financeira' },
  { value: 'indices-contabeis', label: 'Cálculo dos índices contábeis exigidos', section: 'Qualificação Econômico-Financeira' },

  { value: 'atestado-capacidade-tecnica', label: 'Atestado(s) de capacidade técnica', section: 'Qualificação Técnica' },
  { value: 'registro-conselho-classe', label: 'Registro no conselho de classe', section: 'Qualificação Técnica' },
  { value: 'vinculo-responsavel-tecnico', label: 'Comprovação de vínculo com responsável técnico', section: 'Qualificação Técnica' },
  { value: 'art-rrt', label: 'ART/RRT — Anotação ou Registro de Responsabilidade Técnica', section: 'Qualificação Técnica' },

  { value: 'declaracao-nao-emprego-menores', label: 'Declaração de não emprego de menores', section: 'Documentos Complementares' },
  { value: 'declaracao-fato-impeditivo', label: 'Declaração de inexistência de fato impeditivo à habilitação', section: 'Documentos Complementares' },
  { value: 'declaracao-me-epp', label: 'Declaração de enquadramento como ME/EPP', section: 'Documentos Complementares' },
  { value: 'garantia-proposta', label: 'Garantia de proposta', section: 'Documentos Complementares' },

  { value: 'planilha-custos', label: 'Planilha de composição de custos e formação de preços', section: 'Proposta Técnica e Comercial' },
  { value: 'memorial-descritivo', label: 'Memorial descritivo ou metodologia de execução', section: 'Proposta Técnica e Comercial' },
  { value: 'cronograma-execucao', label: 'Cronograma de execução dos serviços', section: 'Proposta Técnica e Comercial' },
  { value: 'declaracao-vistoria', label: 'Declaração de vistoria técnica', section: 'Documentos de Vistoria e Execução' },
  {
    value: 'compatibilidade-convencao-coletiva',
    label: 'Comprovação de compatibilidade com a convenção coletiva da categoria',
    section: 'Documentos de Vistoria e Execução',
  },
]

export function documentTypeLabel(tipo: string | null): string | null {
  if (!tipo) return null
  return DOCUMENT_TYPE_OPTIONS.find((o) => o.value === tipo)?.label ?? tipo
}
