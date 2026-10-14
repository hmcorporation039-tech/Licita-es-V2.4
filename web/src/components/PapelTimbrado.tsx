'use client'

import { useEffect, useRef, useState } from 'react'
import { ImageUp, Save, Trash2 } from 'lucide-react'
import { api, ApiRequestError, buscarArquivo, enviarArquivo } from '@/lib/api'
import type { Company, LogoDaEmpresa } from '@/lib/types'
import { Button, Field, FormError, Input, Notice, Panel, Textarea, useDialogo } from '@/components/ui'

const TAMANHO_MAXIMO_DA_LOGO = 2 * 1024 * 1024
const TIPOS_DA_LOGO = '.png,.jpg,.jpeg,image/png,image/jpeg'

export interface DadosDoTimbrado {
  razaoSocial: string
  documento: string
  endereco: string
  telefone: string
  email: string
  responsavel: string
}

function formatarCpf(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

function documentoFormatado(valor: string): string {
  const d = valor.replace(/\D/g, '')
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  if (d.length === 11) return formatarCpf(d)
  return valor
}

function erroDaLogo(arquivo: File): string | null {
  const nome = arquivo.name.toLowerCase()
  const tipoOk = ['image/png', 'image/jpeg'].includes(arquivo.type) || /\.(png|jpe?g)$/.test(nome)
  if (!tipoOk) return 'Envie a logomarca em PNG ou JPG.'
  if (arquivo.size === 0) return 'O arquivo está vazio.'
  if (arquivo.size > TAMANHO_MAXIMO_DA_LOGO) return 'A logomarca passa de 2 MB. Envie uma imagem menor.'
  return null
}

function useImagemDaLogo(logo: LogoDaEmpresa | null | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  const versao = logo?.updatedAt ?? null

  useEffect(() => {
    if (!versao) {
      setUrl(null)
      return
    }
    let cancelado = false
    let criada: string | null = null
    buscarArquivo('/api/company/logo')
      .then((blob) => {
        if (cancelado) return
        criada = URL.createObjectURL(blob)
        setUrl(criada)
      })
      .catch(() => {
        if (!cancelado) setUrl(null)
      })
    return () => {
      cancelado = true
      if (criada) URL.revokeObjectURL(criada)
    }
  }, [versao])

  return url
}

function Miniatura({ dados, logoUrl, cargo }: { dados: DadosDoTimbrado; logoUrl: string | null; cargo: string }) {
  const contato = [dados.telefone, dados.email].filter(Boolean).join(' · ')
  return (
    <figure className="flex flex-col items-center gap-2">
      <div aria-hidden className="flex aspect-[210/297] w-[180px] flex-col rounded-sm border border-line-strong bg-surface px-3 py-3 text-[7px] leading-tight text-ink-2">
        <div className="flex items-center gap-2 border-b border-line pb-1.5">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-5 max-w-[60px] object-contain" />
          ) : (
            <span className="truncate text-[8px] font-semibold text-ink">{dados.razaoSocial || 'Razão social'}</span>
          )}
          <span className="ml-auto shrink-0 font-mono text-faint">{documentoFormatado(dados.documento) || 'CNPJ'}</span>
        </div>
        <div className="mt-2.5 flex flex-col gap-1">
          <span className="mx-auto mb-1 h-1 w-1/2 rounded-sm bg-line-strong" />
          {[100, 94, 98, 70, 100, 88, 96, 60, 100, 92, 45].map((largura, i) => (
            <span key={i} className="h-0.5 rounded-sm bg-line" style={{ width: `${largura}%` }} />
          ))}
        </div>
        <div className="mt-auto flex flex-col items-center gap-0.5 pb-1.5">
          <span className="h-px w-3/5 bg-line-strong" />
          <span className="max-w-full truncate text-ink">{dados.responsavel || 'Responsável'}</span>
          <span className="max-w-full truncate text-faint">{cargo || 'Cargo'}</span>
        </div>
        <div className="flex flex-col items-center gap-px border-t border-line pt-1 text-center text-faint">
          <span className="line-clamp-2 max-w-full">{dados.endereco || 'Endereço da empresa'}</span>
          {contato && <span className="max-w-full truncate">{contato}</span>}
        </div>
      </div>
      <figcaption className="text-xs text-muted">Como vai sair</figcaption>
    </figure>
  )
}

export default function PapelTimbrado({
  company,
  souOwner,
  dados,
  onAtualizada,
}: {
  company: Company
  souOwner: boolean
  dados: DadosDoTimbrado
  onAtualizada: (parcial: Partial<Company>) => void
}) {
  const { confirmar, dialogo } = useDialogo()
  const campoDeArquivo = useRef<HTMLInputElement>(null)
  const logoUrl = useImagemDaLogo(company.logo)
  const [cpf, setCpf] = useState(formatarCpf(company.responsavelCpf ?? ''))
  const [cargo, setCargo] = useState(company.responsavelCargo ?? '')
  const [dadosBancarios, setDadosBancarios] = useState(company.dadosBancarios ?? '')
  const [salvando, setSalvando] = useState(false)
  const [enviandoLogo, setEnviandoLogo] = useState(false)
  const [removendoLogo, setRemovendoLogo] = useState(false)
  const [erroDaLogoAtual, setErroDaLogoAtual] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvo, setSalvo] = useState(false)

  async function enviarLogo(arquivo: File) {
    const problema = erroDaLogo(arquivo)
    setErroDaLogoAtual(problema)
    if (problema) return
    setEnviandoLogo(true)
    try {
      const logo = await enviarArquivo<LogoDaEmpresa>('/api/company/logo', arquivo)
      onAtualizada({ logo })
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 413) setErroDaLogoAtual('A logomarca passa de 2 MB. Envie uma imagem menor.')
      else setErroDaLogoAtual(err instanceof ApiRequestError ? err.message : 'Não foi possível enviar a logomarca.')
    } finally {
      setEnviandoLogo(false)
    }
  }

  async function removerLogo() {
    const ok = await confirmar({
      titulo: 'Remover a logomarca?',
      mensagem: 'A proposta e as declarações passam a sair com a razão social no cabeçalho.',
      confirmarRotulo: 'Remover',
      perigo: true,
    })
    if (!ok) return
    setErroDaLogoAtual(null)
    setRemovendoLogo(true)
    try {
      await api.delete('/api/company/logo')
      onAtualizada({ logo: null })
    } catch (err) {
      setErroDaLogoAtual(err instanceof ApiRequestError ? err.message : 'Não foi possível remover a logomarca.')
    } finally {
      setRemovendoLogo(false)
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setErros({})
    setSalvo(false)
    const digitos = cpf.replace(/\D/g, '')
    if (digitos && digitos.length !== 11) {
      setErros({ responsavelCpf: 'O CPF tem 11 dígitos.' })
      return
    }
    setSalvando(true)
    try {
      const atualizada = await api.patch<Company>('/api/company', {
        responsavelCpf: digitos || null,
        responsavelCargo: cargo.trim() || null,
        dadosBancarios: dadosBancarios.trim() || null,
      })
      onAtualizada({
        responsavelCpf: atualizada.responsavelCpf ?? null,
        responsavelCargo: atualizada.responsavelCargo ?? null,
        dadosBancarios: atualizada.dadosBancarios ?? null,
      })
      setSalvo(true)
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (/cpf/i.test(err.message) && Object.keys(err.campos).length === 0) setErros({ responsavelCpf: err.message })
        else if (Object.keys(err.campos).length > 0) setErros(err.campos)
        else setErro(err.message)
      } else {
        setErro('Não foi possível salvar o papel timbrado.')
      }
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Panel
      title="Papel timbrado"
      description={
        souOwner
          ? 'Cabeçalho, rodapé e assinatura da proposta comercial e das declarações. O nome do responsável vem do campo “Responsável” acima.'
          : 'Cabeçalho, rodapé e assinatura dos documentos gerados. Só o dono da empresa altera estes dados.'
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_200px]">
        <form onSubmit={salvar} className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted">Logomarca</span>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-16 w-40 shrink-0 items-center justify-center rounded border border-dashed border-line-strong bg-sunken p-2">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logomarca atual da empresa" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-center text-xs text-faint">{company.logo ? 'Carregando…' : 'Sem logomarca'}</span>
                )}
              </div>
              {souOwner && (
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={campoDeArquivo}
                    type="file"
                    accept={TIPOS_DA_LOGO}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden
                    onChange={(e) => {
                      const escolhido = e.target.files?.[0]
                      e.target.value = ''
                      if (escolhido) void enviarLogo(escolhido)
                    }}
                  />
                  <Button size="sm" icon={ImageUp} loading={enviandoLogo} disabled={removendoLogo} onClick={() => campoDeArquivo.current?.click()}>
                    {company.logo ? 'Trocar' : 'Enviar'}
                  </Button>
                  {company.logo && (
                    <Button size="sm" variant="ghost" icon={Trash2} loading={removendoLogo} disabled={enviandoLogo} onClick={removerLogo}>
                      Remover
                    </Button>
                  )}
                </div>
              )}
            </div>
            <p className="text-xs text-muted">
              {company.logo ? 'PNG ou JPG de até 2 MB.' : 'Sem logomarca — o cabeçalho usa a razão social. PNG ou JPG de até 2 MB.'}
            </p>
            <FormError>{erroDaLogoAtual}</FormError>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="CPF do responsável legal" hint="Sai abaixo da assinatura." error={erros.responsavelCpf}>
              <Input
                inputMode="numeric"
                autoComplete="off"
                placeholder="000.000.000-00"
                className="font-mono"
                value={cpf}
                onChange={(e) => setCpf(formatarCpf(e.target.value))}
                disabled={!souOwner}
              />
            </Field>
            <Field label="Cargo do responsável" error={erros.responsavelCargo}>
              <Input placeholder="Sócio-administrador" maxLength={80} value={cargo} onChange={(e) => setCargo(e.target.value)} disabled={!souOwner} />
            </Field>
            <Field label="Dados bancários para a proposta" hint="Banco, agência e conta ou chave PIX." error={erros.dadosBancarios} className="sm:col-span-2">
              <Textarea rows={3} maxLength={300} value={dadosBancarios} onChange={(e) => setDadosBancarios(e.target.value)} disabled={!souOwner} />
            </Field>
          </div>

          <FormError>{erro}</FormError>
          {salvo && <Notice tone="ok">Papel timbrado salvo.</Notice>}

          {souOwner && (
            <div className="flex flex-wrap gap-2 border-t border-line-soft pt-4">
              <Button type="submit" variant="primary" icon={Save} loading={salvando}>
                {salvando ? 'Salvando…' : 'Salvar papel timbrado'}
              </Button>
            </div>
          )}
        </form>

        <Miniatura dados={dados} logoUrl={logoUrl} cargo={cargo} />
      </div>
      {dialogo}
    </Panel>
  )
}
