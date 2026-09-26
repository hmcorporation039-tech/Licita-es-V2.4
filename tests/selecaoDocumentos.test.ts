import { describe, expect, it } from 'vitest'
import { PNCPDocumentInfo, selecionarDocumentos } from '../src/services/pncpDocumentsService'

function doc(titulo: string, tipoDocumentoNome: string, statusAtivo = true): PNCPDocumentInfo {
  return { uri: `https://pncp.gov.br/${titulo}`, titulo, tipoDocumentoNome, sequencialDocumento: 0, statusAtivo }
}

// Conjunto real, copiado do PNCP: CNPJ 01599409000139, ano 2026, sequencial 23.
// Repare que o órgão carimba "Edital" no tipo de quase tudo — classificar por
// tipoDocumentoNome joga o Termo de Referência para fora do corte.
const CONJUNTO_REAL: PNCPDocumentInfo[] = [
  doc('AUTORIZAÇÃO DE ABERTURA DE PROCESSO LICITATÓRIO', 'Edital'),
  doc('Estudo Técnico Preliminar (ETP)', 'Edital'),
  doc('DFD', 'Edital'),
  doc('COMPROVANTE DE PUBLICAÇÃO', 'Edital'),
  doc('Edital de Pregão Eletrônico com SRP - Lei n. 14.133/21 - NPD', 'Edital'),
  doc('TERMO DE REFERÊNCIA (TR)', 'Termo de Referência'),
  doc('SOLICITAÇÃO PARECER JURÍDICO', 'Outros Documentos'),
  doc('SOLICITAÇÃO DE PARECER CONTÁBIL', 'Outros Documentos'),
]

describe('selecionarDocumentos', () => {
  it('coloca o edital e o termo de referência à frente', () => {
    const [primeiro, segundo] = selecionarDocumentos(CONJUNTO_REAL)
    expect(primeiro.titulo).toContain('Edital de Pregão Eletrônico')
    expect(segundo.titulo).toContain('TERMO DE REFERÊNCIA')
  })

  it('mantém o termo de referência dentro do corte de 5 documentos', () => {
    const cinco = selecionarDocumentos(CONJUNTO_REAL).slice(0, 5)
    expect(cinco.map((d) => d.titulo)).toContain('TERMO DE REFERÊNCIA (TR)')
  })

  it('empurra peça administrativa para o fim', () => {
    const ordenados = selecionarDocumentos(CONJUNTO_REAL).map((d) => d.titulo)
    const posicaoEdital = ordenados.findIndex((t) => t.includes('Edital de Pregão'))
    for (const administrativo of ['COMPROVANTE DE PUBLICAÇÃO', 'SOLICITAÇÃO PARECER JURÍDICO', 'DFD']) {
      expect(ordenados.indexOf(administrativo)).toBeGreaterThan(posicaoEdital)
    }
  })

  it('ignora documento inativo', () => {
    const comInativo = [...CONJUNTO_REAL, doc('Edital RETIFICADO', 'Edital', false)]
    expect(selecionarDocumentos(comInativo).map((d) => d.titulo)).not.toContain('Edital RETIFICADO')
  })

  it('reconhece projeto básico como equivalente ao termo de referência', () => {
    const obra = [doc('Contrato assinado', 'Outros'), doc('PROJETO BÁSICO', 'Outros Documentos')]
    expect(selecionarDocumentos(obra)[0].titulo).toBe('PROJETO BÁSICO')
  })

  it('devolve lista vazia quando não há documento ativo', () => {
    expect(selecionarDocumentos([doc('Edital', 'Edital', false)])).toEqual([])
  })
})
