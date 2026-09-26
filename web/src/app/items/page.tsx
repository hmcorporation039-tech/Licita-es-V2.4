'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'
import { MonitoredItem, UasgResult } from '@/lib/types'
import { MODALIDADE_OPTIONS } from '@/lib/modalidades'
import UasgPicker from '@/components/UasgPicker'

function ModalidadeCheckboxes({ selected, onChange }: { selected: string[]; onChange: (next: string[]) => void }) {
  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  }
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {MODALIDADE_OPTIONS.map((opt) => (
        <label key={opt.value} className="flex items-center gap-1 text-xs text-slate-600">
          <input type="checkbox" checked={selected.includes(opt.value)} onChange={() => toggle(opt.value)} />
          {opt.label}
        </label>
      ))}
    </div>
  )
}

export default function ItemsPage() {
  const user = useRequireSession()
  const [items, setItems] = useState<MonitoredItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rematchMsg, setRematchMsg] = useState<Record<string, string>>({})

  // Form state
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

  // Ao escolher uma UASG, sugere o nome do órgão no campo de Órgãos (que
  // funciona tanto pro PNCP quanto pro ComprasNet) — sem duplicar se já tiver.
  function sugerirOrgao(nomeOrgao: string, atual: string, setter: (v: string) => void) {
    const existentes = atual.split(',').map((o) => o.trim().toLowerCase()).filter(Boolean)
    if (existentes.includes(nomeOrgao.toLowerCase())) return
    setter(atual ? `${atual}, ${nomeOrgao}` : nomeOrgao)
  }

  // Edição de um item já cadastrado
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

  async function loadItems() {
    setLoading(true)
    try {
      const data = await api.get<MonitoredItem[]>('/api/monitored-items')
      setItems(data)
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Erro ao carregar itens')
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
    setCreating(true)
    try {
      await api.post('/api/monitored-items', {
        name,
        keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
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
      setError(err instanceof ApiRequestError ? err.message : 'Erro ao criar item')
    } finally {
      setCreating(false)
    }
  }

  function startEdit(item: MonitoredItem) {
    setEditingId(item.id)
    setEditError(null)
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
  }

  async function handleSaveEdit(itemId: string) {
    if (!user) return
    setEditError(null)
    setEditSaving(true)
    try {
      await api.patch(`/api/monitored-items/${itemId}`, {
        name: editName,
        keywords: editKeywords.split(',').map((k) => k.trim()).filter(Boolean),
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
      setEditError(err instanceof ApiRequestError ? err.message : 'Erro ao salvar alterações')
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDelete(itemId: string) {
    if (!user) return
    if (!confirm('Remover este item monitorado?')) return
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

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="mb-4 text-xl font-semibold">Itens monitorados</h1>

        <form onSubmit={handleCreate} className="mb-6 grid gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-2">
          <input
            required
            placeholder="Nome do item (ex: Notebooks para o escritório)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
          />
          <input
            placeholder="Palavras-chave, separadas por vírgula (ex: notebook, computador portátil)"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
          />
          <input
            placeholder="Códigos CATMAT (opcional — match exato, mais preciso que palavra-chave)"
            value={catmatCodes}
            onChange={(e) => setCatmatCodes(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Códigos CATSER (opcional — serviços)"
            value={catserCodes}
            onChange={(e) => setCatserCodes(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="UFs — siglas de 2 letras separadas por vírgula, ex: DF, SP (vazio = nacional)"
            value={ufs}
            onChange={(e) => setUfs(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            placeholder="Valor máximo (opcional)"
            value={valorMax}
            onChange={(e) => setValorMax(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />

          <input
            placeholder="Órgãos, separados por vírgula (ex: PREFEITURA DE UBERLÂNDIA, UNIVERSIDADE FEDERAL)"
            value={orgaos}
            onChange={(e) => setOrgaos(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
          />

          <div className="sm:col-span-2">
            <UasgPicker
              selected={uasgSelected}
              onChange={setUasgSelected}
              onPickOrgao={(nomeOrgao) => sugerirOrgao(nomeOrgao, orgaos, setOrgaos)}
            />
          </div>

          <div className="sm:col-span-2 rounded border border-slate-200 p-3">
            <p className="mb-2 text-xs font-medium text-slate-500">
              Modalidades (opcional — vazio = todas)
            </p>
            <ModalidadeCheckboxes selected={modalidades} onChange={setModalidades} />
          </div>

          <div className="sm:col-span-2 rounded border border-dashed border-slate-300 p-3">
            <p className="mb-2 text-xs font-medium text-slate-500">
              Filtro por raio de distância (opcional) — útil pra serviço presencial. Se preenchido, tem
              prioridade sobre a lista de UFs acima.
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                type="number"
                min={1}
                placeholder="Raio em km (ex: 100)"
                value={raioKm}
                onChange={(e) => setRaioKm(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                placeholder="Cidade de referência (ex: Juazeiro)"
                value={origemMunicipio}
                onChange={(e) => setOrigemMunicipio(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                placeholder="UF (ex: BA)"
                maxLength={2}
                value={origemUf}
                onChange={(e) => setOrigemUf(e.target.value.toUpperCase())}
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <button
            type="submit"
            disabled={creating}
            className="rounded bg-indigo-700 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-800 disabled:opacity-50 sm:col-span-2"
          >
            {creating ? 'Criando...' : 'Cadastrar item'}
          </button>
        </form>

        {loading ? (
          <p className="text-sm text-slate-500">Carregando...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum item monitorado ainda. Cadastre o primeiro acima.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) =>
              editingId === item.id ? (
                <li key={item.id} className="rounded border border-indigo-300 bg-indigo-50 p-4">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      placeholder="Nome do item"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="rounded border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
                    />
                    <input
                      placeholder="Palavras-chave, separadas por vírgula"
                      value={editKeywords}
                      onChange={(e) => setEditKeywords(e.target.value)}
                      className="rounded border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
                    />
                    <input
                      placeholder="Códigos CATMAT (opcional)"
                      value={editCatmatCodes}
                      onChange={(e) => setEditCatmatCodes(e.target.value)}
                      className="rounded border border-slate-300 px-3 py-2 text-sm"
                    />
                    <input
                      placeholder="Códigos CATSER (opcional)"
                      value={editCatserCodes}
                      onChange={(e) => setEditCatserCodes(e.target.value)}
                      className="rounded border border-slate-300 px-3 py-2 text-sm"
                    />
                    <input
                      placeholder="UFs — siglas de 2 letras separadas por vírgula, ex: DF, SP (vazio = nacional)"
                      value={editUfs}
                      onChange={(e) => setEditUfs(e.target.value)}
                      className="rounded border border-slate-300 px-3 py-2 text-sm"
                    />
                    <input
                      placeholder="Órgãos, separados por vírgula (opcional)"
                      value={editOrgaos}
                      onChange={(e) => setEditOrgaos(e.target.value)}
                      className="rounded border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
                    />
                    <input
                      type="number"
                      placeholder="Valor máximo (opcional)"
                      value={editValorMax}
                      onChange={(e) => setEditValorMax(e.target.value)}
                      className="rounded border border-slate-300 px-3 py-2 text-sm"
                    />
                    <div className="sm:col-span-2">
                      <UasgPicker
                        selected={editUasgSelected}
                        onChange={setEditUasgSelected}
                        onPickOrgao={(nomeOrgao) => sugerirOrgao(nomeOrgao, editOrgaos, setEditOrgaos)}
                      />
                    </div>
                    <div className="sm:col-span-2 rounded border border-slate-200 bg-white p-3">
                      <p className="mb-2 text-xs font-medium text-slate-500">Modalidades (opcional — vazio = todas)</p>
                      <ModalidadeCheckboxes selected={editModalidades} onChange={setEditModalidades} />
                    </div>
                    <div className="sm:col-span-2 rounded border border-dashed border-slate-300 bg-white p-3">
                      <p className="mb-2 text-xs font-medium text-slate-500">
                        Filtro por raio de distância — tem prioridade sobre a lista de UFs quando preenchido.
                      </p>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <input
                          type="number"
                          min={1}
                          placeholder="Raio em km"
                          value={editRaioKm}
                          onChange={(e) => setEditRaioKm(e.target.value)}
                          className="rounded border border-slate-300 px-3 py-2 text-sm"
                        />
                        <input
                          placeholder="Cidade de referência"
                          value={editOrigemMunicipio}
                          onChange={(e) => setEditOrigemMunicipio(e.target.value)}
                          className="rounded border border-slate-300 px-3 py-2 text-sm"
                        />
                        <input
                          placeholder="UF"
                          maxLength={2}
                          value={editOrigemUf}
                          onChange={(e) => setEditOrigemUf(e.target.value.toUpperCase())}
                          className="rounded border border-slate-300 px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                  {editError && <p className="mt-2 text-sm text-red-600">{editError}</p>}
                  <div className="mt-3 flex gap-3">
                    <button
                      onClick={() => handleSaveEdit(item.id)}
                      disabled={editSaving}
                      className="rounded bg-indigo-700 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-800 disabled:opacity-50"
                    >
                      {editSaving ? 'Salvando...' : 'Salvar alterações'}
                    </button>
                    <button onClick={cancelEdit} className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
                      Cancelar
                    </button>
                  </div>
                </li>
              ) : (
                <li key={item.id} className="rounded border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">
                        {item.name}{' '}
                        {!item.active && <span className="text-xs text-slate-400">(inativo)</span>}
                      </p>
                      {item.keywords.length > 0 && (
                        <p className="text-sm text-slate-500">Palavras-chave: {item.keywords.join(', ')}</p>
                      )}
                      {(item.catmatCodes.length > 0 || item.catserCodes.length > 0) && (
                        <p className="text-sm text-slate-500">
                          {item.catmatCodes.length > 0 && `CATMAT: ${item.catmatCodes.join(', ')}`}
                          {item.catmatCodes.length > 0 && item.catserCodes.length > 0 && ' · '}
                          {item.catserCodes.length > 0 && `CATSER: ${item.catserCodes.join(', ')}`}
                        </p>
                      )}
                      {item.modalidades.length > 0 && (
                        <p className="text-sm text-slate-500">
                          Modalidades:{' '}
                          {item.modalidades
                            .map((m) => MODALIDADE_OPTIONS.find((o) => o.value === m)?.label ?? m)
                            .join(', ')}
                        </p>
                      )}
                      {item.raioKm ? (
                        <p className="text-sm text-slate-500">
                          Raio de {item.raioKm}km de {item.origemMunicipio}/{item.origemUf}
                        </p>
                      ) : (
                        item.ufs.length > 0 && <p className="text-sm text-slate-500">UFs: {item.ufs.join(', ')}</p>
                      )}
                      {item.orgaos.length > 0 && (
                        <p className="text-sm text-slate-500">Órgãos: {item.orgaos.join(', ')}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
                      <div className="flex gap-3">
                        <button onClick={() => handleRematch(item.id)} className="text-indigo-700 hover:underline">
                          Buscar agora
                        </button>
                        <button onClick={() => startEdit(item)} className="text-slate-600 hover:underline">
                          Editar
                        </button>
                        <button onClick={() => handleToggleActive(item)} className="text-slate-600 hover:underline">
                          {item.active ? 'Desativar' : 'Ativar'}
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:underline">
                          Remover
                        </button>
                      </div>
                      {rematchMsg[item.id] && <p className="text-xs text-slate-500">{rematchMsg[item.id]}</p>}
                    </div>
                  </div>
                </li>
              )
            )}
          </ul>
        )}
      </section>

      <p className="text-sm text-slate-500">
        Quer ver o que já chegou? Vá para <Link href="/matches" className="text-indigo-700 hover:underline">Meus matches</Link>.
      </p>
    </div>
  )
}
