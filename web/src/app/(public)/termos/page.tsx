import { PublicProse } from '@/components/PublicShell'
import { Notice } from '@/components/ui'

export const metadata = { title: 'Termos de Uso — Monitor de Licitações' }

export default function TermosPage() {
  return (
    <PublicProse titulo="Termos de Uso" rotulo="Documento legal">
      <Notice tone="warn" title="Minuta em revisão.">
        Este texto é um ponto de partida e será revisado por advogado antes do lançamento
        comercial. Versão: 2026-10-minuta-1.
      </Notice>
      <div className="text-base leading-relaxed text-ink-2 marker:text-faint [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink [&_li]:pl-1 [&_p]:mb-3 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        <h2>1. O serviço</h2>
        <p>
          O Monitor de Licitações é uma plataforma que coleta licitações publicadas em fontes públicas, permite acompanhá-las por
          critérios definidos pelo usuário, organiza documentos de habilitação e oferece apoio à leitura de editais por inteligência
          artificial.
        </p>

        <h2>2. Conta e responsabilidade pelo acesso</h2>
        <ul>
          <li>O cadastro exige dados verdadeiros, um e-mail que você controla e um CPF ou CNPJ válido.</li>
          <li>Cada CPF ou CNPJ tem direito a um único período de teste gratuito.</li>
          <li>Você é responsável pela guarda da senha e pelas ações feitas na sua conta, inclusive por colegas que convidar.</li>
        </ul>

        <h2>3. Planos, limites e período de teste</h2>
        <p>
          Cada plano tem limites de itens monitorados, usuários e análises de inteligência artificial por mês. Ao atingir um limite,
          novas ações daquele tipo ficam indisponíveis até a ampliação do plano. O período de teste termina na data informada no
          cadastro, quando o acesso é suspenso até a contratação de um plano. A cobrança de planos pagos será regulada em aditivo a
          estes termos antes de sua ativação.
        </p>

        <h2>4. Limitações importantes</h2>
        <ul>
          <li>
            <strong>A análise por IA é um apoio, não uma conclusão.</strong> Ela pode errar ou omitir exigências. A conferência do
            edital original é sempre responsabilidade do usuário.
          </li>
          <li>
            Os dados vêm de portais públicos de terceiros, que podem mudar, ficar indisponíveis ou conter erros. Não garantimos que
            toda licitação publicada será encontrada, nem prazos em tempo real.
          </li>
          <li>
            Prazos em dias úteis consideram apenas feriados nacionais e são estimativas. O prazo oficial é o do edital.
          </li>
          <li>O serviço não é consultoria jurídica, contábil ou de engenharia.</li>
        </ul>

        <h2>5. Uso adequado</h2>
        <p>
          É proibido usar a plataforma para violar a lei, acessar dados de outros clientes, sobrecarregar o serviço, copiar o
          conteúdo em massa ou revender o acesso sem autorização.
        </p>

        <h2>6. Seus dados</h2>
        <p>
          O tratamento de dados pessoais segue a Política de Privacidade. Os dados de cada cliente ficam isolados dos demais, e o
          acesso da equipe da plataforma aos dados de uma empresa é registrado em trilha de auditoria.
        </p>

        <h2>7. Suspensão e encerramento</h2>
        <p>
          Podemos suspender contas que violem estes termos ou coloquem o serviço em risco. Você pode encerrar a conta a qualquer
          momento solicitando a exclusão dos seus dados.
        </p>

        <h2>8. Alterações</h2>
        <p>
          Estes termos podem ser atualizados. Mudanças relevantes serão comunicadas, e a versão aceita por cada usuário fica
          registrada.
        </p>

        <h2>9. Foro e contato</h2>
        <p>[A definir com o advogado: foro, razão social, CNPJ e e-mail de contato.]</p>
      </div>
    </PublicProse>
  )
}
