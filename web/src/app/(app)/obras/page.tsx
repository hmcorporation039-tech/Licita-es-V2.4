'use client'

import { useEffect, useMemo, useState } from 'react'
import { Copy, ExternalLink, HardHat, Lock, MessageSquareText, Phone, Settings2 } from 'lucide-react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError } from '@/lib/api'
import { Button, Carregando, Checkbox, EmptyState, ErrorState, Field, Input, Notice, PageHeader, Panel, Select, StatusTag, TextLink, cx } from '@/components/ui'

interface NichoPronto {
  id: string
  nome: string
  descricao: string
  alvos: string[]
  exclusoes: string[]
}

interface Nicho {
  nome: string
  alvos: string[]
  exclusoes: string[]
}

interface Perfil {
  configurado: boolean
  base: { municipio: string; uf: string | null; temCoordenadas: boolean } | null
  regiao: { raioKm: number | null; ufs: string[]; valorMinimo: number | null }
  nichos: Nicho[]
  catalogo: NichoPronto[]
}

interface Oportunidade {
  id: string
  fornecedor: { cnpj: string; nome: string }
  orgao: string
  objeto: string
  valor: number
  categoria: string | null
  municipio: string | null
  uf: string | null
  distanciaKm: number | null
  assinatura: string | null
  vigenciaFim: string | null
  nichos: string[]
  linkPncp: string | null
}

interface Ganhador {
  razaoSocial: string
  nomeFantasia: string | null
  municipio: string | null
  uf: string | null
  telefones: string[]
  email: string | null
  situacao: string | null
  contratosRecentes: number
}

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']
const RAIOS = [50, 100, 150, 250, 400, 600]

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const dia = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—')
const cnpjLegivel = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')

function Configuracao({ perfil, aoSalvar }: { perfil: Perfil; aoSalvar: () => void }) {
  const [nichos, setNichos] = useState<Nicho[]>(perfil.nichos)
  const [usarRaio, setUsarRaio] = useState(perfil.regiao.raioKm !== null)
  const [raioKm, setRaioKm] = useState(perfil.regiao.raioKm ?? 150)
  const [ufs, setUfs] = useState<string[]>(perfil.regiao.ufs)
  const [valorMinimo, setValorMinimo] = useState(perfil.regiao.valorMinimo ? String(perfil.regiao.valorMinimo) : '')
  const [nomeProprio, setNomeProprio] = useState('')
  const [palavrasProprias, setPalavrasProprias] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const marcado = (n: NichoPronto) => nichos.some((x) => x.nome === n.nome)
  function alternar(n: NichoPronto) {
    setNichos((atual) => (atual.some((x) => x.nome === n.nome) ? atual.filter((x) => x.nome !== n.nome) : [...atual, { nome: n.nome, alvos: n.alvos, exclusoes: n.exclusoes }]))
  }
  function adicionarProprio() {
    const nome = nomeProprio.trim()
    const alvos = palavrasProprias.split(/[,;\n]/).map((p) => p.trim()).filter((p) => p.length >= 3)
    if (nome.length < 2 || alvos.length === 0) {
      setErro('Dê um nome ao nicho e pelo menos uma palavra que aparece no contrato (ex.: reforma, construção, pavimentação).')
      return
    }
    setNichos((atual) => [...atual.filter((x) => x.nome !== nome), { nome, alvos, exclusoes: [] }])
    setNomeProprio('')
    setPalavrasProprias('')
    setErro(null)
  }

  async function salvar() {
    setSalvando(true)
    setErro(null)
    try {
      await api.put('/api/obras/perfil', {
        raioKm: usarRaio ? raioKm : null,
        ufs,
        valorMinimo: valorMinimo ? Number(valorMinimo.replace(/\./g, '').replace(',', '.')) || null : null,
        nichos,
      })
      aoSalvar()
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível salvar. Tente de novo.')
    } finally {
      setSalvando(false)
    }
  }

  const proprios = nichos.filter((n) => !perfil.catalogo.some((c) => c.nome === n.nome))

  return (
    <Panel title="O que você oferece e onde" description="Marque os serviços que a sua empresa faz. A Bela procura contratos assinados que vão precisar deles.">
      <div className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold text-ink">Seus nichos</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {perfil.catalogo.map((n) => (
              <Checkbox key={n.id} checked={marcado(n)} onChange={() => alternar(n)} label={n.nome} hint={n.descricao} />
            ))}
          </div>
          {proprios.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-2">
              {proprios.map((n) => (
                <li key={n.nome}>
                  <button
                    type="button"
                    onClick={() => setNichos((atual) => atual.filter((x) => x.nome !== n.nome))}
                    className="rounded-full border border-line bg-sunken px-3 py-1 text-xs text-ink-2 hover:border-danger"
                    aria-label={`Remover o nicho ${n.nome}`}
                  >
                    {n.nome} ({n.alvos.join(', ')}) ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
            <Field label="Outro nicho">
              <Input value={nomeProprio} onChange={(e) => setNomeProprio(e.target.value)} placeholder="Ex.: Poço artesiano" maxLength={80} />
            </Field>
            <Field label="Palavras no contrato" hint="Separe por vírgula">
              <Input value={palavrasProprias} onChange={(e) => setPalavrasProprias(e.target.value)} placeholder="Ex.: abastecimento de agua, poco, saneamento" maxLength={600} />
            </Field>
            <Button variant="secondary" onClick={adicionarProprio}>
              Adicionar
            </Button>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold text-ink">Região</legend>
          <div className="flex flex-wrap items-center gap-3">
            <Checkbox
              checked={usarRaio}
              onChange={() => setUsarRaio((v) => !v)}
              label={perfil.base ? `Perto da minha base (${perfil.base.municipio}${perfil.base.uf ? `/${perfil.base.uf}` : ''})` : 'Perto da minha base'}
              hint={perfil.base?.temCoordenadas ? undefined : 'Cadastre a cidade da base em Empresa e documentos para usar o raio.'}
            />
            {usarRaio && (
              <Select value={raioKm} onChange={(e) => setRaioKm(Number(e.target.value))} aria-label="Raio em km" className="w-36">
                {RAIOS.map((r) => (
                  <option key={r} value={r}>
                    até {r} km
                  </option>
                ))}
              </Select>
            )}
          </div>
          <p className="text-sm text-ink-2">E/ou nestes estados:</p>
          <div className="flex flex-wrap gap-1.5">
            {UFS.map((uf) => {
              const ativo = ufs.includes(uf)
              return (
                <button
                  key={uf}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => setUfs((atual) => (ativo ? atual.filter((u) => u !== uf) : [...atual, uf]))}
                  className={cx('w-11 rounded border px-1 py-1 font-mono text-xs', ativo ? 'border-accent bg-accent text-white' : 'border-line bg-surface text-ink-2 hover:border-accent')}
                >
                  {uf}
                </button>
              )
            })}
          </div>
        </fieldset>

        <Field label="Valor mínimo do contrato (opcional)" hint="Deixe em branco para ver todos">
          <Input inputMode="decimal" value={valorMinimo} onChange={(e) => setValorMinimo(e.target.value)} placeholder="Ex.: 100.000" className="max-w-xs" />
        </Field>

        {erro && <Notice tone="danger">{erro}</Notice>}
        <div className="flex justify-end">
          <Button variant="primary" loading={salvando} disabled={nichos.length === 0} onClick={salvar}>
            Salvar e buscar
          </Button>
        </div>
      </div>
    </Panel>
  )
}

function CartaoDoContrato({ c, bloqueado }: { c: Oportunidade; bloqueado: boolean }) {
  const [ganhador, setGanhador] = useState<Ganhador | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [carregando, setCarregando] = useState<'contato' | 'mensagem' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  async function verContato() {
    setCarregando('contato')
    setErro(null)
    try {
      setGanhador(await api.get<Ganhador>(`/api/obras/ganhador/${c.fornecedor.cnpj}`))
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível consultar o CNPJ agora.')
    } finally {
      setCarregando(null)
    }
  }

  async function verMensagem() {
    setCarregando('mensagem')
    setErro(null)
    try {
      const r = await api.get<{ texto: string }>(`/api/obras/mensagem/${encodeURIComponent(c.id)}`)
      setMensagem(r.texto)
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível montar a mensagem.')
    } finally {
      setCarregando(null)
    }
  }

  async function copiar() {
    if (!mensagem) return
    try {
      await navigator.clipboard.writeText(mensagem)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      setErro('Não deu para copiar automaticamente: selecione o texto e copie.')
    }
  }

  return (
    <li className="flex flex-col gap-2 px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{c.fornecedor.nome}</p>
          <p className="font-mono text-xs text-muted">CNPJ {cnpjLegivel(c.fornecedor.cnpj)}</p>
        </div>
        <span className="font-mono text-sm font-semibold text-ink">{brl(c.valor)}</span>
      </div>
      <p className="line-clamp-3 text-sm text-ink-2">{c.objeto}</p>
      <p className="text-xs text-muted">
        {[c.orgao, c.municipio ? `${c.municipio}${c.uf ? `/${c.uf}` : ''}` : c.uf, c.distanciaKm !== null ? `${c.distanciaKm} km de você` : null, `assinado em ${dia(c.assinatura)}`, c.vigenciaFim ? `vigência até ${dia(c.vigenciaFim)}` : null]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {c.nichos.map((n) => (
          <StatusTag key={n} tone="accent">
            {n}
          </StatusTag>
        ))}
        {c.categoria && <StatusTag tone="neutral">{c.categoria}</StatusTag>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {bloqueado ? (
          <TextLink href="/conta" className="inline-flex items-center gap-1 text-sm">
            <Lock size={14} aria-hidden /> Contato e mensagem pronta nos planos pagos
          </TextLink>
        ) : (
          <>
            <Button size="sm" variant="secondary" icon={Phone} loading={carregando === 'contato'} onClick={verContato} disabled={ganhador !== null}>
              Ver contato
            </Button>
            <Button size="sm" variant="secondary" icon={MessageSquareText} loading={carregando === 'mensagem'} onClick={verMensagem} disabled={mensagem !== null}>
              Mensagem pronta
            </Button>
          </>
        )}
        {c.linkPncp && (
          <TextLink href={c.linkPncp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm">
            Ver contrato no PNCP <ExternalLink size={14} aria-hidden />
          </TextLink>
        )}
      </div>
      {erro && <Notice tone="danger">{erro}</Notice>}
      {ganhador && (
        <div className="rounded border border-line bg-sunken px-3 py-2 text-sm text-ink-2">
          <p className="font-medium text-ink">
            {ganhador.nomeFantasia || ganhador.razaoSocial}
            {ganhador.municipio ? ` · ${ganhador.municipio}${ganhador.uf ? `/${ganhador.uf}` : ''}` : ''}
          </p>
          {ganhador.telefones.length > 0 ? <p>Telefone: {ganhador.telefones.join(' · ')}</p> : <p>Sem telefone no cadastro da Receita.</p>}
          {ganhador.email ? (
            <p>
              E-mail: <a className="text-accent underline" href={`mailto:${ganhador.email}`}>{ganhador.email}</a>
            </p>
          ) : (
            <p>Sem e-mail no cadastro da Receita.</p>
          )}
          <p className="text-xs text-muted">
            {ganhador.situacao ? `Situação na Receita: ${ganhador.situacao}. ` : ''}
            {ganhador.contratosRecentes > 1 ? `${ganhador.contratosRecentes} contratos recentes na base da Bela. ` : ''}
            Contato público do cadastro da Receita: pode estar desatualizado.
          </p>
        </div>
      )}
      {mensagem && (
        <div className="flex flex-col gap-2">
          <textarea readOnly value={mensagem} rows={9} className="w-full rounded border border-line bg-surface p-2 text-sm text-ink" aria-label="Mensagem de apresentação" />
          <div className="flex justify-end">
            <Button size="sm" variant="primary" icon={Copy} onClick={copiar}>
              {copiado ? 'Copiada' : 'Copiar mensagem'}
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}

// "Obras e ganhadores": quem acabou de assinar contrato com o governo perto de você
// e vai precisar dos serviços que a sua empresa oferece.
export default function ObrasPage() {
  const user = useRequireSession()
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [editando, setEditando] = useState(false)
  const [contratos, setContratos] = useState<Oportunidade[] | null>(null)
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null)
  const [planoGratuito, setPlanoGratuito] = useState<{ mostrados: number; total: number } | null>(null)
  const [dias, setDias] = useState(60)
  const [nicho, setNicho] = useState('')
  const [ordem, setOrdem] = useState<'recentes' | 'perto'>('recentes')
  const [erro, setErro] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    if (!user) return
    setErro(null)
    api
      .get<Perfil>('/api/obras/perfil')
      .then((p) => {
        setPerfil(p)
        setEditando(!p.configurado)
      })
      .catch((e) => setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível carregar o seu cadastro.'))
  }, [user, tentativa])

  useEffect(() => {
    if (!perfil?.configurado) return
    setContratos(null)
    const params = new URLSearchParams({ dias: String(dias), ...(nicho ? { nicho } : {}) })
    api
      .get<{ contratos: Oportunidade[]; atualizadoEm: string | null; planoGratuito: { mostrados: number; total: number } | null }>(`/api/obras/oportunidades?${params}`)
      .then((r) => {
        setContratos(r.contratos)
        setPlanoGratuito(r.planoGratuito ?? null)
        setAtualizadoEm(r.atualizadoEm)
      })
      .catch((e) => setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível buscar os contratos.'))
  }, [perfil, dias, nicho])

  const nomesDosNichos = useMemo(() => perfil?.nichos.map((n) => n.nome) ?? [], [perfil])
  const ordenados = useMemo(() => {
    if (!contratos || ordem === 'recentes') return contratos
    return [...contratos].sort((a, b) => (a.distanciaKm ?? Infinity) - (b.distanciaKm ?? Infinity))
  }, [contratos, ordem])

  if (!user) return null

  return (
    <>
      <PageHeader
        title="Obras e ganhadores"
        description="Empresas que acabaram de ganhar licitações perto de você e podem precisar do seu serviço: subcontratação, orçamento, aluguel de equipamento ou material."
        actions={
          perfil?.configurado && !editando ? (
            <Button variant="secondary" icon={Settings2} onClick={() => setEditando(true)}>
              Nichos e região
            </Button>
          ) : undefined
        }
      />
      {erro ? (
        <ErrorState message={erro} onRetry={() => setTentativa((n) => n + 1)} />
      ) : !perfil ? (
        <Carregando linhas={4} texto="Carregando…" />
      ) : (
        <div className="flex flex-col gap-4">
          {editando && (
            <Configuracao
              perfil={perfil}
              aoSalvar={() => {
                setEditando(false)
                setTentativa((n) => n + 1)
              }}
            />
          )}
          {perfil.configurado && (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Período">
                  <Select value={dias} onChange={(e) => setDias(Number(e.target.value))}>
                    <option value={30}>Últimos 30 dias</option>
                    <option value={60}>Últimos 60 dias</option>
                    <option value={90}>Últimos 90 dias</option>
                    <option value={180}>Últimos 180 dias</option>
                  </Select>
                </Field>
                {perfil.base?.temCoordenadas && (
                  <Field label="Ordem">
                    <Select value={ordem} onChange={(e) => setOrdem(e.target.value as 'recentes' | 'perto')}>
                      <option value="recentes">Mais recentes</option>
                      <option value="perto">Mais perto de mim</option>
                    </Select>
                  </Field>
                )}
                {nomesDosNichos.length > 1 && (
                  <Field label="Nicho">
                    <Select value={nicho} onChange={(e) => setNicho(e.target.value)}>
                      <option value="">Todos os meus nichos</option>
                      {nomesDosNichos.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
              </div>
              {planoGratuito && (
                <Notice tone="info" title="Plano gratuito">
                  Você está vendo {planoGratuito.mostrados} de {planoGratuito.total} {planoGratuito.total === 1 ? 'contrato' : 'contratos'}. Nos planos pagos a lista vem completa, com o
                  contato do ganhador e a mensagem pronta. <TextLink href="/conta">Ver planos</TextLink>
                </Notice>
              )}
              {!ordenados ? (
                <Carregando linhas={5} texto="Procurando contratos…" />
              ) : ordenados.length === 0 ? (
                <EmptyState
                  icon={HardHat}
                  title="Nenhum contrato no período"
                  description="Aumente o raio, marque mais estados, escolha mais nichos ou aumente o período. A Bela busca contratos novos 3 vezes por dia."
                />
              ) : (
                <Panel padding="none" title={`${ordenados.length} ${ordenados.length === 1 ? 'contrato' : 'contratos'}${planoGratuito ? ` de ${planoGratuito.total}` : ''}`} description={atualizadoEm ? `Base atualizada em ${new Date(atualizadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : undefined}>
                  <ul className="flex flex-col divide-y divide-line-soft">
                    {ordenados.map((c) => (
                      <CartaoDoContrato key={c.id} c={c} bloqueado={planoGratuito !== null} />
                    ))}
                  </ul>
                </Panel>
              )}
              <p className="text-xs text-muted">
                Dados públicos do Portal Nacional de Contratações Públicas (PNCP) e do cadastro da Receita Federal. O local é o citado no contrato ou, sem ele, a
                cidade do órgão. Aborde as empresas de forma profissional; quem decide subcontratar é o ganhador, dentro do que o contrato permite.
              </p>
            </>
          )}
        </div>
      )}
    </>
  )
}
