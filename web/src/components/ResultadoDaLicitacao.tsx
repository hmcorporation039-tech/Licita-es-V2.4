import type { Tender, TenderItem } from '@/lib/types'
import { formatarData } from '@/lib/datas'
import {
  MENSAGEM_SEM_RESULTADO,
  diferencaPercentual,
  formatarDocumentoDoFornecedor,
  formatarPercentual,
  formatarReais,
  porteDeMicroOuPequena,
  resumoDoResultado,
  textoDoResumo,
  textoDosOutrosFornecedores,
  tomDaSituacao,
  unitarioEstimado,
  unitarioHomologado,
} from '@/lib/resultadoDaLicitacao'
import { Button, Notice, Panel, StatusTag, Table, TableWrap, Td, Th, THead, Tr, cx } from '@/components/ui'

const LIMITE_DA_DESCRICAO = 90

function descricaoCurta(texto: string): string {
  const limpo = texto.replace(/\s+/g, ' ').trim()
  return limpo.length > LIMITE_DA_DESCRICAO ? `${limpo.slice(0, LIMITE_DA_DESCRICAO - 1).trimEnd()}…` : limpo
}

function reais(valor: number | null): string {
  return valor === null ? '—' : formatarReais(valor)
}

function porNumeroDoItem(a: TenderItem, b: TenderItem): number {
  return (a.numeroItem ?? Number.MAX_SAFE_INTEGER) - (b.numeroItem ?? Number.MAX_SAFE_INTEGER)
}

function Diferenca({ item }: { item: TenderItem }) {
  const diferenca = diferencaPercentual(item)
  if (diferenca === null) return <span className="text-muted">—</span>
  if (Math.abs(diferenca) < 0.05) return <span className="text-ink-2">0,0%</span>
  const abaixo = diferenca < 0
  return (
    <span className={cx('font-semibold', abaixo ? 'text-ok' : 'text-danger')}>
      {abaixo ? '−' : '+'}
      {formatarPercentual(diferenca)}
    </span>
  )
}

function Vencedor({ item }: { item: TenderItem }) {
  if (!item.vencedorNome && !item.vencedorNi) return <span className="text-muted">—</span>
  const documento = formatarDocumentoDoFornecedor(item.vencedorNi)
  const porte = porteDeMicroOuPequena(item.vencedorPorte)
  const outros = textoDosOutrosFornecedores(item.fornecedoresRegistrados)
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="font-medium text-ink">{item.vencedorNome ?? 'Fornecedor sem nome no PNCP'}</span>
      <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        {documento && <span className="font-mono">{documento}</span>}
        {porte && <StatusTag tone="accent">{porte}</StatusTag>}
      </span>
      {outros && <span className="text-xs text-muted">{outros}</span>}
    </div>
  )
}

export function ResumoDoResultadoDaLicitacao({ tender, onVerPorItem }: { tender: Tender; onVerPorItem?: () => void }) {
  const resumo = resumoDoResultado(tender.items ?? [])
  const texto = textoDoResumo(resumo)
  const semResultado = texto === MENSAGEM_SEM_RESULTADO
  return (
    <Notice
      tone={resumo.homologados > 0 ? 'ok' : 'info'}
      title="Resultado"
      action={
        !semResultado &&
        onVerPorItem && (
          <Button size="sm" variant="secondary" onClick={onVerPorItem}>
            Ver por item
          </Button>
        )
      }
    >
      {texto}
    </Notice>
  )
}

export default function ResultadoDaLicitacao({ tender }: { tender: Tender }) {
  const itens = [...(tender.items ?? [])].sort(porNumeroDoItem)
  const resumo = resumoDoResultado(itens)
  const texto = textoDoResumo(resumo)
  const semResultado = texto === MENSAGEM_SEM_RESULTADO
  const conferidoEm = tender.resultadoConferidoEm ? formatarData(tender.resultadoConferidoEm, { comHora: true }) : null

  return (
    <Panel
      title="Resultado"
      description={
        conferidoEm
          ? `Dados publicados pelo órgão no PNCP · conferido em ${conferidoEm}${tender.resultadoFinal ? ' · resultado final' : ''}`
          : 'Dados publicados pelo órgão no PNCP'
      }
      padding="none"
    >
      <div className="flex flex-col gap-3 p-4">
        <p className={cx('text-sm', semResultado ? 'text-muted' : 'font-semibold text-ink')}>{texto}</p>
        {itens.length > 0 && !semResultado && (
          <TableWrap minWidth={980}>
            <Table>
              <THead>
                <tr>
                  <Th>Item</Th>
                  <Th>Descrição</Th>
                  <Th>Situação</Th>
                  <Th>Vencedor</Th>
                  <Th align="right">Preço vencedor</Th>
                  <Th align="right">Preço estimado</Th>
                  <Th align="right">Diferença</Th>
                </tr>
              </THead>
              <tbody>
                {itens.map((item) => (
                  <Tr key={item.id}>
                    <Td muted className="whitespace-nowrap align-top font-mono">
                      {item.numeroItem ?? '—'}
                    </Td>
                    <Td className="max-w-[300px] align-top">
                      <span className="text-ink-2" title={item.descricao}>
                        {descricaoCurta(item.descricao)}
                      </span>
                    </Td>
                    <Td className="align-top">
                      {item.situacaoDoResultado ? <StatusTag tone={tomDaSituacao(item.situacaoDoResultado)}>{item.situacaoDoResultado}</StatusTag> : <span className="text-muted">—</span>}
                    </Td>
                    <Td className="min-w-[220px] align-top">
                      <Vencedor item={item} />
                    </Td>
                    <Td numeric className="align-top">
                      {reais(unitarioHomologado(item))}
                    </Td>
                    <Td numeric className="align-top">
                      {reais(unitarioEstimado(item))}
                    </Td>
                    <Td numeric className="align-top">
                      <Diferenca item={item} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </div>
    </Panel>
  )
}
