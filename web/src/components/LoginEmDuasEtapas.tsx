'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy, KeyRound, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react'
import { api, ApiRequestError } from '@/lib/api'
import { replaceSessionToken } from '@/lib/session'
import { imagemDoQrCode, type AplicativoParaLer, type SituacaoDoSegundoFator } from '@/lib/segundoFator'
import { Button, Checkbox, Field, FormError, Input, Notice, Panel, StatusTag } from '@/components/ui'

type Etapa = 'resumo' | 'senha' | 'qr' | 'codigos' | 'renovar'

function dataEmBrasilia(iso: string | null): string {
  if (!iso) return '-'
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}

function mensagemDoErro(err: unknown, padrao: string): string {
  return err instanceof ApiRequestError ? err.message : padrao
}

export function CampoDoCodigo({ valor, onChange, rotulo = 'Código do aplicativo', dica, autoFocus }: { valor: string; onChange: (v: string) => void; rotulo?: string; dica?: string; autoFocus?: boolean }) {
  return (
    <Field label={rotulo} hint={dica ?? 'Os 6 números que aparecem agora no aplicativo. Se perdeu o celular, use um código de recuperação.'}>
      <Input autoComplete="one-time-code" spellCheck={false} placeholder="000 000" maxLength={20} value={valor} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} />
    </Field>
  )
}

function CodigosDeRecuperacao({ codigos, onConcluir }: { codigos: string[]; onConcluir: () => void }) {
  const [guardou, setGuardou] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const texto = codigos.join('\n')

  return (
    <div className="flex flex-col gap-4">
      <Notice tone="warn" title="Guarde estes 8 códigos agora">
        Eles são a única forma de entrar se você perder ou trocar o celular. Cada um vale uma vez. Anote no papel ou salve num gerenciador de senhas, fora deste computador. Eles não aparecem de novo.
      </Notice>
      <ol className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-sunken p-3 font-mono text-sm text-ink">
        {codigos.map((c) => (
          <li key={c} className="select-all">
            {c}
          </li>
        ))}
      </ol>
      <Button
        variant="secondary"
        icon={Copy}
        className="self-start"
        onClick={() => {
          navigator.clipboard
            .writeText(texto)
            .then(() => setCopiado(true))
            .catch(() => setCopiado(false))
        }}
      >
        {copiado ? 'Copiados' : 'Copiar os códigos'}
      </Button>
      <Checkbox label="Guardei os códigos num lugar seguro" checked={guardou} onChange={(e) => setGuardou(e.target.checked)} />
      <Button variant="primary" className="self-start" disabled={!guardou} onClick={onConcluir}>
        Concluir
      </Button>
    </div>
  )
}

export default function LoginEmDuasEtapas({ obrigatorio = false, onAtivado }: { obrigatorio?: boolean; onAtivado?: () => void }) {
  const [situacao, setSituacao] = useState<SituacaoDoSegundoFator | null | 'indisponivel'>(null)
  const [etapa, setEtapa] = useState<Etapa>('resumo')
  const [senha, setSenha] = useState('')
  const [codigoAtual, setCodigoAtual] = useState('')
  const [codigo, setCodigo] = useState('')
  const [aplicativo, setAplicativo] = useState<AplicativoParaLer | null>(null)
  const [codigosNovos, setCodigosNovos] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [segredoCopiado, setSegredoCopiado] = useState(false)

  const carregar = useCallback(() => {
    api
      .get<SituacaoDoSegundoFator>('/api/segundo-fator')
      .then(setSituacao)
      .catch((err) => setSituacao(err instanceof ApiRequestError && err.status === 404 ? 'indisponivel' : null))
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  function voltar() {
    setEtapa('resumo')
    setSenha('')
    setCodigoAtual('')
    setCodigo('')
    setAplicativo(null)
    setErro(null)
  }

  async function enviar(trabalho: () => Promise<void>, padrao: string) {
    setErro(null)
    setEnviando(true)
    try {
      await trabalho()
    } catch (err) {
      setErro(mensagemDoErro(err, padrao))
    } finally {
      setEnviando(false)
    }
  }

  if (situacao === null || situacao === 'indisponivel' || !situacao.disponivel) return null

  const trocando = situacao.ativo

  return (
    <Panel
      title="Login em duas etapas"
      description="Além da senha, a entrada pede um código do aplicativo no seu celular. Obrigatório para administradores."
      actions={situacao.ativo ? <StatusTag tone="ok">Ativo</StatusTag> : <StatusTag tone={obrigatorio ? 'danger' : 'warn'}>Desligado</StatusTag>}
    >
      {etapa === 'resumo' && (
        <div className="flex flex-col gap-4">
          {situacao.ativo ? (
            <>
              <p className="text-sm text-ink-2">
                Ativo desde {dataEmBrasilia(situacao.ativadoEm)}. Restam <strong>{situacao.codigosDeRecuperacaoRestantes}</strong> códigos de recuperação.
              </p>
              {situacao.codigosDeRecuperacaoRestantes <= 3 && (
                <Notice tone="warn">Restam poucos códigos de recuperação. Gere novos e guarde fora do computador.</Notice>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" icon={RefreshCw} onClick={() => setEtapa('renovar')}>
                  Gerar novos códigos de recuperação
                </Button>
                <Button variant="secondary" icon={Smartphone} onClick={() => setEtapa('senha')}>
                  Trocar de celular
                </Button>
              </div>
            </>
          ) : (
            <>
              {obrigatorio && <Notice tone="warn">A administração mexe com cobrança, reembolso e dados de todos os clientes. Para usá-la, ative o login em duas etapas.</Notice>}
              <p className="text-sm text-ink-2">
                Você vai precisar de um aplicativo autenticador no celular: Google Authenticator, Microsoft Authenticator ou Authy. Todos são grátis.
              </p>
              <Button variant="primary" icon={ShieldCheck} className="self-start" onClick={() => setEtapa('senha')}>
                Ativar agora
              </Button>
            </>
          )}
        </div>
      )}

      {etapa === 'senha' && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void enviar(async () => {
              setAplicativo(await api.post<AplicativoParaLer>('/api/segundo-fator/aplicativo', { senha, ...(trocando ? { codigoAtual } : {}) }))
              setEtapa('qr')
            }, 'Não foi possível começar')
          }}
        >
          <Field label="Sua senha" hint="Para confirmar que é você." required>
            <Input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus />
          </Field>
          {trocando && <CampoDoCodigo valor={codigoAtual} onChange={setCodigoAtual} rotulo="Código do celular atual" />}
          <FormError>{erro}</FormError>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" loading={enviando} disabled={enviando || !senha || (trocando && codigoAtual.trim().length < 6)}>
              Continuar
            </Button>
            <Button variant="secondary" onClick={voltar}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {etapa === 'qr' && aplicativo && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void enviar(async () => {
              const r = await api.post<{ token: string; codigosDeRecuperacao: string[] }>('/api/segundo-fator/ativar', { codigo })
              replaceSessionToken(r.token)
              setCodigosNovos(r.codigosDeRecuperacao)
              setEtapa('codigos')
              carregar()
            }, 'Não foi possível ativar')
          }}
        >
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-ink-2">
            <li>No celular, abra o aplicativo autenticador e toque em &quot;+&quot; (adicionar conta).</li>
            <li>Escolha &quot;Ler código QR&quot; e aponte a câmera para o quadrado abaixo.</li>
            <li>Digite aqui os 6 números que aparecerem para &quot;Licita Bela&quot;.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-4">
            <img src={imagemDoQrCode(aplicativo.qrCodeSvg)} alt="QR code para cadastrar a Licita Bela no aplicativo autenticador" width={184} height={184} className="rounded-lg border border-line bg-white" />
            <div className="flex min-w-0 flex-col gap-1.5 text-sm">
              <span className="text-xs font-semibold text-ink-2">Sem câmera? Digite esta chave no aplicativo:</span>
              <code className="select-all break-all rounded-md bg-sunken px-2 py-1 font-mono text-ink">{aplicativo.segredo}</code>
              <button
                type="button"
                className="self-start text-xs font-medium text-accent underline underline-offset-[3px]"
                onClick={() => {
                  navigator.clipboard
                    .writeText(aplicativo.segredo.replace(/\s/g, ''))
                    .then(() => setSegredoCopiado(true))
                    .catch(() => setSegredoCopiado(false))
                }}
              >
                {segredoCopiado ? 'Chave copiada' : 'Copiar a chave'}
              </button>
            </div>
          </div>
          <CampoDoCodigo valor={codigo} onChange={setCodigo} dica="Os 6 números que o aplicativo mostra agora. Eles mudam a cada 30 segundos." />
          <FormError>{erro}</FormError>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" icon={KeyRound} loading={enviando} disabled={enviando || codigo.trim().length < 6}>
              Ativar
            </Button>
            <Button variant="secondary" onClick={voltar}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {etapa === 'renovar' && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void enviar(async () => {
              const r = await api.post<{ codigosDeRecuperacao: string[] }>('/api/segundo-fator/codigos-de-recuperacao', { codigo })
              setCodigosNovos(r.codigosDeRecuperacao)
              setEtapa('codigos')
            }, 'Não foi possível gerar os códigos')
          }}
        >
          <p className="text-sm text-ink-2">Os códigos de recuperação antigos deixam de valer assim que os novos forem gerados.</p>
          <CampoDoCodigo valor={codigo} onChange={setCodigo} autoFocus />
          <FormError>{erro}</FormError>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" loading={enviando} disabled={enviando || codigo.trim().length < 6}>
              Gerar novos códigos
            </Button>
            <Button variant="secondary" onClick={voltar}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {etapa === 'codigos' && (
        <CodigosDeRecuperacao
          codigos={codigosNovos}
          onConcluir={() => {
            setCodigosNovos([])
            voltar()
            carregar()
            onAtivado?.()
          }}
        />
      )}
    </Panel>
  )
}
