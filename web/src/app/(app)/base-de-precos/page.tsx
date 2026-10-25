'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Pencil, Plus, Upload, X } from 'lucide-react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { ApiRequestError } from '@/lib/api'
import { lerDinheiroBr } from '@/lib/dinheiroBr'
import {
  atualizarPreco,
  criarPreco,
  exportarBaseDePrecos,
  importarBaseDePrecos,
  listarPrecos,
  removerPreco,
  ROTULO_DA_FONTE,
  ROTULO_DO_TIPO,
  type FonteDePreco,
  type PrecoBase,
  type TipoDeCusto,
} from '@/lib/baseDePrecos'
import {
  Button,
  Carregando,
  EmptyState,
  ErrorState,
  Field,
  Input,
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
} from '@/components/ui'

const VAZIO = { id: '', descricao: '', unidade: '', tipo: 'MATERIAL' as TipoDeCusto, custo: '', fonte: 'PROPRIA' as FonteDePreco, observacao: '' }

function formatarReais(valor: string) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function BaseDePrecosPage() {
  const user = useRequireSession()
  const [precos, setPrecos] = useState<PrecoBase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busca, setBusca] = useState('')

  const [form, setForm] = useState(VAZIO)
  const [erroDoForm, setErroDoForm] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const [importando, setImportando] = useState(false)
  const [avisoImport, setAvisoImport] = useState<string | null>(null)
  const inputArquivo = useRef<HTMLInputElement>(null)

  function load() {
    if (!user) return
    setLoading(true)
    listarPrecos()
      .then(setPrecos)
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Erro ao carregar'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [user])

  const filtrados = useMemo(() => {
    const termo = busca
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim()
    if (!termo) return precos
    const palavras = termo.split(/\s+/)
    return precos.filter((p) => {
      const alvo = `${p.descricao} ${p.observacao ?? ''}`
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
      return palavras.every((w) => alvo.includes(w))
    })
  }, [precos, busca])

  function editar(p: PrecoBase) {
    setForm({ id: p.id, descricao: p.descricao, unidade: p.unidade ?? '', tipo: p.tipo, custo: Number(p.custoUnitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 }), fonte: p.fonte, observacao: p.observacao ?? '' })
    setErroDoForm(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const descricao = form.descricao.trim()
    if (!descricao) return setErroDoForm('Escreva a descrição do item.')
    const leitura = lerDinheiroBr(form.custo)
    if (!leitura.valido || leitura.valor === null || leitura.valor < 0) return setErroDoForm('Informe um custo unitário válido, como 1.850,50.')

    const dados = {
      descricao,
      unidade: form.unidade.trim() || null,
      tipo: form.tipo,
      custoUnitario: leitura.valor,
      fonte: form.fonte,
      observacao: form.observacao.trim() || null,
    }
    setSalvando(true)
    setErroDoForm(null)
    try {
      if (form.id) await atualizarPreco(form.id, dados)
      else await criarPreco(dados)
      setForm(VAZIO)
      load()
    } catch (err) {
      setErroDoForm(err instanceof ApiRequestError ? err.message : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function remover(id: string) {
    await removerPreco(id)
    setPrecos((atual) => atual.filter((p) => p.id !== id))
    if (form.id === id) setForm(VAZIO)
  }

  async function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    if (!arquivo) return
    if (!/\.xlsx$/i.test(arquivo.name)) {
      setAvisoImport('Envie uma planilha .xlsx — exporte o modelo, preencha e mande de volta.')
      return
    }
    setImportando(true)
    setAvisoImport(null)
    try {
      const r = await importarBaseDePrecos(arquivo)
      setAvisoImport(`${r.importados} preço(s) importado(s)${r.ignorados ? `, ${r.ignorados} linha(s) ignorada(s) (sem descrição ou custo)` : ''}.`)
      load()
    } catch (err) {
      setAvisoImport(err instanceof ApiRequestError ? err.message : 'Não foi possível importar a planilha.')
    } finally {
      setImportando(false)
    }
  }

  if (!user) return null

  return (
    <>
      <PageHeader
        title="Base de preços"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={Upload} loading={importando} onClick={() => inputArquivo.current?.click()}>
              Importar planilha
            </Button>
            <Button variant="secondary" icon={Download} onClick={exportarBaseDePrecos}>
              Exportar
            </Button>
            <input ref={inputArquivo} type="file" accept=".xlsx" className="hidden" onChange={aoEscolherArquivo} />
          </div>
        }
        description={
          <p className="max-w-3xl">
            Seus custos de material, mão de obra e serviço, guardados uma vez e reaproveitados em toda licitação. No estudo de custos, eles preenchem o
            custo dos itens automaticamente. Preços com mais de 90 dias aparecem marcados para você revisar.
          </p>
        }
      />

      <Panel
        title={form.id ? 'Editar preço' : 'Adicionar preço'}
        actions={
          form.id ? (
            <Button size="sm" variant="ghost" icon={X} onClick={() => setForm(VAZIO)}>
              Cancelar edição
            </Button>
          ) : undefined
        }
      >
        <form onSubmit={salvar} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Descrição do item" required className="sm:col-span-2 lg:col-span-4">
              <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Ex.: Cimento CP-II 50kg" maxLength={500} />
            </Field>
            <Field label="Unidade">
              <Input value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} placeholder="un, m², h, sc" maxLength={30} />
            </Field>
            <Field label="Tipo de custo">
              <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoDeCusto })}>
                {(Object.keys(ROTULO_DO_TIPO) as TipoDeCusto[]).map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_DO_TIPO[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Custo unitário (R$)" required>
              <Input value={form.custo} onChange={(e) => setForm({ ...form, custo: e.target.value })} inputMode="decimal" placeholder="1.850,50" />
            </Field>
            <Field label="Fonte" hint="“Referência” = preço de tabela (ex.: SINAPI) que você ainda vai confirmar.">
              <Select value={form.fonte} onChange={(e) => setForm({ ...form, fonte: e.target.value as FonteDePreco })}>
                {(Object.keys(ROTULO_DA_FONTE) as FonteDePreco[]).map((f) => (
                  <option key={f} value={f}>
                    {ROTULO_DA_FONTE[f]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Observação" className="sm:col-span-2 lg:col-span-4">
              <Input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} placeholder="De onde veio o preço, marca, condição…" maxLength={2000} />
            </Field>
          </div>
          {erroDoForm && <p className="text-sm font-medium text-danger">{erroDoForm}</p>}
          <div>
            <Button type="submit" icon={form.id ? Pencil : Plus} loading={salvando}>
              {form.id ? 'Salvar alterações' : 'Adicionar à base'}
            </Button>
          </div>
        </form>
      </Panel>

      {avisoImport && (
        <p className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-ink-2">{avisoImport}</p>
      )}

      {error && (
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null)
            load()
          }}
        />
      )}

      {loading ? (
        <Carregando linhas={4} texto="Carregando sua base de preços…" />
      ) : precos.length === 0 ? (
        !error && (
          <EmptyState
            title="Sua base de preços está vazia"
            description="Adicione os custos acima, ou importe uma planilha. Depois eles entram sozinhos no estudo de custos de cada licitação."
          />
        )
      ) : (
        <div className="flex flex-col gap-3">
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar na base…" className="max-w-sm" />
          <TableWrap minWidth={760}>
            <Table>
              <THead>
                <tr>
                  <Th>Descrição</Th>
                  <Th>Unidade</Th>
                  <Th>Tipo</Th>
                  <Th align="right">Custo unitário</Th>
                  <Th>Fonte</Th>
                  <Th align="right">
                    <span className="sr-only">Ações</span>
                  </Th>
                </tr>
              </THead>
              <tbody>
                {filtrados.map((p) => (
                  <Tr key={p.id} interactive>
                    <Td className="max-w-[360px]">
                      <span className="font-medium text-ink">{p.descricao}</span>
                      {p.observacao && <span className="mt-0.5 block truncate text-xs text-muted">{p.observacao}</span>}
                      {p.desatualizado && (
                        <StatusTag tone="warn" className="mt-1">
                          Preço com mais de 90 dias
                        </StatusTag>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-ink-2">{p.unidade ?? '—'}</Td>
                    <Td className="whitespace-nowrap text-ink-2">{ROTULO_DO_TIPO[p.tipo]}</Td>
                    <Td numeric className="whitespace-nowrap font-mono">
                      {formatarReais(p.custoUnitario)}
                    </Td>
                    <Td>
                      <StatusTag tone={p.fonte === 'REFERENCIA' ? 'neutral' : 'ok'}>{ROTULO_DA_FONTE[p.fonte]}</StatusTag>
                    </Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => editar(p)}>
                          Editar
                        </Button>
                        <Button size="sm" variant="ghost" icon={X} onClick={() => remover(p.id)}>
                          Remover
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          {filtrados.length === 0 && <p className="text-sm text-muted">Nenhum preço casa com “{busca}”.</p>}
        </div>
      )}
    </>
  )
}
