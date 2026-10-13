'use client'

import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { Pause, Pencil, Play, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'
import { MonitoredItem, UasgResult } from '@/lib/types'
import { MODALIDADE_OPTIONS } from '@/lib/modalidades'
import UasgPicker from '@/components/UasgPicker'
import CatalogPicker from '@/components/CatalogPicker'
import {
  Button,
  Carregando,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  FormError,
  Input,
  PageHeader,
  Panel,
  StatusTag,
  TextLink,
  cx,
  useDialogo,
} from '@/components/ui'

function anexarCodigo(atual: string, codigo: string): string {
  const lista = atual.split(',').map((c) => c.trim()).filter(Boolean)
  if (lista.includes(codigo)) return atual
  return [...lista, codigo].join(', ')
}

function ModalidadeCheckboxes({ selected, onChange }: { selected: string[]; onChange: (next: string[]) => void }) {
  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  }
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
      {MODALIDADE_OPTIONS.map((opt) => (
        <Checkbox key={opt.value} label={opt.label} checked={selected.includes(opt.value)} onChange={() => toggle(opt.value)} />
      ))}
    </div>
  )
}

type Par<T> = readonly [T, Dispatch<SetStateAction<T>>]

type ErrosDosCampos = Record<string, string>

const CAMPOS_COM_ERRO_PROPRIO = ['name', 'keywords', 'catmatCodes', 'catserCodes', 'ufs', 'valorMax', 'orgaos', 'uasgCodes', 'modalidades', 'raioKm', 'origemMunicipio', 'origemUf']

const MIN_TAM_PALAVRA_CHAVE = 2

function separarLista(texto: string): string[] {
  return texto.split(',').map((t) => t.trim()).filter(Boolean)
}

function validarAntesDeEnviar(keywords: string): ErrosDosCampos {
  const curtas = separarLista(keywords).filter((k) => k.length < MIN_TAM_PALAVRA_CHAVE)
  if (curtas.length === 0) return {}
  const lista = curtas.map((k) => `"${k}"`).join(', ')
  return { keywords: `Cada palavra-chave precisa ter ao menos ${MIN_TAM_PALAVRA_CHAVE} caracteres (revise ${lista}).` }
}

function distribuirErro(err: unknown, padrao: string): { campos: ErrosDosCampos; geral: string | null } {
  if (!(err instanceof ApiRequestError)) return { campos: {}, geral: padrao }
  const campos: ErrosDosCampos = {}
  let sobrouCampoSemLugar = false
  for (const [campo, mensagem] of Object.entries(err.campos)) {
    if (CAMPOS_COM_ERRO_PROPRIO.includes(campo)) campos[campo] = mensagem
    else sobrouCampoSemLugar = true
  }
  if (Object.keys(campos).length === 0 && /cidade de refer[eê]ncia/i.test(err.message)) campos.origemMunicipio = err.message
  const geral = Object.keys(campos).length === 0 || sobrouCampoSemLugar ? err.message : null
  return { campos, geral }
}

function semCampo(erros: ErrosDosCampos, campo: string): ErrosDosCampos {
  const resto = { ...erros }
  delete resto[campo]
  return resto
}

interface CamposDoItem {
  name: Par<string>
  keywords: Par<string>
  catmatCodes: Par<string>
  catserCodes: Par<string>
  modalidades: Par<string[]>
  orgaos: Par<string>
  uasg: Par<UasgResult[]>
  ufs: Par<string>
  valorMax: Par<string>
  raioKm: Par<string>
  origemMunicipio: Par<string>
  origemUf: Par<string>
}

function Grupo({ legenda, dica, children }: { legenda: string; dica?: string; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-3 rounded border border-line-soft p-3 sm:col-span-2">
      <legend className="px-1 text-xs font-medium text-muted">{legenda}</legend>
      {dica && <p className="-mt-1 text-xs text-muted">{dica}</p>}
      {children}
    </fieldset>
  )
}

function FormularioDoItem({
  campos,
  erros,
  onLimparErro,
  nomeObrigatorio,
  onPickOrgao,
}: {
  campos: CamposDoItem
  erros: ErrosDosCampos
  onLimparErro: (campo: string) => void
  nomeObrigatorio?: boolean
  onPickOrgao: (nomeOrgao: string) => void
}) {
  const [name, setName] = campos.name
  const [keywords, setKeywords] = campos.keywords
  const [catmatCodes, setCatmatCodes] = campos.catmatCodes
  const [catserCodes, setCatserCodes] = campos.catserCodes
  const [modalidades, setModalidades] = campos.modalidades
  const [orgaos, setOrgaos] = campos.orgaos
  const [uasg, setUasg] = campos.uasg
  const [ufs, setUfs] = campos.ufs
  const [valorMax, setValorMax] = campos.valorMax
  const [raioKm, setRaioKm] = campos.raioKm
  const [origemMunicipio, setOrigemMunicipio] = campos.origemMunicipio
  const [origemUf, setOrigemUf] = campos.origemUf

  function aoMudar(campo: string, setter: (valor: string) => void, transformar: (valor: string) => string = (v) => v) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(transformar(e.target.value))
      if (erros[campo]) onLimparErro(campo)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Nome do item" hint="Ex.: Notebooks para o escritório." error={erros.name} required={nomeObrigatorio} className="sm:col-span-2">
        <Input placeholder="Nome do item" value={name} onChange={aoMudar('name', setName)} />
      </Field>
      <Field label="Palavras-chave" hint="Separadas por vírgula, com ao menos 2 letras cada. Ex.: notebook, computador portátil." error={erros.keywords} className="sm:col-span-2">
        <Input placeholder="notebook, computador" value={keywords} onChange={aoMudar('keywords', setKeywords)} />
      </Field>

      <div className="flex min-w-0 flex-col gap-2">
        <Field label="Buscar no catálogo CATMAT" hint="Digite parte da descrição (ex.: cimento) e escolha na lista.">
          <CatalogPicker tipo="material" onAdd={(c) => setCatmatCodes((v) => anexarCodigo(v, c))} />
        </Field>
        <Field label="Códigos CATMAT" hint="Opcional. Match exato, mais preciso que palavra-chave. Ex.: 150500, 461733." error={erros.catmatCodes}>
          <Input className="font-mono" placeholder="150500, 461733" value={catmatCodes} onChange={aoMudar('catmatCodes', setCatmatCodes)} />
        </Field>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Field label="Buscar no catálogo CATSER" hint="Digite parte da descrição (ex.: limpeza) e escolha na lista.">
          <CatalogPicker tipo="servico" onAdd={(c) => setCatserCodes((v) => anexarCodigo(v, c))} />
        </Field>
        <Field label="Códigos CATSER" hint="Opcional. Para serviços. Ex.: 5380, 24830." error={erros.catserCodes}>
          <Input className="font-mono" placeholder="5380, 24830" value={catserCodes} onChange={aoMudar('catserCodes', setCatserCodes)} />
        </Field>
      </div>

      <Field label="UFs" hint="Siglas de 2 letras separadas por vírgula. Vazio = nacional." error={erros.ufs}>
        <Input placeholder="DF, SP" value={ufs} onChange={aoMudar('ufs', setUfs)} />
      </Field>
      <Field label="Valor máximo (R$)" hint="Opcional." error={erros.valorMax}>
        <Input type="number" inputMode="decimal" className="font-mono" value={valorMax} onChange={aoMudar('valorMax', setValorMax)} />
      </Field>

      <Field label="Órgãos" hint="Opcional. Separados por vírgula. Ex.: Prefeitura de Uberlândia, Universidade Federal." error={erros.orgaos} className="sm:col-span-2">
        <Input placeholder="Prefeitura de…" value={orgaos} onChange={aoMudar('orgaos', setOrgaos)} />
      </Field>

      <Field label="UASGs" hint="Opcional. Só afeta licitações do ComprasNet; ao escolher, o órgão é sugerido no campo acima." error={erros.uasgCodes} className="sm:col-span-2">
        <UasgPicker selected={uasg} onChange={setUasg} onPickOrgao={onPickOrgao} />
      </Field>

      <Grupo legenda="Modalidades" dica="Opcional. Vazio = todas.">
        <ModalidadeCheckboxes selected={modalidades} onChange={setModalidades} />
        {erros.modalidades && <p className="text-xs font-medium text-danger">{erros.modalidades}</p>}
      </Grupo>

      <Grupo
        legenda="Filtro por raio de distância"
        dica="Opcional, útil para serviço presencial. Se preenchido, tem prioridade sobre a lista de UFs."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_6rem]">
          <Field label="Raio (km)" error={erros.raioKm}>
            <Input type="number" min={1} inputMode="numeric" className="font-mono" placeholder="100" value={raioKm} onChange={aoMudar('raioKm', setRaioKm)} />
          </Field>
          <Field label="Cidade de referência" hint="Ex.: Juazeiro." error={erros.origemMunicipio}>
            <Input placeholder="Cidade" value={origemMunicipio} onChange={aoMudar('origemMunicipio', setOrigemMunicipio)} />
          </Field>
          <Field label="UF" error={erros.origemUf}>
            <Input placeholder="BA" maxLength={2} className="font-mono uppercase" value={origemUf} onChange={aoMudar('origemUf', setOrigemUf, (v) => v.toUpperCase())} />
          </Field>
        </div>
      </Grupo>
    </div>
  )
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="shrink-0 text-xs text-muted sm:w-28">{rotulo}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-ink-2">{children}</dd>
    </div>
  )
}

export default function ItemsPage() {
  const user = useRequireSession()
  const { confirmar, dialogo } = useDialogo()
  const [items, setItems] = useState<MonitoredItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [erroCarregar, setErroCarregar] = useState<string | null>(null)
  const [rematchMsg, setRematchMsg] = useState<Record<string, string>>({})

  const [name, setName] = useState('')
  const [keywords, setKeywords] = useState('')
  const [catmatCodes, setCatmatCodes] = useState('')
  const [catserCodes, setCatserCodes] = useState('')
  const [modalidades, setModalidades] = useState<string[]>([])
  const [orgaos, setOrgaos] = useState('')
  const [uasgSelected, setUasgSelected] = useState<UasgResult[]>([])
  const [ufs, setUfs] = useState('')
  const [valorMax, setValorMax] = useState('')
  const [raioKm, setRaioKm] = useState('')
  const [origemMunicipio, setOrigemMunicipio] = useState('')
  const [origemUf, setOrigemUf] = useState('')
  const [creating, setCreating] = useState(false)
  const [errosNovos, setErrosNovos] = useState<ErrosDosCampos>({})

  function sugerirOrgao(nomeOrgao: string, atual: string, setter: (v: string) => void) {
    const existentes = atual.split(',').map((o) => o.trim().toLowerCase()).filter(Boolean)
    if (existentes.includes(nomeOrgao.toLowerCase())) return
    setter(atual ? `${atual}, ${nomeOrgao}` : nomeOrgao)
  }

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editKeywords, setEditKeywords] = useState('')
  const [editCatmatCodes, setEditCatmatCodes] = useState('')
  const [editCatserCodes, setEditCatserCodes] = useState('')
  const [editModalidades, setEditModalidades] = useState<string[]>([])
  const [editOrgaos, setEditOrgaos] = useState('')
  const [editUasgSelected, setEditUasgSelected] = useState<UasgResult[]>([])
  const [editUfs, setEditUfs] = useState('')
  const [editValorMax, setEditValorMax] = useState('')
  const [editRaioKm, setEditRaioKm] = useState('')
  const [editOrigemMunicipio, setEditOrigemMunicipio] = useState('')
  const [editOrigemUf, setEditOrigemUf] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [errosEditados, setErrosEditados] = useState<ErrosDosCampos>({})

  async function loadItems() {
    setLoading(true)
    setErroCarregar(null)
    try {
      const data = await api.get<MonitoredItem[]>('/api/monitored-items')
      setItems(data)
    } catch (err) {
      setErroCarregar(err instanceof ApiRequestError ? err.message : 'Erro ao carregar itens')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) loadItems()
  }, [user])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setError(null)
    const errosLocais = validarAntesDeEnviar(keywords)
    setErrosNovos(errosLocais)
    if (Object.keys(errosLocais).length > 0) return
    setCreating(true)
    try {
      await api.post('/api/monitored-items', {
        name,
        keywords: separarLista(keywords),
        catmatCodes: catmatCodes.split(',').map((c) => c.trim()).filter(Boolean),
        catserCodes: catserCodes.split(',').map((c) => c.trim()).filter(Boolean),
        modalidades,
        orgaos: orgaos.split(',').map((o) => o.trim()).filter(Boolean),
        uasgCodes: uasgSelected.map((u) => u.codigoUasg),
        ufs: ufs.split(',').map((u) => u.trim().toUpperCase()).filter(Boolean),
        valorMax: valorMax ? Number(valorMax) : undefined,
        raioKm: raioKm ? Number(raioKm) : undefined,
        origemMunicipio: origemMunicipio.trim() || undefined,
        origemUf: origemUf.trim() ? origemUf.trim().toUpperCase() : undefined,
      })
      setName('')
      setKeywords('')
      setCatmatCodes('')
      setCatserCodes('')
      setModalidades([])
      setOrgaos('')
      setUasgSelected([])
      setUfs('')
      setValorMax('')
      setRaioKm('')
      setOrigemMunicipio('')
      setOrigemUf('')
      await loadItems()
    } catch (err) {
      const { campos, geral } = distribuirErro(err, 'Erro ao criar item')
      setErrosNovos(campos)
      setError(geral)
    } finally {
      setCreating(false)
    }
  }

  function startEdit(item: MonitoredItem) {
    setEditingId(item.id)
    setEditError(null)
    setErrosEditados({})
    setEditName(item.name)
    setEditKeywords(item.keywords.join(', '))
    setEditCatmatCodes(item.catmatCodes.join(', '))
    setEditCatserCodes(item.catserCodes.join(', '))
    setEditModalidades(item.modalidades)
    setEditOrgaos(item.orgaos.join(', '))
    setEditUasgSelected([])
    if (item.uasgCodes.length > 0) {
      api
        .get<UasgResult[]>(`/api/uasg/by-codes?codes=${encodeURIComponent(item.uasgCodes.join(','))}`)
        .then(setEditUasgSelected)
        .catch(() => setEditUasgSelected([]))
    }
    setEditUfs(item.ufs.join(', '))
    setEditValorMax(item.valorMax ?? '')
    setEditRaioKm(item.raioKm ? String(item.raioKm) : '')
    setEditOrigemMunicipio(item.origemMunicipio ?? '')
    setEditOrigemUf(item.origemUf ?? '')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditError(null)
    setErrosEditados({})
  }

  async function handleSaveEdit(itemId: string) {
    if (!user) return
    setEditError(null)
    const errosLocais = validarAntesDeEnviar(editKeywords)
    setErrosEditados(errosLocais)
    if (Object.keys(errosLocais).length > 0) return
    setEditSaving(true)
    try {
      await api.patch(`/api/monitored-items/${itemId}`, {
        name: editName,
        keywords: separarLista(editKeywords),
        catmatCodes: editCatmatCodes.split(',').map((c) => c.trim()).filter(Boolean),
        catserCodes: editCatserCodes.split(',').map((c) => c.trim()).filter(Boolean),
        modalidades: editModalidades,
        orgaos: editOrgaos.split(',').map((o) => o.trim()).filter(Boolean),
        uasgCodes: editUasgSelected.map((u) => u.codigoUasg),
        ufs: editUfs.split(',').map((u) => u.trim().toUpperCase()).filter(Boolean),
        valorMax: editValorMax ? Number(editValorMax) : null,
        raioKm: editRaioKm ? Number(editRaioKm) : null,
        origemMunicipio: editOrigemMunicipio.trim() || null,
        origemUf: editOrigemUf.trim() ? editOrigemUf.trim().toUpperCase() : null,
      })
      setEditingId(null)
      await loadItems()
    } catch (err) {
      const { campos, geral } = distribuirErro(err, 'Erro ao salvar alterações')
      setErrosEditados(campos)
      setEditError(geral)
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDelete(itemId: string) {
    if (!user) return
    if (!(await confirmar({ titulo: 'Remover este item monitorado?', mensagem: 'Ele deixa de buscar licitações novas.', confirmarRotulo: 'Remover', perigo: true }))) return
    await api.delete(`/api/monitored-items/${itemId}`)
    await loadItems()
  }

  async function handleToggleActive(item: MonitoredItem) {
    if (!user) return
    await api.patch(`/api/monitored-items/${item.id}`, { active: !item.active })
    await loadItems()
  }

  async function handleRematch(itemId: string) {
    if (!user) return
    setRematchMsg((m) => ({ ...m, [itemId]: 'Buscando...' }))
    try {
      const res = await api.post<{ matchesFound: number }>(`/api/monitored-items/${itemId}/rematch`)
      setRematchMsg((m) => ({
        ...m,
        [itemId]:
          res.matchesFound > 0
            ? `${res.matchesFound} nova(s) licitação(ões) encontrada(s)! Veja em "Meus matches".`
            : 'Nenhuma licitação nova encontrada por enquanto.',
      }))
    } catch (err) {
      setRematchMsg((m) => ({ ...m, [itemId]: err instanceof ApiRequestError ? err.message : 'Erro' }))
    }
  }

  if (!user) return null

  const camposNovos: CamposDoItem = {
    name: [name, setName],
    keywords: [keywords, setKeywords],
    catmatCodes: [catmatCodes, setCatmatCodes],
    catserCodes: [catserCodes, setCatserCodes],
    modalidades: [modalidades, setModalidades],
    orgaos: [orgaos, setOrgaos],
    uasg: [uasgSelected, setUasgSelected],
    ufs: [ufs, setUfs],
    valorMax: [valorMax, setValorMax],
    raioKm: [raioKm, setRaioKm],
    origemMunicipio: [origemMunicipio, setOrigemMunicipio],
    origemUf: [origemUf, setOrigemUf],
  }

  const camposEditados: CamposDoItem = {
    name: [editName, setEditName],
    keywords: [editKeywords, setEditKeywords],
    catmatCodes: [editCatmatCodes, setEditCatmatCodes],
    catserCodes: [editCatserCodes, setEditCatserCodes],
    modalidades: [editModalidades, setEditModalidades],
    orgaos: [editOrgaos, setEditOrgaos],
    uasg: [editUasgSelected, setEditUasgSelected],
    ufs: [editUfs, setEditUfs],
    valorMax: [editValorMax, setEditValorMax],
    raioKm: [editRaioKm, setEditRaioKm],
    origemMunicipio: [editOrigemMunicipio, setEditOrigemMunicipio],
    origemUf: [editOrigemUf, setEditOrigemUf],
  }

  return (
    <>
      <PageHeader
        title="Itens monitorados"
        description={
          <>
            Quer ver o que já chegou? Vá para <TextLink href="/matches">Meus matches</TextLink>.
          </>
        }
      />

      <Panel title="Cadastrar item" description="Descreva o que você vende; as licitações que casarem aparecem em Meus matches.">
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <FormularioDoItem
            campos={camposNovos}
            erros={errosNovos}
            onLimparErro={(campo) => setErrosNovos((atual) => semCampo(atual, campo))}
            nomeObrigatorio onPickOrgao={(nomeOrgao) => sugerirOrgao(nomeOrgao, orgaos, setOrgaos)} />
          <FormError>{error}</FormError>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" icon={Plus} loading={creating}>
              {creating ? 'Criando…' : 'Cadastrar item'}
            </Button>
          </div>
        </form>
      </Panel>

      <Panel title="Itens cadastrados" padding="none">
        {loading ? (
          <Carregando className="p-4" />
        ) : erroCarregar ? (
          <ErrorState className="m-4" message={erroCarregar} onRetry={loadItems} />
        ) : items.length === 0 ? (
          <EmptyState className="m-4" title="Nenhum item monitorado ainda" description="Cadastre o primeiro no formulário acima para começar a receber licitações." />
        ) : (
          <ul className="divide-y divide-line-soft">
            {items.map((item) =>
              editingId === item.id ? (
                <li key={item.id} className="flex flex-col gap-4 border-l-2 border-accent bg-sunken px-4 py-4">
                  <p className="text-sm font-semibold text-ink">Editando: {item.name}</p>
                  <FormularioDoItem
                    campos={camposEditados}
                    erros={errosEditados}
                    onLimparErro={(campo) => setErrosEditados((atual) => semCampo(atual, campo))}
                    onPickOrgao={(nomeOrgao) => sugerirOrgao(nomeOrgao, editOrgaos, setEditOrgaos)} />
                  <FormError>{editError}</FormError>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary" icon={Save} loading={editSaving} onClick={() => handleSaveEdit(item.id)}>
                      {editSaving ? 'Salvando…' : 'Salvar alterações'}
                    </Button>
                    <Button variant="secondary" onClick={cancelEdit}>
                      Cancelar
                    </Button>
                  </div>
                </li>
              ) : (
                <li key={item.id} className="flex flex-col gap-3 px-4 py-3.5 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
                  <div className="flex min-w-0 flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={cx('text-sm font-semibold', item.active ? 'text-ink' : 'text-muted')}>{item.name}</p>
                      {item.active ? <StatusTag>Ativo</StatusTag> : <StatusTag tone="warn">Inativo</StatusTag>}
                    </div>
                    <dl className="flex flex-col gap-1.5">
                      {item.keywords.length > 0 && (
                        <Linha rotulo="Palavras-chave">
                          {item.keywords.map((k) => (
                            <StatusTag key={k}>{k}</StatusTag>
                          ))}
                        </Linha>
                      )}
                      {item.catmatCodes.length > 0 && (
                        <Linha rotulo="CATMAT">
                          {item.catmatCodes.map((c) => (
                            <StatusTag key={c} mono>
                              {c}
                            </StatusTag>
                          ))}
                        </Linha>
                      )}
                      {item.catserCodes.length > 0 && (
                        <Linha rotulo="CATSER">
                          {item.catserCodes.map((c) => (
                            <StatusTag key={c} mono>
                              {c}
                            </StatusTag>
                          ))}
                        </Linha>
                      )}
                      {item.modalidades.length > 0 && (
                        <Linha rotulo="Modalidades">
                          {item.modalidades.map((m) => MODALIDADE_OPTIONS.find((o) => o.value === m)?.label ?? m).join(', ')}
                        </Linha>
                      )}
                      {item.raioKm ? (
                        <Linha rotulo="Raio">
                          <span>
                            <span className="font-mono">{item.raioKm} km</span> de {item.origemMunicipio}/{item.origemUf}
                          </span>
                        </Linha>
                      ) : (
                        item.ufs.length > 0 && (
                          <Linha rotulo="UFs">
                            {item.ufs.map((u) => (
                              <StatusTag key={u} mono>
                                {u}
                              </StatusTag>
                            ))}
                          </Linha>
                        )
                      )}
                      {item.orgaos.length > 0 && <Linha rotulo="Órgãos">{item.orgaos.join(', ')}</Linha>}
                    </dl>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5 lg:items-end">
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => handleRematch(item.id)}>
                        Buscar agora
                      </Button>
                      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => startEdit(item)}>
                        Editar
                      </Button>
                      <Button size="sm" variant="ghost" icon={item.active ? Pause : Play} onClick={() => handleToggleActive(item)}>
                        {item.active ? 'Desativar' : 'Ativar'}
                      </Button>
                      <Button size="sm" variant="ghost" icon={Trash2} onClick={() => handleDelete(item.id)}>
                        Remover
                      </Button>
                    </div>
                    <p role="status" className="text-xs text-muted lg:text-right">
                      {rematchMsg[item.id]}
                    </p>
                  </div>
                </li>
              )
            )}
          </ul>
        )}
      </Panel>

      {dialogo}
    </>
  )
}
