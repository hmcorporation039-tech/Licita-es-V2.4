'use client'

import { useEffect, useState } from 'react'
import { ScrollText } from 'lucide-react'
import { Button } from '@/components/ui'
import { ApiRequestError, api } from '@/lib/api'

interface SituacaoDosTermos {
  versaoVigente: string
  versaoAceita: string | null
  pendente: boolean
}

export default function AvisoDeTermos() {
  const [situacao, setSituacao] = useState<SituacaoDosTermos | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    api
      .get<SituacaoDosTermos>('/api/conta/termos')
      .then((r) => {
        if (!cancelado) setSituacao(r)
      })
      .catch(() => undefined)
    return () => {
      cancelado = true
    }
  }, [])

  if (!situacao?.pendente) return null

  async function aceitar() {
    if (!situacao) return
    setEnviando(true)
    setErro(null)
    try {
      await api.post('/api/conta/aceitar-termos', { versao: situacao.versaoVigente })
      setSituacao({ ...situacao, pendente: false, versaoAceita: situacao.versaoVigente })
    } catch (e) {
      setErro(e instanceof ApiRequestError ? e.message : 'Não foi possível registrar o aceite. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section
      role="region"
      aria-label="Atualização dos Termos de Uso e da Política de Privacidade"
      className="flex flex-col gap-3 rounded-xl border border-accent-line bg-accent-soft p-4 text-sm text-ink sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <ScrollText size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <p className="max-w-3xl leading-6">
          {situacao.versaoAceita ? 'Atualizamos os ' : 'Para continuar, leia e aceite os '}
          <a href="/termos" target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline underline-offset-2">
            Termos de Uso
          </a>{' '}
          e a{' '}
          <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline underline-offset-2">
            Política de Privacidade
          </a>
          {situacao.versaoAceita ? '. Leia a versão nova e confirme o aceite para continuarmos registrando sua concordância.' : '.'}
          {erro && <span role="alert" className="mt-1 block text-danger">{erro}</span>}
        </p>
      </div>
      <Button variant="primary" size="sm" onClick={aceitar} loading={enviando} className="shrink-0">
        Li e aceito
      </Button>
    </section>
  )
}
