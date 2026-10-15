'use client'

import { use, useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from 'react'
import { ArrowLeft, FileDown, FileText, Plus, Trash2 } from 'lucide-react'
import { useRequireSession } from '@/hooks/useRequireSession'
import { api, ApiRequestError, baixarArquivoPost } from '@/lib/api'
import type { BlocoDoDocumento, DocumentoDaLicitacao, PreviaDoDocumento, Tender, TipoDeDocumentoDaLicitacao } from '@/lib/types'
import {
  Button,
  Carregando,
  cx,
  EmptyState,
  ErrorState,
  FormError,
  Input,
  LinkButton,
  Notice,
  PageHeader,
  Table,
  TableWrap,
  Td,
  Th,
  THead,
  Tr,
  TextLink,
  Textarea,
  useDialogo,
} from '@/components/ui'

const MAX_TEXTO = 5000
const AVISO_DE_TEXTO = 4500
const MAX_BLOCOS = 200
const MAX_CELULA = 1000
const MAX_LOCAL = 200
const MARCADOR = '[preencher:'

type Pedido = { tipo: 'proposta'; readequada: boolean } | { tipo: 'declaracoes'; ids: string[] }
type BlocoComChave = { chave: string; bloco: BlocoDoDocumento }
type Formato = 'pdf' | 'docx'

const TITULO_DA_PAGINA: Record<TipoDeDocumentoDaLicitacao, string> = {
  proposta: 'Proposta comercial',
  declaracoes: 'Declarações',
}

function lerPedido(busca: string): Pedido | null {
  const params = new URLSearchParams(busca)
  const tipo = params.get('tipo')
  if (tipo === 'proposta') return { tipo: 'proposta', readequada: params.get('readequada') === '1' }
  if (tipo === 'declaracoes') {
    const ids = (params.get('ids') ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
    return ids.length > 0 ? { tipo: 'declaracoes', ids } : null
  }
  return null
}

function temMarcador(texto: string): boolean {
  return texto.includes(MARCADOR)
}

function blocoTemMarcador(bloco: BlocoDoDocumento): boolean {
  if (bloco.tipo === 'titulo' || bloco.tipo === 'paragrafo') return temMarcador(bloco.texto)
  if (bloco.tipo === 'assinatura') return temMarcador(bloco.local)
  if (bloco.tipo === 'tabela') return [...bloco.linhas.flat(), ...(bloco.rodape ?? [])].some(temMarcador)
  return false
}

function problemaDoDocumento(blocos: BlocoDoDocumento[]): string | null {
  if (blocos.length === 0) return 'O documento ficou sem conteúdo.'
  if (blocos.length > MAX_BLOCOS) return `O documento passa de ${MAX_BLOCOS} blocos. Remova alguns parágrafos.`
  for (const b of blocos) {
    if (b.tipo === 'titulo' && !b.texto.trim()) return 'Há um título vazio. Escreva o título ou desfaça a alteração.'
    if ((b.tipo === 'titulo' || b.tipo === 'paragrafo') && b.texto.length > MAX_TEXTO) return `Há um parágrafo com mais de ${MAX_TEXTO.toLocaleString('pt-BR')} caracteres. Divida o texto em dois.`
    if (b.tipo === 'assinatura' && b.local.length > MAX_LOCAL) return `O local e data da assinatura passa de ${MAX_LOCAL} caracteres.`
    if (b.tipo === 'tabela' && b.linhas.some((l) => l.some((c) => c.length > MAX_CELULA))) return `Há uma célula da tabela com mais de ${MAX_CELULA.toLocaleString('pt-BR')} caracteres.`
  }
  return null
}

function slug(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function brl(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function TextoAutoajustavel({ value, className, ...rest }: ComponentProps<'textarea'> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const ajustar = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [])

  useLayoutEffect(ajustar, [value, ajustar])

  useEffect(() => {
    window.addEventListener('resize', ajustar)
    return () => window.removeEventListener('resize', ajustar)
  }, [ajustar])

  return <Textarea ref={ref} rows={1} value={value} className={cx('min-h-0! resize-none overflow-hidden', className)} {...rest} />
}

function Contador({ tamanho }: { tamanho: number }) {
  if (tamanho <= AVISO_DE_TEXTO) return null
  const passou = tamanho > MAX_TEXTO
  return (
    <span className={cx('font-mono text-xs', passou ? 'font-medium text-danger' : 'text-warn')}>
      {tamanho.toLocaleString('pt-BR')}/{MAX_TEXTO.toLocaleString('pt-BR')}
      {passou && <span className="font-sans"> · reduza o texto</span>}
    </span>
  )
}

function Paragrafo({
  texto,
  autoFocus,
  onChange,
  onRemover,
}: {
  texto: string
  autoFocus: boolean
  onChange: (texto: string) => void
  onRemover: () => void
}) {
  const pendente = temMarcador(texto)
  return (
    <div className="flex items-start gap-1.5">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <TextoAutoajustavel
          aria-label="Parágrafo"
          autoFocus={autoFocus}
          value={texto}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={texto.length > MAX_TEXTO ? true : undefined}
          className={pendente ? 'border-warn! bg-warn-soft!' : undefined}
        />
        {(pendente || texto.length > AVISO_DE_TEXTO) && (
          <div className="flex flex-wrap items-center justify-between gap-x-3">
            {pendente ? <span className="text-xs font-medium text-warn">Complete antes de enviar</span> : <span />}
            <Contador tamanho={texto.length} />
          </div>
        )}
      </div>
      <Button size="sm" variant="ghost" icon={Trash2} aria-label="Remover parágrafo" className="mt-1 w-8 px-0" onClick={onRemover} />
    </div>
  )
}

function TabelaEditavel({ bloco, onChange }: { bloco: Extract<BlocoDoDocumento, { tipo: 'tabela' }>; onChange: (b: Extract<BlocoDoDocumento, { tipo: 'tabela' }>) => void }) {
  const direita = new Set(bloco.alinharDireita ?? [])
  const largura = Math.max(560, bloco.colunas.length * 120 + 160)

  function alterarCelula(linha: number, coluna: number, valor: string) {
    onChange({ ...bloco, linhas: bloco.linhas.map((l, i) => (i === linha ? l.map((c, j) => (j === coluna ? valor : c)) : l)) })
  }

  function alterarRodape(coluna: number, valor: string) {
    onChange({ ...bloco, rodape: (bloco.rodape ?? []).map((c, j) => (j === coluna ? valor : c)) })
  }

  const classeDaCelula = (coluna: number, valor: string) =>
    cx('h-8! px-2!', direita.has(coluna) && 'text-right font-mono', temMarcador(valor) ? 'border-warn! bg-warn-soft!' : undefined)

  return (
    <div className="flex flex-col gap-1.5">
      <TableWrap minWidth={largura}>
        <Table>
          <THead>
            <tr>
              {bloco.colunas.map((c, j) => (
                <Th key={j} align={direita.has(j) ? 'right' : 'left'}>
                  {c}
                </Th>
              ))}
            </tr>
          </THead>
          <tbody>
            {bloco.linhas.map((linha, i) => (
              <Tr key={i}>
                {linha.map((valor, j) => (
                  <Td key={j} className={cx('px-1.5 py-1.5', !direita.has(j) && j > 0 && 'min-w-[14rem]')}>
                    <Input aria-label={`${bloco.colunas[j] ?? 'Coluna'}, linha ${i + 1}`} value={valor} onChange={(e) => alterarCelula(i, j, e.target.value)} className={classeDaCelula(j, valor)} />
                  </Td>
                ))}
              </Tr>
            ))}
            {bloco.rodape && bloco.rodape.length > 0 && (
              <tr className="bg-sunken">
                {bloco.rodape.map((valor, j) => (
                  <Td key={j} className="px-1.5 py-1.5">
                    <Input aria-label={`Rodapé da tabela, coluna ${j + 1}`} value={valor} onChange={(e) => alterarRodape(j, e.target.value)} className={cx(classeDaCelula(j, valor), 'font-semibold')} />
                  </Td>
                ))}
              </tr>
            )}
          </tbody>
        </Table>
      </TableWrap>
      <p className="text-xs text-muted">Mudou um preço aqui? O total e o valor por extenso não são recalculados — para isso, ajuste o estudo de custos e gere de novo.</p>
    </div>
  )
}

function Assinatura({ local, onChange }: { local: string; onChange: (local: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <Input
        aria-label="Local e data"
        value={local}
        maxLength={MAX_LOCAL}
        onChange={(e) => onChange(e.target.value)}
        className={cx('max-w-sm text-center', temMarcador(local) ? 'border-warn! bg-warn-soft!' : undefined)}
      />
      <span aria-hidden className="mt-10 h-px w-full max-w-xs bg-ink-2" />
      <p className="text-center text-xs text-faint">Responsável, cargo e CPF saem do cadastro da empresa</p>
    </div>
  )
}

function Quebra() {
  return (
    <div role="separator" aria-label="Nova página" className="flex items-center gap-3 py-3 text-2xs font-medium uppercase tracking-wide text-faint">
      <span aria-hidden className="flex-1 border-t border-dashed border-line-strong" />
      nova página
      <span aria-hidden className="flex-1 border-t border-dashed border-line-strong" />
    </div>
  )
}

export default function DocumentosDaLicitacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const user = useRequireSession()
  const { confirmar, dialogo } = useDialogo()
  const proximaChave = useRef(0)

  const [pedido, setPedido] = useState<Pedido | null | 'invalido'>(null)
  const [tender, setTender] = useState<Tender | null>(null)
  const [previa, setPrevia] = useState<PreviaDoDocumento | null>(null)
  const [titulo, setTitulo] = useState('')
  const [blocos, setBlocos] = useState<BlocoComChave[]>([])
  const [editado, setEditado] = useState(false)
  const [chaveNova, setChaveNova] = useState<string | null>(null)
  const [erro, setErro] = useState<{ mensagem: string; status: number } | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const [baixando, setBaixando] = useState<Formato | null>(null)
  const [erroDoArquivo, setErroDoArquivo] = useState<string | null>(null)

  const novaChave = () => `b${++proximaChave.current}`

  useEffect(() => {
    setPedido(lerPedido(window.location.search) ?? 'invalido')
  }, [])

  useEffect(() => {
    if (!user) return
    api
      .get<Tender>(`/api/tenders/${id}`)
      .then(setTender)
      .catch(() => setTender(null))
  }, [user, id])

  useEffect(() => {
    if (!user || !pedido || pedido === 'invalido') return
    let cancelado = false
    setErro(null)
    setPrevia(null)
    const corpo = pedido.tipo === 'proposta' ? { tipo: 'proposta', readequada: pedido.readequada } : { tipo: 'declaracoes', declaracoes: pedido.ids }
    api
      .post<PreviaDoDocumento>(`/api/tenders/${id}/documentos/previa`, corpo)
      .then((r) => {
        if (cancelado) return
        setPrevia(r)
        setTitulo(r.documento.titulo)
        setBlocos(r.documento.blocos.map((bloco) => ({ chave: `b${++proximaChave.current}`, bloco })))
        setEditado(false)
      })
      .catch((err) => {
        if (cancelado) return
        setErro(
          err instanceof ApiRequestError
            ? { mensagem: err.message, status: err.status }
            : { mensagem: 'Não foi possível montar o documento. Verifique a conexão e tente de novo.', status: 0 },
        )
      })
    return () => {
      cancelado = true
    }
  }, [user, id, pedido, tentativa])

  useEffect(() => {
    if (!editado) return
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [editado])

  function alterarBloco(chave: string, bloco: BlocoDoDocumento) {
    setBlocos((atuais) => atuais.map((b) => (b.chave === chave ? { chave, bloco } : b)))
    setEditado(true)
    setErroDoArquivo(null)
  }

  function removerBloco(chave: string) {
    setBlocos((atuais) => atuais.filter((b) => b.chave !== chave))
    setEditado(true)
    setErroDoArquivo(null)
  }

  function adicionarParagrafo() {
    const chave = novaChave()
    setBlocos((atuais) => {
      const novo = { chave, bloco: { tipo: 'paragrafo', texto: '' } as BlocoDoDocumento }
      const ultimo = atuais[atuais.length - 1]
      if (ultimo?.bloco.tipo === 'assinatura') return [...atuais.slice(0, -1), novo, ultimo]
      return [...atuais, novo]
    })
    setChaveNova(chave)
    setEditado(true)
  }

  const voltar = { href: `/tenders/${id}?aba=documentos`, label: 'Documentos da licitação' }

  if (!user || pedido === null) return <Carregando linhas={6} texto="Carregando documento…" />

  if (pedido === 'invalido') {
    return (
      <>
        <PageHeader title="Documento" back={voltar} />
        <EmptyState
          title="Escolha o documento a gerar"
          description="Na aba Documentos da licitação, escolha a proposta comercial ou marque as declarações."
          action={
            <LinkButton href={voltar.href} size="sm" icon={ArrowLeft}>
              Abrir a aba Documentos
            </LinkButton>
          }
        />
      </>
    )
  }

  const tituloDaPagina = pedido.tipo === 'proposta' && pedido.readequada ? 'Proposta comercial readequada' : TITULO_DA_PAGINA[pedido.tipo]
  const descricao = (
    <>
      {tender ? (tender.objetoResumido ?? tender.objeto) : 'Revise o texto e baixe no papel timbrado da empresa.'}
      {tender?.orgao && <span className="block text-xs text-faint">{tender.orgao}</span>}
    </>
  )

  if (erro) {
    return (
      <>
        <PageHeader title={tituloDaPagina} back={voltar} />
        {erro.status === 409 ? (
          <Notice
            tone="warn"
            title="Proposta ainda indisponível"
            action={
              <LinkButton href={`/tenders/${id}?aba=documentos`} size="sm">
                Abrir licitação
              </LinkButton>
            }
          >
            {erro.mensagem}
          </Notice>
        ) : (
          <ErrorState message={erro.mensagem} onRetry={() => setTentativa((n) => n + 1)} />
        )}
      </>
    )
  }

  if (!previa) {
    return (
      <>
        <PageHeader title={tituloDaPagina} description={descricao} back={voltar} />
        <Carregando linhas={8} texto="Montando o documento…" />
      </>
    )
  }

  const blocosAtuais = blocos.map((b) => b.bloco)
  const pendentes = blocosAtuais.filter(blocoTemMarcador).length
  const limiteDeBlocos = blocos.length >= MAX_BLOCOS
  const numero = tender?.numeroControle ? slug(tender.numeroControle) : id.slice(0, 8)
  const base = pedido.tipo === 'proposta' ? (pedido.readequada ? 'proposta-readequada' : 'proposta-comercial') : 'declaracoes'

  async function baixar(formato: Formato) {
    if (!previa) return
    setErroDoArquivo(null)
    const problema = !titulo.trim() ? 'O documento precisa de um título.' : problemaDoDocumento(blocosAtuais)
    if (problema) {
      setErroDoArquivo(problema)
      return
    }
    if (pendentes > 0) {
      const ok = await confirmar({
        titulo: 'Ainda há campos para preencher',
        mensagem: `${pendentes} ${pendentes === 1 ? 'trecho está marcado' : 'trechos estão marcados'} com “[preencher: …]”. Baixar assim mesmo e completar depois no arquivo?`,
        confirmarRotulo: 'Baixar assim mesmo',
      })
      if (!ok) return
    }
    const documento: DocumentoDaLicitacao = { tipo: previa.documento.tipo, titulo: titulo.trim(), blocos: blocosAtuais }
    setBaixando(formato)
    try {
      await baixarArquivoPost(`/api/tenders/${id}/documentos/arquivo`, { formato, documento }, `${base}-${numero}.${formato}`)
    } catch (err) {
      setErroDoArquivo(err instanceof ApiRequestError ? err.message : 'Não foi possível gerar o arquivo. Tente de novo.')
    } finally {
      setBaixando(null)
    }
  }

  return (
    <>
      {dialogo}
      <PageHeader
        title={tituloDaPagina}
        description={descricao}
        back={voltar}
        actions={
          previa.total !== undefined && (
            <p className="flex items-baseline gap-2 text-sm">
              <span className="text-xs text-muted">Total da proposta</span>
              <span className="font-mono font-semibold text-ink">{brl(previa.total)}</span>
            </p>
          )
        }
      />

      {previa.pendencias.length > 0 && (
        <Notice tone="warn" title="Faltam dados para completar o documento" action={<TextLink href="/empresa">Completar cadastro da empresa</TextLink>}>
          <ul className="list-outside list-disc pl-4">
            {previa.pendencias.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted">Os trechos sem dado saem como “[preencher: …]”. Complete no cadastro e volte aqui, ou edite direto no texto.</p>
        </Notice>
      )}

      {!previa.temLogo && (
        <Notice tone="info" action={<TextLink href="/empresa">Enviar logomarca</TextLink>}>
          Sem logomarca: o cabeçalho sai com a razão social.
        </Notice>
      )}

      <article aria-label={`Prévia editável: ${tituloDaPagina}`} className="mx-auto flex w-full max-w-[820px] flex-col rounded border border-line bg-surface px-3 py-5 sm:px-10 sm:py-10 lg:px-14">
        <p className="mb-6 border-b border-line pb-3 text-center text-xs text-faint">Cabeçalho com a logomarca e os dados da empresa</p>

        <div className="flex flex-col gap-3">
          {blocos.map(({ chave, bloco }) => {
            if (bloco.tipo === 'titulo') {
              return (
                <div key={chave} className="flex flex-col gap-1 pt-2">
                  <Input
                    aria-label="Título"
                    value={bloco.texto}
                    onChange={(e) => alterarBloco(chave, { tipo: 'titulo', texto: e.target.value })}
                    aria-invalid={!bloco.texto.trim() || bloco.texto.length > MAX_TEXTO ? true : undefined}
                    className={cx('text-center font-semibold', temMarcador(bloco.texto) ? 'border-warn! bg-warn-soft!' : undefined)}
                  />
                  <Contador tamanho={bloco.texto.length} />
                </div>
              )
            }
            if (bloco.tipo === 'paragrafo') {
              return (
                <Paragrafo
                  key={chave}
                  texto={bloco.texto}
                  autoFocus={chave === chaveNova}
                  onChange={(texto) => alterarBloco(chave, { tipo: 'paragrafo', texto })}
                  onRemover={() => removerBloco(chave)}
                />
              )
            }
            if (bloco.tipo === 'tabela') return <TabelaEditavel key={chave} bloco={bloco} onChange={(b) => alterarBloco(chave, b)} />
            if (bloco.tipo === 'assinatura') return <Assinatura key={chave} local={bloco.local} onChange={(local) => alterarBloco(chave, { tipo: 'assinatura', local })} />
            return <Quebra key={chave} />
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" icon={Plus} onClick={adicionarParagrafo} disabled={limiteDeBlocos}>
            Adicionar parágrafo
          </Button>
          {limiteDeBlocos && <span className="text-xs text-muted">Limite de {MAX_BLOCOS} blocos atingido.</span>}
        </div>

        <p className="mt-6 border-t border-line pt-3 text-center text-xs text-faint">Rodapé com endereço, telefone e e-mail da empresa</p>
      </article>

      <div className="sticky bottom-0 z-10 -mx-4 -mb-6 border-t border-line bg-surface px-4 py-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:-mb-7 lg:px-8">
        <FormError className="mb-1.5 text-xs">{erroDoArquivo}</FormError>
        <div className="flex items-center justify-between gap-2">
          <p className={cx('min-w-0 truncate text-xs', pendentes > 0 ? 'font-medium text-warn' : 'text-muted')}>
            {pendentes > 0 ? (
              <>
                <span className="font-mono">{pendentes}</span> {pendentes === 1 ? 'trecho' : 'trechos'} a preencher
              </>
            ) : (
              <span className="hidden sm:inline">Cabeçalho, rodapé e assinatura saem do cadastro da empresa.</span>
            )}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="primary" size="sm" icon={FileDown} loading={baixando === 'pdf'} disabled={baixando !== null} onClick={() => baixar('pdf')} aria-label="Baixar PDF">
              <span className="sm:hidden">PDF</span>
              <span className="hidden sm:inline">Baixar PDF</span>
            </Button>
            <Button size="sm" icon={FileText} loading={baixando === 'docx'} disabled={baixando !== null} onClick={() => baixar('docx')} aria-label="Baixar Word">
              <span className="sm:hidden">Word</span>
              <span className="hidden sm:inline">Baixar Word</span>
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
