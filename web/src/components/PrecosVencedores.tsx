'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { formatarData } from '@/lib/datas'
import { formatarReais, porteDeMicroOuPequena } from '@/lib/resultadoDaLicitacao'
import {
  MINIMO_DE_CASOS,
  textoDoCriterio,
  textoDosCasos,
  textoDoDesconto,
  type PrecosVencedoresDoItem,
} from '@/lib/precosVencedores'
import { StatusTag, Table, TableWrap, Td, Th, THead, Tr } from '@/components/ui'

export type SituacaoDosVencedores = 'carregando' | 'erro' | 'pronto'

function reais(valor: number | null): string {
  return valor === null ? '—' : formatarReais(valor)
}

function Porte({ porte }: { porte: string | null }) {
  const curto = porteDeMicroOuPequena(porte)
  if (curto) return <StatusTag tone="accent">{curto}</StatusTag>
  return porte ? <span className="text-muted">{porte}</span> : null
}

export function VencedoresDoItem({
  situacao,
  item,
  tipo,
  unidadeDoItem,
  nomeDoItem,
  aberto,
  onAlternar,
  onUsarMediana,
}: {
  situacao: SituacaoDosVencedores
  item: PrecosVencedoresDoItem | undefined
  tipo: 'MATERIAL' | 'SERVICO' | null
  unidadeDoItem: string | null
  nomeDoItem: string
  aberto: boolean
  onAlternar: () => void
  onUsarMediana: (mediana: number) => void
}) {
  if (situacao === 'carregando') return <span className="text-faint">buscando casos…</span>
  if (situacao === 'erro' || !item) return <span className="text-faint">indisponível agora</span>
  if (item.amostras < MINIMO_DE_CASOS) {
    return (
      <span className="text-faint">
        ainda sem casos suficientes
        {item.amostras > 0 && <span className="block">({textoDosCasos(item.amostras)}, {textoDoCriterio(item.criterio, tipo)})</span>}
      </span>
    )
  }
  const e = item.estatisticas
  return (
    <div className="flex flex-col gap-0.5">
      {e ? (
        <>
          <span className="font-mono text-sm font-medium text-ink">
            {formatarReais(e.mediana)}
            {item.unidade && <span className="font-sans text-xs font-normal text-muted"> / {item.unidade}</span>}
          </span>
          <span className="font-mono text-muted">
            {formatarReais(e.minimo)} a {formatarReais(e.maximo)}
          </span>
        </>
      ) : (
        <span className="text-muted">poucos casos na mesma unidade</span>
      )}
      {item.unidadeConfere === false && (
        <span className="font-medium text-warn">Unidade diferente da licitação ({unidadeDoItem ?? '—'}): confira antes de usar.</span>
      )}
      <span className="text-muted">
        <span className="font-mono">{item.amostras}</span> {item.amostras === 1 ? 'caso' : 'casos'}, {textoDoCriterio(item.criterio, tipo)}
      </span>
      {item.descontoMedianoPct !== null && <span className="text-muted">mediana {textoDoDesconto(item.descontoMedianoPct)}</span>}
      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        {e && item.unidadeConfere !== false && (
          <button
            type="button"
            onClick={() => onUsarMediana(e.mediana)}
            className="font-medium text-accent hover:underline"
            aria-label={`Usar a mediana vencedora ${formatarReais(e.mediana)}${item.unidade ? ` por ${item.unidade}` : ''} como meu preço de venda, ${nomeDoItem}`}
          >
            usar a mediana como preço de venda
          </button>
        )}
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={aberto}
          className="inline-flex items-center gap-1 text-muted hover:text-ink"
        >
          {aberto ? <ChevronUp size={12} aria-hidden /> : <ChevronDown size={12} aria-hidden />}
          {aberto ? 'esconder casos' : 'ver casos'}
        </button>
      </span>
    </div>
  )
}

export function CasosDosVencedores({ item, meses }: { item: PrecosVencedoresDoItem; meses: number }) {
  return (
    <div className="sticky left-3 flex w-[min(64rem,calc(100vw-4rem))] flex-col gap-3 py-1 lg:w-[min(64rem,calc(100vw-22rem))]">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-ink">Preços vencedores em licitações parecidas</p>
        <p className="text-xs text-muted">
          Últimos {meses} meses, do mais recente para o mais antigo. Resultado de licitações do PNCP acompanhadas pela Licita Bela; a base cresce com o tempo. É só referência.
        </p>
      </div>
      <TableWrap minWidth={900}>
        <Table>
          <THead>
            <tr>
              <Th>Resultado</Th>
              <Th>Órgão</Th>
              <Th>Descrição</Th>
              <Th align="right">Qtd.</Th>
              <Th>Vencedor</Th>
              <Th align="right">Vencedor un.</Th>
              <Th align="right">Estimado un.</Th>
            </tr>
          </THead>
          <tbody>
            {item.recentes.map((c, i) => (
              <Tr key={i}>
                <Td muted className="whitespace-nowrap font-mono text-xs">
                  {c.dataDoResultado ? formatarData(c.dataDoResultado) : '—'}
                </Td>
                <Td className="max-w-[220px] text-xs">
                  <span className="line-clamp-2 text-ink-2">{c.orgao ?? '—'}</span>
                  <span className="block text-muted">{[c.municipio, c.uf].filter(Boolean).join('/') || '—'}</span>
                </Td>
                <Td className="max-w-[260px] text-xs">
                  <span className="line-clamp-2 text-ink-2" title={c.descricao}>
                    {c.descricao}
                  </span>
                </Td>
                <Td numeric className="text-xs">
                  {c.quantidade === null ? '—' : c.quantidade.toLocaleString('pt-BR')} <span className="text-muted">{c.unidade ?? ''}</span>
                </Td>
                <Td className="max-w-[200px] text-xs">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-ink-2">{c.vencedorNome ?? 'Sem nome no PNCP'}</span>
                    <Porte porte={c.vencedorPorte} />
                  </span>
                </Td>
                <Td numeric className="text-xs font-medium text-ink">
                  {reais(c.precoVencedor)}
                </Td>
                <Td numeric muted className="text-xs">
                  {reais(c.precoEstimado)}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
      {item.quemMaisVence.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold text-ink">Quem mais vence</p>
          <ol className="flex flex-col divide-y divide-line-soft rounded border border-line-soft">
            {item.quemMaisVence.map((f, i) => (
              <li key={`${f.documento ?? f.nome ?? ''}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-1.5 text-xs">
                <span className="min-w-0 flex-1 font-medium text-ink">{f.nome ?? 'Fornecedor sem nome no PNCP'}</span>
                {f.documento && <span className="font-mono text-muted">{f.documento}</span>}
                <Porte porte={f.porte} />
                <span className="font-mono text-ink-2">
                  {f.vitorias} {f.vitorias === 1 ? 'vitória' : 'vitórias'}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
