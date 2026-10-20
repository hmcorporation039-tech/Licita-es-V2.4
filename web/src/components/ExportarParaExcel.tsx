'use client'

import { useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui'
import { ApiRequestError, baixarArquivo } from '@/lib/api'

const DIA_DE_BRASILIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })

const MENSAGEM_PADRAO_DE_ERRO = 'Não foi possível gerar a planilha agora. Tente de novo em instantes.'

export type PlanilhaExportavel = 'matches' | 'escolhidas'

const CAMINHO_DA_PLANILHA: Record<PlanilhaExportavel, string> = {
  matches: '/api/matches/exportar',
  escolhidas: '/api/participation-plans/exportar',
}

function mensagemDoErro(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.status === 401) return 'Sua sessão expirou. Entre de novo para exportar a planilha.'
    if (err.status === 429 || (err.status >= 400 && err.status < 500 && err.message)) return err.message
  }
  return MENSAGEM_PADRAO_DE_ERRO
}

export default function ExportarParaExcel({ planilha, title }: { planilha: PlanilhaExportavel; title?: string }) {
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function exportar() {
    setGerando(true)
    setErro(null)
    try {
      await baixarArquivo(CAMINHO_DA_PLANILHA[planilha], `licita-bela-${planilha}-${DIA_DE_BRASILIA.format(new Date())}.xlsx`)
    } catch (err) {
      setErro(mensagemDoErro(err))
    } finally {
      setGerando(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button variant="secondary" size="sm" icon={FileSpreadsheet} loading={gerando} onClick={exportar} title={title}>
        {gerando ? 'Gerando…' : 'Exportar para Excel'}
      </Button>
      {erro && (
        <p role="alert" className="max-w-xs text-xs text-danger sm:text-right">
          {erro}
        </p>
      )}
    </div>
  )
}
