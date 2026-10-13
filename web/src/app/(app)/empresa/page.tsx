'use client'

import { formatarData } from '@/lib/datas'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FilePlus, Pause, Play, Save, Trash2, UserPlus, UserRoundCog } from 'lucide-react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'
import { Company, CompanyDocument, CompanyMember, CompanyType } from '@/lib/types'
import { DOCUMENT_TYPE_OPTIONS, documentTypeLabel } from '@/lib/documentTypes'
import {
  Button,
  Carregando,
  EmptyState,
  ErrorState,
  Field,
  FormError,
  Input,
  Notice,
  PageHeader,
  Panel,
  Select,
  StatusTag,
  Table,
  TableWrap,
  Td,
  Th,
  THead,
  Tr,
  useDialogo,
  type Tom,
} from '@/components/ui'

type ValidadeStatus = 'sem-validade' | 'valido' | 'vence-em-breve' | 'vencido'

function validadeStatus(dataValidade: string | null): ValidadeStatus {
  if (!dataValidade) return 'sem-validade'
  const dias = (new Date(dataValidade).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  if (dias < 0) return 'vencido'
  if (dias <= 15) return 'vence-em-breve'
  return 'valido'
}

const STATUS_LABEL: Record<ValidadeStatus, string> = {
  'sem-validade': 'Não vence',
  valido: 'Válido',
  'vence-em-breve': 'Vence em breve',
  vencido: 'Vencido',
}

const STATUS_TOM: Record<ValidadeStatus, Tom> = {
  'sem-validade': 'neutral',
  valido: 'neutral',
  'vence-em-breve': 'warn',
  vencido: 'danger',
}

const SECOES_DE_DOCUMENTO = DOCUMENT_TYPE_OPTIONS.reduce<{ secao: string; opcoes: typeof DOCUMENT_TYPE_OPTIONS }[]>((grupos, opt) => {
  const grupo = grupos.find((g) => g.secao === opt.section)
  if (grupo) grupo.opcoes.push(opt)
  else grupos.push({ secao: opt.section, opcoes: [opt] })
  return grupos
}, [])

function formatData(v: string | null) {
  return formatarData(v)
}

function formatarTelefone(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 11)
  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  const ddd = d.slice(0, 2)
  const resto = d.slice(2)
  if (resto.length <= 4) return `(${ddd}) ${resto}`
  const meio = resto.length === 9 ? 5 : 4
  return `(${ddd}) ${resto.slice(0, meio)}-${resto.slice(meio)}`
}

function telefoneParaExibir(valor: string | null): string {
  if (!valor) return ''
  const digitos = valor.replace(/\D/g, '').length
  return digitos === 10 || digitos === 11 ? formatarTelefone(valor) : valor
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-3 text-xs font-semibold text-ink-2">{titulo}</legend>
      {children}
    </fieldset>
  )
}

export default function EmpresaPage() {
  const user = useRequireSession()
  const { confirmar, dialogo } = useDialogo()
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [tipo, setTipo] = useState<CompanyType>('PESSOA_FISICA')
  const [documentoTravado, setDocumentoTravado] = useState(false)
  const [documento, setDocumento] = useState('')
  const [companyEmail, setCompanyEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [responsavel, setResponsavel] = useState('')
  const [endereco, setEndereco] = useState('')
  const [cep, setCep] = useState('')
  const [numero, setNumero] = useState('')
  const [complemento, setComplemento] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('')
  const [cepMsg, setCepMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const numeroRef = useRef<HTMLInputElement>(null)
  const [baseMunicipio, setBaseMunicipio] = useState('')
  const [baseUf, setBaseUf] = useState('')
  const [savingCompany, setSavingCompany] = useState(false)

  const [memberEmail, setMemberEmail] = useState('')
  const [memberName, setMemberName] = useState('')
  const [memberPassword, setMemberPassword] = useState('')
  const [creatingMember, setCreatingMember] = useState(false)

  const [docs, setDocs] = useState<CompanyDocument[]>([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [docsError, setDocsError] = useState<string | null>(null)
  const [docsErroCarregar, setDocsErroCarregar] = useState<string | null>(null)
  const [docTipo, setDocTipo] = useState('')
  const [docNome, setDocNome] = useState('')
  const [docDataEmissao, setDocDataEmissao] = useState('')
  const [docDataValidade, setDocDataValidade] = useState('')
  const [docObservacao, setDocObservacao] = useState('')
  const [creatingDoc, setCreatingDoc] = useState(false)

  useEffect(() => {
    if (!user) return
    load()
    loadDocs()
  }, [user])

  async function load() {
    setLoading(true)
    try {
      const data = await api.get<Company>('/api/company')
      setCompany(data)
      setName(data.name)
      setTipo(data.tipo)
      setDocumento(data.tipo === 'PESSOA_JURIDICA' ? (data.cnpj ?? '') : (data.cpf ?? ''))
      setDocumentoTravado(!!(data.cnpj || data.cpf))
      setCompanyEmail(data.email ?? '')
      setTelefone(telefoneParaExibir(data.telefone))
      setResponsavel(data.responsavel ?? '')
      setEndereco(data.endereco ?? '')
      setCep(data.cep ?? '')
      setNumero(data.enderecoNumero ?? '')
      setComplemento(data.enderecoComplemento ?? '')
      setBairro(data.enderecoBairro ?? '')
      setCidade(data.enderecoCidade ?? '')
      setUf(data.enderecoUf ?? '')
      setBaseMunicipio(data.baseMunicipio ?? '')
      setBaseUf(data.baseUf ?? '')
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Erro ao carregar empresa')
    } finally {
      setLoading(false)
    }
  }

  async function loadDocs() {
    setDocsLoading(true)
    setDocsErroCarregar(null)
    try {
      const data = await api.get<CompanyDocument[]>('/api/company-documents')
      setDocs(data)
    } catch (err) {
      setDocsErroCarregar(err instanceof ApiRequestError ? err.message : 'Erro ao carregar documentos')
    } finally {
      setDocsLoading(false)
    }
  }

  if (!user || !company) {
    if (loading) return <Carregando linhas={6} />
    if (user && error)
      return (
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null)
            load()
          }}
        />
      )
    return null
  }

  const souOwner = company.users.find((m) => m.id === user.id)?.companyRole === 'OWNER'

  const formatarCep = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 8)
    return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d
  }

  async function aoDigitarCep(valor: string) {
    const formatado = formatarCep(valor)
    setCep(formatado)
    setCepMsg(null)
    if (formatado.replace(/\D/g, '').length !== 8) return
    setBuscandoCep(true)
    try {
      const r = await api.get<{ logradouro: string; bairro: string; cidade: string; uf: string }>(`/api/company/cep/${formatado.replace(/\D/g, '')}`)
      setEndereco(r.logradouro)
      setBairro(r.bairro)
      setCidade(r.cidade)
      setUf(r.uf)
      if (!baseMunicipio.trim() && !baseUf.trim()) {
        setBaseMunicipio(r.cidade)
        setBaseUf(r.uf)
      }
      setCepMsg({ tipo: 'ok', texto: r.logradouro ? 'Endereço preenchido. Informe só o número.' : 'Cidade preenchida. Informe a rua e o número.' })
      numeroRef.current?.focus()
    } catch (err) {
      setCepMsg({ tipo: 'erro', texto: err instanceof ApiRequestError ? err.message : 'Não foi possível consultar o CEP.' })
    } finally {
      setBuscandoCep(false)
    }
  }

  async function salvarEmpresa(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSavingCompany(true)
    try {
      const updated = await api.patch<Company>('/api/company', {
        name,
        tipo,
        cnpj: tipo === 'PESSOA_JURIDICA' ? documento || null : null,
        cpf: tipo === 'PESSOA_FISICA' ? documento || null : null,
        email: companyEmail || null,
        telefone: telefone || null,
        responsavel: responsavel || null,
        endereco: endereco || null,
        cep: cep || null,
        enderecoNumero: numero || null,
        enderecoComplemento: complemento || null,
        enderecoBairro: bairro || null,
        enderecoCidade: cidade || null,
        enderecoUf: uf.trim() ? uf.trim().toUpperCase() : null,
        baseMunicipio: baseMunicipio.trim() && baseUf.trim() ? baseMunicipio.trim() : null,
        baseUf: baseMunicipio.trim() && baseUf.trim() ? baseUf.trim().toUpperCase() : null,
      })
      setCompany((prev) => (prev ? { ...prev, ...updated } : prev))
      setInfo('Dados da empresa atualizados.')
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Erro ao salvar empresa')
    } finally {
      setSavingCompany(false)
    }
  }

  async function convidarMembro(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setCreatingMember(true)
    try {
      const result = await api.post<{ email: string; generatedPassword?: string }>('/api/company/members', {
        email: memberEmail,
        name: memberName || undefined,
        password: memberPassword || undefined,
      })
      setInfo(
        result.generatedPassword
          ? `Conta criada para ${result.email}. Senha gerada: ${result.generatedPassword} (repasse com segurança — não fica salva em nenhum outro lugar)`
          : `Conta criada para ${result.email}.`
      )
      setMemberEmail('')
      setMemberName('')
      setMemberPassword('')
      await load()
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Erro ao convidar membro')
    } finally {
      setCreatingMember(false)
    }
  }

  async function alternarPapel(membro: CompanyMember) {
    setError(null)
    try {
      await api.patch(`/api/company/members/${membro.id}`, {
        companyRole: membro.companyRole === 'OWNER' ? 'MEMBER' : 'OWNER',
      })
      await load()
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Erro ao alterar papel')
    }
  }

  async function alternarAtivo(membro: CompanyMember) {
    setError(null)
    try {
      await api.patch(`/api/company/members/${membro.id}`, { active: !membro.active })
      await load()
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Erro ao alterar acesso')
    }
  }

  function onSelectDocTipo(value: string) {
    setDocTipo(value)
    if (value && !docNome) {
      const opt = DOCUMENT_TYPE_OPTIONS.find((o) => o.value === value)
      if (opt) setDocNome(opt.label)
    }
  }

  async function criarDocumento(e: React.FormEvent) {
    e.preventDefault()
    setDocsError(null)
    setCreatingDoc(true)
    try {
      await api.post('/api/company-documents', {
        tipo: docTipo || null,
        nome: docNome,
        dataEmissao: docDataEmissao || null,
        dataValidade: docDataValidade || null,
        observacao: docObservacao.trim() || null,
      })
      setDocTipo('')
      setDocNome('')
      setDocDataEmissao('')
      setDocDataValidade('')
      setDocObservacao('')
      await loadDocs()
    } catch (err) {
      setDocsError(err instanceof ApiRequestError ? err.message : 'Erro ao cadastrar documento')
    } finally {
      setCreatingDoc(false)
    }
  }

  async function removerDocumento(docId: string) {
    if (!(await confirmar({ titulo: 'Remover este documento?', mensagem: 'Ele deixa de ser cruzado com o checklist das licitações.', confirmarRotulo: 'Remover', perigo: true }))) return
    await api.delete(`/api/company-documents/${docId}`)
    await loadDocs()
  }

  const travado = !souOwner || documentoTravado
  const dicaDoCep = buscandoCep ? (
    'Buscando endereço…'
  ) : cepMsg ? (
    <span className={cepMsg.tipo === 'erro' ? 'text-warn' : undefined}>{cepMsg.texto}</span>
  ) : (
    'Preenche o endereço sozinho.'
  )

  return (
    <>
      <PageHeader title="Empresa" description="Dados cadastrais, documentos de habilitação e usuários com acesso." />

      {error && <Notice tone="danger">{error}</Notice>}
      {info && <Notice tone="info">{info}</Notice>}

      <Panel title="Dados da empresa" description={souOwner ? undefined : 'Só o dono da empresa altera estes dados.'}>
        <form onSubmit={salvarEmpresa} className="flex flex-col gap-6">
          <Secao titulo="Identificação">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nome">
                <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!souOwner} />
              </Field>
              <Field label="Tipo de conta" hint={documentoTravado ? 'Para alterar o tipo de conta, fale com o suporte.' : undefined}>
                <Select value={tipo} onChange={(e) => setTipo(e.target.value as CompanyType)} disabled={travado}>
                  <option value="PESSOA_FISICA">Pessoa física</option>
                  <option value="PESSOA_JURIDICA">Pessoa jurídica</option>
                </Select>
              </Field>
              <Field
                label={tipo === 'PESSOA_JURIDICA' ? 'CNPJ' : 'CPF'}
                hint={documentoTravado ? 'Para alterar o CPF/CNPJ, fale com o suporte.' : 'Opcional.'}
              >
                <Input className="font-mono" value={documento} onChange={(e) => setDocumento(e.target.value)} disabled={travado} />
              </Field>
              <Field label="E-mail da empresa" hint="Opcional.">
                <Input type="email" value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} disabled={!souOwner} />
              </Field>
              <Field label="Telefone" hint="Opcional.">
                <Input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="(00) 00000-0000"
                  className="font-mono"
                  value={telefone}
                  onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
                  disabled={!souOwner}
                />
              </Field>
              <Field label="Responsável" hint="Opcional.">
                <Input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} disabled={!souOwner} />
              </Field>
            </div>
          </Secao>

          <Secao titulo="Endereço">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
              <Field label="CEP" hint={<span aria-live="polite">{dicaDoCep}</span>} className="sm:col-span-2">
                <Input inputMode="numeric" className="font-mono" value={cep} onChange={(e) => aoDigitarCep(e.target.value)} disabled={!souOwner} />
              </Field>
              <div className="hidden sm:col-span-4 sm:block" />
              <Field label="Rua / avenida" className="sm:col-span-4">
                <Input value={endereco} onChange={(e) => setEndereco(e.target.value)} disabled={!souOwner} />
              </Field>
              <Field label="Número" className="sm:col-span-2">
                <Input ref={numeroRef} className="font-mono" value={numero} onChange={(e) => setNumero(e.target.value)} disabled={!souOwner} />
              </Field>
              <Field label="Complemento" className="sm:col-span-3">
                <Input placeholder="Sala, bloco…" value={complemento} onChange={(e) => setComplemento(e.target.value)} disabled={!souOwner} />
              </Field>
              <Field label="Bairro" className="sm:col-span-3">
                <Input value={bairro} onChange={(e) => setBairro(e.target.value)} disabled={!souOwner} />
              </Field>
              <Field label="Cidade" className="sm:col-span-4">
                <Input value={cidade} onChange={(e) => setCidade(e.target.value)} disabled={!souOwner} />
              </Field>
              <Field label="UF" className="sm:col-span-2">
                <Input maxLength={2} className="font-mono uppercase" value={uf} onChange={(e) => setUf(e.target.value.toUpperCase())} disabled={!souOwner} />
              </Field>
            </div>
          </Secao>

          <Secao titulo="Base de entregas">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
              <Field label="Cidade" hint="Usada no custo de deslocamento." className="sm:col-span-4">
                <Input value={baseMunicipio} onChange={(e) => setBaseMunicipio(e.target.value)} disabled={!souOwner} />
              </Field>
              <Field label="UF" className="sm:col-span-2">
                <Input maxLength={2} className="font-mono uppercase" value={baseUf} onChange={(e) => setBaseUf(e.target.value.toUpperCase())} disabled={!souOwner} />
              </Field>
            </div>
          </Secao>

          {souOwner && (
            <div className="flex flex-wrap gap-2 border-t border-line-soft pt-4">
              <Button type="submit" variant="primary" icon={Save} loading={savingCompany}>
                {savingCompany ? 'Salvando…' : 'Salvar'}
              </Button>
            </div>
          )}
        </form>
      </Panel>

      <Panel
        title="Documentos de habilitação e constituição"
        description="Cadastre uma vez os documentos que a empresa já possui — eles são cruzados automaticamente com o checklist de cada licitação, e avisamos quando algum estiver perto de vencer."
      >
        <div className="flex flex-col gap-6">
          {docsLoading ? (
            <Carregando />
          ) : docsErroCarregar ? (
            <ErrorState message={docsErroCarregar} onRetry={loadDocs} />
          ) : docs.length === 0 ? (
            <EmptyState title="Nenhum documento cadastrado ainda" description="Cadastre abaixo as certidões e documentos que a empresa já tem." />
          ) : (
            <>
              <ul className="flex flex-col divide-y divide-line-soft rounded border border-line sm:hidden">
                {docs.map((doc) => {
                  const status = validadeStatus(doc.dataValidade)
                  return (
                    <li key={doc.id} className="flex items-start gap-3 px-3 py-3">
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <p className="break-words text-sm font-medium text-ink">{doc.nome}</p>
                        <p className="text-xs text-muted">{documentTypeLabel(doc.tipo) ?? 'Avulso'}</p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-xs text-muted">
                            Validade <span className="font-mono text-ink-2">{formatData(doc.dataValidade)}</span>
                          </span>
                          <StatusTag tone={STATUS_TOM[status]}>{STATUS_LABEL[status]}</StatusTag>
                        </div>
                        {doc.observacao && <p className="text-xs text-faint">{doc.observacao}</p>}
                      </div>
                      <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Remover ${doc.nome}`} onClick={() => removerDocumento(doc.id)} />
                    </li>
                  )
                })}
              </ul>
              <TableWrap minWidth={640} className="hidden sm:block">
                <Table>
                  <THead>
                    <tr>
                      <Th>Documento</Th>
                      <Th align="right">Emissão</Th>
                      <Th align="right">Validade</Th>
                      <Th>Situação</Th>
                      <Th>
                        <span className="sr-only">Ações</span>
                      </Th>
                    </tr>
                  </THead>
                  <tbody>
                    {docs.map((doc) => {
                      const status = validadeStatus(doc.dataValidade)
                      return (
                        <Tr key={doc.id}>
                          <Td>
                            <p className="font-medium text-ink">{doc.nome}</p>
                            <p className="text-xs text-muted">{documentTypeLabel(doc.tipo) ?? 'Avulso'}</p>
                            {doc.observacao && <p className="mt-0.5 text-xs text-faint">{doc.observacao}</p>}
                          </Td>
                          <Td numeric muted>
                            {formatData(doc.dataEmissao)}
                          </Td>
                          <Td numeric>{formatData(doc.dataValidade)}</Td>
                          <Td>
                            <StatusTag tone={STATUS_TOM[status]}>{STATUS_LABEL[status]}</StatusTag>
                          </Td>
                          <Td className="w-px text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={Trash2}
                              aria-label={`Remover ${doc.nome}`}
                              onClick={() => removerDocumento(doc.id)}
                            />
                          </Td>
                        </Tr>
                      )
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            </>
          )}

          <form onSubmit={criarDocumento} className="flex flex-col gap-4 border-t border-line-soft pt-4">
            <h3 className="text-sm font-semibold text-ink">Cadastrar documento</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Tipo de documento" className="sm:col-span-2">
                <Select value={docTipo} onChange={(e) => onSelectDocTipo(e.target.value)}>
                  <option value="">Documento avulso (fora da lista padrão)</option>
                  {SECOES_DE_DOCUMENTO.map((g) => (
                    <optgroup key={g.secao} label={g.secao}>
                      {g.opcoes.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </Field>
              <Field label="Nome do documento" required className="sm:col-span-2">
                <Input value={docNome} onChange={(e) => setDocNome(e.target.value)} />
              </Field>
              <Field label="Data de emissão">
                <Input type="date" className="font-mono" value={docDataEmissao} onChange={(e) => setDocDataEmissao(e.target.value)} />
              </Field>
              <Field label="Data de validade" hint="Vazio = não vence.">
                <Input type="date" className="font-mono" value={docDataValidade} onChange={(e) => setDocDataValidade(e.target.value)} />
              </Field>
              <Field label="Observação" hint="Opcional." className="sm:col-span-2">
                <Input value={docObservacao} onChange={(e) => setDocObservacao(e.target.value)} />
              </Field>
            </div>
            <FormError>{docsError}</FormError>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" icon={FilePlus} loading={creatingDoc}>
                {creatingDoc ? 'Salvando…' : 'Cadastrar documento'}
              </Button>
            </div>
          </form>
        </div>
      </Panel>

      <Panel title="Usuários da empresa">
        <div className="flex flex-col gap-6">
          <TableWrap minWidth={souOwner ? 640 : 420}>
            <Table>
              <THead>
                <tr>
                  <Th>Usuário</Th>
                  <Th>Papel</Th>
                  <Th>Acesso</Th>
                  {souOwner && (
                    <Th>
                      <span className="sr-only">Ações</span>
                    </Th>
                  )}
                </tr>
              </THead>
              <tbody>
                {company.users.map((m) => {
                  const souEu = m.id === user.id
                  return (
                    <Tr key={m.id}>
                      <Td>
                        <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                          <span className="min-w-0 break-all">{m.email}</span>
                          {souEu && <StatusTag tone="accent">Você</StatusTag>}
                        </p>
                        <p className="text-xs text-muted">{m.name ?? 'sem nome'}</p>
                      </Td>
                      <Td className="text-ink-2">{m.companyRole === 'OWNER' ? 'Dono' : 'Membro'}</Td>
                      <Td>{m.active ? <StatusTag>Ativo</StatusTag> : <StatusTag tone="danger">Desativado</StatusTag>}</Td>
                      {souOwner && (
                        <Td className="text-right">
                          {!souEu && (
                            <div className="flex justify-end gap-1.5">
                              <Button size="sm" variant="ghost" icon={UserRoundCog} onClick={() => alternarPapel(m)}>
                                {m.companyRole === 'OWNER' ? 'Tornar membro' : 'Tornar dono'}
                              </Button>
                              <Button size="sm" variant="ghost" icon={m.active ? Pause : Play} onClick={() => alternarAtivo(m)}>
                                {m.active ? 'Desativar' : 'Ativar'}
                              </Button>
                            </div>
                          )}
                        </Td>
                      )}
                    </Tr>
                  )
                })}
              </tbody>
            </Table>
          </TableWrap>

          {souOwner && (
            <form onSubmit={convidarMembro} className="flex flex-col gap-4 border-t border-line-soft pt-4">
              <h3 className="text-sm font-semibold text-ink">Cadastrar usuário</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="E-mail" required>
                  <Input type="email" autoComplete="off" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} />
                </Field>
                <Field label="Nome" hint="Opcional.">
                  <Input autoComplete="off" value={memberName} onChange={(e) => setMemberName(e.target.value)} />
                </Field>
                <Field label="Senha" hint="Opcional — se vazio, gera uma.">
                  <Input autoComplete="new-password" value={memberPassword} onChange={(e) => setMemberPassword(e.target.value)} />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="primary" icon={UserPlus} loading={creatingMember}>
                  {creatingMember ? 'Criando…' : 'Cadastrar'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </Panel>

      {dialogo}
    </>
  )
}
