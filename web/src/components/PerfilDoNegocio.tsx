'use client'

import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { api, ApiRequestError } from '@/lib/api'
import type { Company } from '@/lib/types'
import { Button, Checkbox, Field, FormError, Input, Notice, Panel, Textarea } from '@/components/ui'

interface ItemSugerido {
  nome: string
  palavrasChave: string[]
  palavrasDeExclusao: string[]
  motivo: string
}

interface RespostaDoPerfil {
  empresa: { razaoSocial: string; uf: string | null; municipio: string | null; atividades: { descricao: string; principal: boolean }[] } | null
  sugestoes: ItemSugerido[]
  origem: 'ia' | 'atividades'
}

// "O que a sua empresa vende?": a Bela sugere itens monitorados a partir do CNPJ e/ou de uma
// descrição livre; a pessoa marca os que quer e cria todos de uma vez.
export default function PerfilDoNegocio({ ufDaEmpresa, aoCriar }: { ufDaEmpresa: string | null; aoCriar: () => void }) {
  const [cnpj, setCnpj] = useState('')
  const [descricao, setDescricao] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resposta, setResposta] = useState<RespostaDoPerfil | null>(null)
  const [marcados, setMarcados] = useState<Set<number>>(new Set())
  const [soNaUf, setSoNaUf] = useState(true)
  const [criados, setCriados] = useState<number | null>(null)

  useEffect(() => {
    api
      .get<Company>('/api/company')
      .then((c) => {
        if (c.cnpj) setCnpj(c.cnpj)
      })
      .catch(() => undefined)
  }, [])

  async function sugerir(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setCriados(null)
    setBuscando(true)
    try {
      const r = await api.post<RespostaDoPerfil>('/api/monitored-items/sugestoes', {
        cnpj: cnpj.trim() || undefined,
        descricao: descricao.trim() || undefined,
      })
      setResposta(r)
      setMarcados(new Set(r.sugestoes.map((_, i) => i)))
      if (r.sugestoes.length === 0) setErro('Não consegui sugerir itens. Descreva com suas palavras o que a empresa vende, por exemplo: "vendo e instalo câmeras de segurança".')
    } catch (err) {
      setErro(err instanceof ApiRequestError ? err.message : 'Não foi possível sugerir agora. Tente de novo.')
    } finally {
      setBuscando(false)
    }
  }

  async function criarMarcados() {
    if (!resposta) return
    setErro(null)
    setCriando(true)
    let total = 0
    try {
      for (const i of [...marcados].sort((a, b) => a - b)) {
        const s = resposta.sugestoes[i]
        await api.post('/api/monitored-items', {
          name: s.nome,
          keywords: s.palavrasChave,
          palavrasDeExclusao: s.palavrasDeExclusao,
          ufs: soNaUf && ufDaEmpresa ? [ufDaEmpresa] : [],
        })
        total++
      }
      setCriados(total)
      setResposta(null)
      setMarcados(new Set())
      aoCriar()
    } catch (err) {
      setCriados(total || null)
      setErro(err instanceof ApiRequestError ? err.message : 'Não foi possível criar todos os itens.')
      if (total > 0) aoCriar()
    } finally {
      setCriando(false)
    }
  }

  function alternar(i: number) {
    setMarcados((atual) => {
      const novo = new Set(atual)
      if (novo.has(i)) novo.delete(i)
      else novo.add(i)
      return novo
    })
  }

  return (
    <Panel
      title="O que a sua empresa vende?"
      description="Informe o CNPJ ou descreva com suas palavras. A Bela sugere os itens; você escolhe quais criar."
      bodyClassName="flex flex-col gap-4"
    >
      <form onSubmit={sugerir} className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <Field label="CNPJ" hint="As atividades do cadastro na Receita">
          <Input id="perfil-cnpj" inputMode="numeric" placeholder="00.000.000/0000-00" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
        </Field>
        <Field label="O que vocês vendem ou fazem" hint="Ex.: vendo e instalo câmeras de segurança e cerca elétrica">
          <Textarea id="perfil-descricao" rows={2} maxLength={1500} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </Field>
        <div className="md:col-span-2">
          <Button type="submit" variant="secondary" icon={Sparkles} loading={buscando}>
            {buscando ? 'Pensando…' : 'Sugerir itens'}
          </Button>
        </div>
      </form>

      <FormError>{erro}</FormError>
      {criados !== null && criados > 0 && (
        <Notice tone="ok">
          {criados === 1 ? '1 item criado.' : `${criados} itens criados.`} As licitações que casarem aparecem em Meus matches em alguns instantes.
        </Notice>
      )}

      {resposta && resposta.sugestoes.length > 0 && (
        <div className="flex flex-col gap-3">
          {resposta.empresa && (
            <p className="text-sm text-ink-2">
              {resposta.empresa.razaoSocial}
              {resposta.empresa.municipio ? ` · ${resposta.empresa.municipio}/${resposta.empresa.uf}` : ''}
              {resposta.origem === 'atividades' ? ' · sugestões tiradas das atividades do CNPJ' : ''}
            </p>
          )}
          <ul className="flex flex-col divide-y divide-line-soft rounded-lg border border-line">
            {resposta.sugestoes.map((s, i) => (
              <li key={`${s.nome}-${i}`} className="px-3 py-2.5">
                <Checkbox
                  id={`perfil-sugestao-${i}`}
                  checked={marcados.has(i)}
                  onChange={() => alternar(i)}
                  className="w-full"
                  label={
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-medium text-ink">{s.nome}</span>
                      <span className="text-ink-2">Palavras: {s.palavrasChave.join(', ')}</span>
                      {s.palavrasDeExclusao.length > 0 && <span className="text-muted">Sem: {s.palavrasDeExclusao.join(', ')}</span>}
                      {s.motivo && <span className="text-xs text-faint">{s.motivo}</span>}
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
          {ufDaEmpresa && (
            <Checkbox
              id="perfil-so-na-uf"
              label={`Só licitações em ${ufDaEmpresa} (dá para mudar depois, item por item)`}
              checked={soNaUf}
              onChange={(e) => setSoNaUf(e.target.checked)}
            />
          )}
          <div>
            <Button type="button" variant="primary" loading={criando} disabled={marcados.size === 0} onClick={criarMarcados}>
              {criando ? 'Criando…' : marcados.size === 1 ? 'Criar 1 item' : `Criar ${marcados.size} itens`}
            </Button>
          </div>
        </div>
      )}
    </Panel>
  )
}
