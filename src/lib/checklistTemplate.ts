// ============================================================
// lib/checklistTemplate.ts — Template padrão do checklist de habilitação
// Baseado no guia "Checklist de Documentação para Licitações Públicas —
// Prestação de Serviços" (Lei nº 14.133/2021)
// ============================================================

export interface ChecklistItem {
  id: string
  section: string
  label: string
  hint?: string
  checked: boolean
  custom: boolean
}

interface TemplateEntry {
  id: string
  section: string
  label: string
  hint?: string
}

const TEMPLATE: TemplateEntry[] = [
  // 2. Habilitação Jurídica
  { id: 'contrato-social', section: 'Habilitação Jurídica', label: 'Contrato social ou estatuto e alterações', hint: 'ou última alteração consolidada' },
  { id: 'ata-eleicao-diretoria', section: 'Habilitação Jurídica', label: 'Ata de eleição da diretoria', hint: 'quando aplicável a sociedades anônimas' },
  { id: 'rg-cpf-socios', section: 'Habilitação Jurídica', label: 'RG e CPF dos sócios ou representantes legais' },
  { id: 'procuracao', section: 'Habilitação Jurídica', label: 'Procuração com poderes específicos', hint: 'necessária quando o representante não for sócio' },
  { id: 'cartao-cnpj', section: 'Habilitação Jurídica', label: 'Cartão CNPJ atualizado' },

  // 3. Regularidade Fiscal e Trabalhista
  { id: 'cnd-federal', section: 'Regularidade Fiscal e Trabalhista', label: 'Certidão Negativa de Débitos Federais', hint: 'Receita Federal / PGFN' },
  { id: 'crf-fgts', section: 'Regularidade Fiscal e Trabalhista', label: 'Certidão de Regularidade do FGTS (CRF)' },
  { id: 'cndt', section: 'Regularidade Fiscal e Trabalhista', label: 'Certidão Negativa de Débitos Trabalhistas (CNDT)' },
  { id: 'regularidade-estadual', section: 'Regularidade Fiscal e Trabalhista', label: 'Certidão de regularidade estadual', hint: 'conforme a sede da empresa' },
  { id: 'regularidade-municipal', section: 'Regularidade Fiscal e Trabalhista', label: 'Certidão de regularidade municipal', hint: 'conforme a sede da empresa' },

  // 4. Qualificação Econômico-Financeira
  { id: 'cnd-falencia', section: 'Qualificação Econômico-Financeira', label: 'Certidão negativa de falência e recuperação judicial' },
  { id: 'balanco-patrimonial', section: 'Qualificação Econômico-Financeira', label: 'Balanço patrimonial e demonstrações contábeis', hint: 'último exercício social' },
  { id: 'indices-contabeis', section: 'Qualificação Econômico-Financeira', label: 'Cálculo dos índices contábeis exigidos', hint: 'liquidez geral, corrente, solvência — conforme o edital' },

  // 5. Qualificação Técnica
  { id: 'atestado-capacidade-tecnica', section: 'Qualificação Técnica', label: 'Atestado(s) de capacidade técnica', hint: 'compatíveis com o objeto do contrato' },
  { id: 'registro-conselho-classe', section: 'Qualificação Técnica', label: 'Registro no conselho de classe', hint: 'CREA, CAU, CRC, CRM, OAB — quando exigido pela natureza do serviço' },
  { id: 'vinculo-responsavel-tecnico', section: 'Qualificação Técnica', label: 'Comprovação de vínculo com responsável técnico' },
  { id: 'art-rrt', section: 'Qualificação Técnica', label: 'ART/RRT — Anotação ou Registro de Responsabilidade Técnica', hint: 'quando aplicável' },

  // 6. Documentos Complementares
  { id: 'declaracao-nao-emprego-menores', section: 'Documentos Complementares', label: 'Declaração de não emprego de menores' },
  { id: 'declaracao-fato-impeditivo', section: 'Documentos Complementares', label: 'Declaração de inexistência de fato impeditivo à habilitação' },
  { id: 'declaracao-me-epp', section: 'Documentos Complementares', label: 'Declaração de enquadramento como ME/EPP', hint: 'para usufruir dos benefícios da LC 123/2006, se aplicável' },
  { id: 'garantia-proposta', section: 'Documentos Complementares', label: 'Garantia de proposta', hint: 'quando exigida no edital' },

  // 7. Específico para Prestação de Serviços
  { id: 'planilha-custos', section: 'Proposta Técnica e Comercial', label: 'Planilha de composição de custos e formação de preços' },
  { id: 'memorial-descritivo', section: 'Proposta Técnica e Comercial', label: 'Memorial descritivo ou metodologia de execução' },
  { id: 'cronograma-execucao', section: 'Proposta Técnica e Comercial', label: 'Cronograma de execução dos serviços' },
  { id: 'declaracao-vistoria', section: 'Documentos de Vistoria e Execução', label: 'Declaração de vistoria técnica', hint: 'quando exigida no edital' },
  { id: 'compatibilidade-convencao-coletiva', section: 'Documentos de Vistoria e Execução', label: 'Comprovação de compatibilidade com a convenção coletiva da categoria', hint: 'encargos sociais e trabalhistas' },
]

export function buildChecklistTemplate(): ChecklistItem[] {
  return TEMPLATE.map((entry) => ({ ...entry, checked: false, custom: false }))
}
