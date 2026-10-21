'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { MailX } from 'lucide-react'
import { PublicCard } from '@/components/PublicShell'
import { Button, Carregando, FormError, Notice, TextLink } from '@/components/ui'
import { api, ApiRequestError } from '@/lib/api'

const TITULO = 'Descadastrar e-mail'
const FALA = 'Pode deixar. Você escolhe quais avisos quer receber.'

interface SituacaoDoAviso {
  tipo: string
  aviso: string
  recebendo: boolean
}

export default function DescadastroPage() {
  return (
    <Suspense
      fallback={
        <PublicCard title={TITULO} fala={FALA}>
          <Carregando linhas={2} />
        </PublicCard>
      }
    >
      <Conteudo />
    </Suspense>
  )
}

function Conteudo() {
  const token = useSearchParams().get('t') ?? ''
  const [situacao, setSituacao] = useState<SituacaoDoAviso | null>(null)
  const [erro, setErro] = useState<string | null>(token ? null : 'Este link de descadastro está incompleto. Abra de novo o link do e-mail.')
  const [enviando, setEnviando] = useState(false)
  const [concluido, setConcluido] = useState(false)

  useEffect(() => {
    if (!token) return
    api
      .get<SituacaoDoAviso>(`/api/descadastro?t=${encodeURIComponent(token)}`)
      .then(setSituacao)
      .catch((e) => setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível abrir este link agora. Tente de novo em alguns minutos.'))
  }, [token])

  async function confirmar() {
    setErro(null)
    setEnviando(true)
    try {
      setSituacao(await api.post<SituacaoDoAviso>('/api/descadastro', { t: token }))
      setConcluido(true)
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível descadastrar agora. Tente de novo em alguns minutos.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <PublicCard title={TITULO} description="Pare de receber um tipo de aviso da Licita Bela." fala={FALA}>
      <div className="flex flex-col gap-4">
        {!situacao && !erro && <Carregando linhas={2} />}

        {situacao && !concluido && situacao.recebendo && (
          <>
            <p className="text-sm text-ink-2">
              Você vai deixar de receber: <strong className="text-ink">{situacao.aviso}</strong>. Os outros avisos e os e-mails da conta
              continuam iguais.
            </p>
            <Button variant="primary" icon={MailX} loading={enviando} className="pb-cta w-full" onClick={confirmar}>
              {enviando ? 'Descadastrando…' : 'Confirmar descadastro'}
            </Button>
          </>
        )}

        {situacao && (concluido || !situacao.recebendo) && (
          <Notice tone="ok" title="Pronto, descadastrado.">
            Você não recebe mais: {situacao.aviso}. Para voltar a receber, entre na sua conta e ligue o aviso em Conta, na seção “E-mails que você
            recebe”.
          </Notice>
        )}

        <FormError>{erro}</FormError>

        <TextLink href="/conta" className="self-start text-sm">
          Mudar todas as preferências de e-mail
        </TextLink>
      </div>
    </PublicCard>
  )
}
