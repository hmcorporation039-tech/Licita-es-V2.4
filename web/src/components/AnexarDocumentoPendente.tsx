'use client'

import { useId, useState } from 'react'
import { Paperclip, Upload } from 'lucide-react'
import { api, ApiRequestError, enviarArquivo } from '@/lib/api'
import { erroDoArquivoDeDocumento, TIPOS_DE_ARQUIVO_ACEITOS } from '@/lib/arquivoDeDocumento'
import type { RequisitoDeHabilitacao } from '@/lib/adminTypes'
import { Button, Field, FormError, Input } from '@/components/ui'

export default function AnexarDocumentoPendente({ requisito, aoConcluir }: { requisito: RequisitoDeHabilitacao; aoConcluir: () => void }) {
  const [aberto, setAberto] = useState(false)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [validade, setValidade] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const idDoArquivo = useId()
  const idDaValidade = useId()
  const documentoExistente = requisito.documento
  const rotuloDoBotao = documentoExistente ? 'Enviar versão nova' : 'Anexar documento'

  function escolher(selecionado: File | null) {
    const problema = selecionado ? erroDoArquivoDeDocumento(selecionado) : null
    setErro(problema)
    setArquivo(problema ? null : selecionado)
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!arquivo) {
      setErro('Escolha o arquivo do documento.')
      return
    }
    setEnviando(true)
    setErro(null)
    try {
      if (documentoExistente) {
        await enviarArquivo(`/api/company-documents/${documentoExistente.id}/arquivo`, arquivo)
        await api.patch(`/api/company-documents/${documentoExistente.id}`, { dataValidade: validade || null })
      } else {
        await enviarArquivo('/api/company-documents/com-arquivo', arquivo, {
          metodo: 'POST',
          metadados: { tipo: requisito.id, nome: requisito.label, dataValidade: validade || null },
        })
      }
      setAberto(false)
      setArquivo(null)
      setValidade('')
      aoConcluir()
    } catch (err) {
      setErro(err instanceof ApiRequestError ? err.message : 'Não foi possível enviar o documento.')
    } finally {
      setEnviando(false)
    }
  }

  if (!aberto) {
    return (
      <Button size="sm" variant="secondary" icon={Paperclip} className="self-start" onClick={() => setAberto(true)}>
        {rotuloDoBotao}
      </Button>
    )
  }

  return (
    <form onSubmit={enviar} className="mt-1 flex flex-col gap-3 rounded-lg border border-line bg-sunken p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Arquivo (PDF, JPG ou PNG, até 10 MB)" id={idDoArquivo} required>
          <Input id={idDoArquivo} type="file" accept={TIPOS_DE_ARQUIVO_ACEITOS} onChange={(e) => escolher(e.target.files?.[0] ?? null)} />
        </Field>
        <Field label="Validade" id={idDaValidade} hint="Deixe em branco se o documento não vence, como o contrato social.">
          <Input id={idDaValidade} type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
        </Field>
      </div>
      {erro && <FormError>{erro}</FormError>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="sm" icon={Upload} loading={enviando} disabled={enviando}>
          {enviando ? 'Enviando…' : 'Salvar no cofre'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={enviando}
          onClick={() => {
            setAberto(false)
            setErro(null)
          }}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}
