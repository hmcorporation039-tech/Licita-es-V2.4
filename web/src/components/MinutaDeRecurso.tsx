'use client'

import { useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { ApiRequestError } from '@/lib/api'
import { baixarRecurso, previaDoRecurso } from '@/lib/concorrentes'
import type { BlocoDoDocumento, PreviaDoDocumento } from '@/lib/types'
import { Button, Notice } from '@/components/ui'

function Bloco({ b }: { b: BlocoDoDocumento }) {
  if (b.tipo === 'titulo') return <p className="mt-3 text-sm font-bold uppercase tracking-wide text-ink">{b.texto}</p>
  if (b.tipo === 'paragrafo') return b.texto.trim() ? <p className="text-sm leading-relaxed text-ink-2">{b.texto}</p> : <span className="block h-2" />
  if (b.tipo === 'assinatura') return <p className="mt-4 text-sm text-ink-2">{b.local}</p>
  if (b.tipo === 'quebra') return <hr className="my-2 border-line-soft" />
  return null
}

function nomeBase(nomeConcorrente: string | null, id: string): string {
  return `recurso-${(nomeConcorrente || id.slice(0, 8)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').slice(0, 60)}`
}

export default function MinutaDeRecurso({ analiseId, nomeConcorrente }: { analiseId: string; nomeConcorrente: string | null }) {
  const [previa, setPrevia] = useState<PreviaDoDocumento | null>(null)
  const [aberto, setAberto] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [baixando, setBaixando] = useState<'pdf' | 'docx' | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function gerar() {
    if (previa) {
      setAberto((a) => !a)
      return
    }
    setCarregando(true)
    setErro(null)
    try {
      setPrevia(await previaDoRecurso(analiseId))
      setAberto(true)
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível gerar a minuta.')
    } finally {
      setCarregando(false)
    }
  }

  async function baixar(formato: 'pdf' | 'docx') {
    if (!previa) return
    setBaixando(formato)
    setErro(null)
    try {
      await baixarRecurso(analiseId, formato, previa.documento, `${nomeBase(nomeConcorrente, analiseId)}.${formato}`)
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível baixar o arquivo.')
    } finally {
      setBaixando(null)
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-line-soft px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" icon={FileText} loading={carregando} onClick={gerar}>
          {previa ? (aberto ? 'Esconder minuta de recurso' : 'Ver minuta de recurso') : 'Gerar minuta de recurso'}
        </Button>
        {previa && aberto && (
          <>
            <Button size="sm" variant="primary" icon={Download} loading={baixando === 'pdf'} onClick={() => baixar('pdf')}>
              Baixar PDF
            </Button>
            <Button size="sm" variant="secondary" icon={Download} loading={baixando === 'docx'} onClick={() => baixar('docx')}>
              Baixar Word
            </Button>
          </>
        )}
      </div>
      {erro && <Notice tone="danger">{erro}</Notice>}
      {previa && aberto && (
        <>
          <Notice tone="warn">Rascunho gerado a partir dos achados. Revise com o seu advogado e confira o prazo e a fase do recurso antes de protocolar.</Notice>
          {previa.pendencias.length > 0 && (
            <Notice tone="info">
              Complete antes de protocolar: {previa.pendencias.join('; ')}. Os dados da empresa ficam em “Empresa e documentos”.
            </Notice>
          )}
          <div className="rounded-lg border border-line bg-surface px-4 py-3">
            {previa.documento.blocos.map((b, i) => (
              <Bloco key={i} b={b} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
