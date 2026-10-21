'use client'

import { useCallback, useEffect, useState } from 'react'
import { BellOff, BellRing, Send, Share, Trash2 } from 'lucide-react'
import { api, ApiRequestError } from '@/lib/api'
import {
  AtivacaoRecusada,
  abertoComoApp,
  ativarNesteAparelho,
  ativoParaEsteUsuario,
  desativarNesteAparelho,
  ehIphone,
  inscricaoDesteAparelho,
  navegadorAceitaNotificacao,
  type SituacaoDoCelular,
  type TipoDeAvisoNoCelular,
} from '@/lib/notificacaoNoCelular'
import { Button, Carregando, Checkbox, FormError, Notice, Panel } from '@/components/ui'

const AVISOS: { tipo: TipoDeAvisoNoCelular; rotulo: string; dica: string }[] = [
  { tipo: 'novas-licitacoes', rotulo: 'Licitações novas', dica: 'Assim que aparece uma licitação que combina com os seus itens.' },
  { tipo: 'lembrete-de-prazo', rotulo: 'Prazo perto do fim', dica: '48 e 24 horas antes do fim do prazo das licitações marcadas como "Vou participar".' },
  { tipo: 'aviso-de-alteracao', rotulo: 'Licitação alterada pelo órgão', dica: 'Quando muda o prazo, o valor ou o edital de uma licitação que você acompanha.' },
]

type Aparelho = 'carregando' | 'sem-suporte' | 'iphone-sem-instalar' | 'bloqueado' | 'desativado' | 'ativado'

function mensagemDoErro(err: unknown, padrao: string): string {
  if (err instanceof ApiRequestError || err instanceof AtivacaoRecusada) return err.message
  return padrao
}

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function NotificacoesNoCelular({ userId }: { userId: string }) {
  const [situacao, setSituacao] = useState<SituacaoDoCelular | null>(null)
  const [aparelho, setAparelho] = useState<Aparelho>('carregando')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const [dados, inscricao] = await Promise.all([api.get<SituacaoDoCelular>('/api/celular'), inscricaoDesteAparelho().catch(() => null)])
    setSituacao(dados)
    if (ehIphone() && !abertoComoApp()) setAparelho('iphone-sem-instalar')
    else if (!navegadorAceitaNotificacao()) setAparelho('sem-suporte')
    else if (Notification.permission === 'denied') setAparelho('bloqueado')
    else setAparelho(ativoParaEsteUsuario(inscricao, userId) ? 'ativado' : 'desativado')
  }, [userId])

  useEffect(() => {
    carregar().catch((e) => setErro(mensagemDoErro(e, 'Não foi possível carregar as notificações no celular')))
  }, [carregar])

  async function executar(acao: string, tarefa: () => Promise<void>, padrao: string) {
    setErro(null)
    setMensagem(null)
    setOcupado(acao)
    try {
      await tarefa()
    } catch (e) {
      setErro(mensagemDoErro(e, padrao))
    } finally {
      setOcupado(null)
    }
  }

  const ativar = () =>
    executar(
      'ativar',
      async () => {
        await ativarNesteAparelho(situacao!.chavePublica!, userId)
        await carregar()
        setMensagem('Pronto! Este aparelho vai receber os avisos. Toque em "Enviar teste" para conferir.')
      },
      'Não foi possível ativar as notificações neste aparelho'
    )

  const desativar = () =>
    executar(
      'desativar',
      async () => {
        await desativarNesteAparelho()
        await carregar()
      },
      'Não foi possível desativar as notificações'
    )

  const testar = () =>
    executar(
      'testar',
      async () => {
        const r = await api.post<{ aparelhos: number; entregues: number }>('/api/celular/teste')
        setMensagem(
          r.entregues > 0
            ? `Notificação de teste enviada para ${r.entregues === 1 ? '1 aparelho' : `${r.entregues} aparelhos`}.`
            : 'Não conseguimos entregar o teste. Desative e ative de novo neste aparelho.'
        )
        await carregar()
      },
      'Não foi possível enviar o teste'
    )

  const remover = (id: string) =>
    executar(
      `remover-${id}`,
      async () => {
        await api.delete('/api/celular/aparelhos', { id })
        await carregar()
      },
      'Não foi possível remover o aparelho'
    )

  const alternar = (tipo: TipoDeAvisoNoCelular, ligado: boolean) =>
    executar(
      `preferencia-${tipo}`,
      async () => {
        const r = await api.patch<{ preferencias: SituacaoDoCelular['preferencias'] }>('/api/celular/preferencias', { [tipo]: ligado })
        setSituacao((atual) => (atual ? { ...atual, preferencias: r.preferencias } : atual))
      },
      'Não foi possível salvar a preferência'
    )

  return (
    <Panel title="Notificações no celular" description="Receba no celular, na hora, as licitações novas e os prazos, mesmo com o site fechado.">
      <div id="celular" className="flex flex-col gap-4">
        {!situacao && !erro && <Carregando linhas={2} />}

        {situacao && !situacao.disponivel && <Notice tone="info">As notificações no celular estarão disponíveis em breve.</Notice>}

        {situacao?.disponivel && aparelho === 'iphone-sem-instalar' && (
          <Notice tone="info" title="No iPhone, primeiro coloque a Licita Bela na tela de início">
            <ol className="mt-1 list-decimal pl-4">
              <li>
                No Safari, toque em <Share size={13} className="inline align-[-2px]" aria-label="Compartilhar" /> Compartilhar.
              </li>
              <li>Escolha &ldquo;Adicionar à Tela de Início&rdquo; e toque em &ldquo;Adicionar&rdquo;.</li>
              <li>Abra a Licita Bela pelo ícone novo, entre em Minha conta e ative aqui.</li>
            </ol>
          </Notice>
        )}

        {situacao?.disponivel && aparelho === 'sem-suporte' && (
          <Notice tone="warn">Este navegador não aceita notificações. No Android, use o Chrome; no computador, Chrome, Edge ou Firefox.</Notice>
        )}

        {situacao?.disponivel && aparelho === 'bloqueado' && (
          <Notice tone="warn" title="Notificações bloqueadas neste navegador">
            Libere nas configurações do site (ícone ao lado do endereço › Notificações › Permitir) e recarregue a página.
          </Notice>
        )}

        {situacao?.disponivel && aparelho === 'desativado' && (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={BellRing} loading={ocupado === 'ativar'} disabled={ocupado !== null} onClick={ativar}>
              Ativar neste aparelho
            </Button>
          </div>
        )}

        {situacao?.disponivel && aparelho === 'ativado' && (
          <div className="flex flex-col gap-3">
            <Notice tone="ok">Notificações ativadas neste aparelho.</Notice>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={Send} loading={ocupado === 'testar'} disabled={ocupado !== null} onClick={testar}>
                Enviar teste
              </Button>
              <Button variant="ghost" icon={BellOff} loading={ocupado === 'desativar'} disabled={ocupado !== null} onClick={desativar}>
                Desativar neste aparelho
              </Button>
            </div>
          </div>
        )}

        {situacao?.disponivel && (
          <div className="flex flex-col gap-3 border-t border-line-soft pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Avisar no celular sobre</p>
            {AVISOS.map((aviso) => (
              <Checkbox
                key={aviso.tipo}
                label={aviso.rotulo}
                hint={aviso.dica}
                checked={situacao.preferencias[aviso.tipo]}
                disabled={ocupado !== null}
                onChange={(e) => alternar(aviso.tipo, e.target.checked)}
              />
            ))}
          </div>
        )}

        {situacao?.disponivel && situacao.aparelhos.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-line-soft pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Aparelhos que recebem</p>
            <ul className="flex flex-col gap-1.5">
              {situacao.aparelhos.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink">
                  <span className="min-w-0">
                    {a.aparelho ?? 'Aparelho'} <span className="text-xs text-muted">· desde {dataCurta(a.createdAt)}</span>
                  </span>
                  <Button variant="ghost" size="sm" icon={Trash2} loading={ocupado === `remover-${a.id}`} disabled={ocupado !== null} onClick={() => remover(a.id)}>
                    Remover
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {mensagem && <Notice tone="ok">{mensagem}</Notice>}
        <FormError>{erro}</FormError>
      </div>
    </Panel>
  )
}
