import { PublicProse } from '@/components/PublicShell'
import { Notice } from '@/components/ui'

export const metadata = { title: 'Política de Privacidade — Monitor de Licitações' }

export default function PrivacidadePage() {
  return (
    <PublicProse>
      <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink">Política de Privacidade</h1>
      <Notice tone="warn" title="Minuta em revisão." className="mt-4">
        Este texto descreve o que a plataforma faz hoje e será revisado por advogado
        (LGPD) antes do lançamento comercial. Versão: 2026-10-minuta-1.
      </Notice>
      <div className="text-base leading-relaxed text-ink-2 marker:text-faint [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink [&_li]:pl-1 [&_p]:mb-3 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        <h2>1. Quais dados tratamos</h2>
        <ul>
          <li>
            <strong>Cadastro:</strong> nome, e-mail, telefone (opcional), CPF ou CNPJ, nome da empresa e a senha (guardada
            apenas de forma criptografada irreversível).
          </li>
          <li>
            <strong>Uso:</strong> itens monitorados, decisões de participação, checklist e a descrição e validade dos documentos
            do cofre. <strong>O cofre guarda apenas informações sobre o documento (nome, tipo, datas), não o arquivo.</strong>
          </li>
          <li>
            <strong>Segurança:</strong> registro de acessos e ações (data, usuário, endereço IP e navegador) para auditoria e
            prevenção de fraude.
          </li>
          <li>
            <strong>Análises por IA:</strong> o texto público dos editais é enviado a provedores de inteligência artificial para
            gerar o resumo. Não enviamos seus dados cadastrais nem os do cofre.
          </li>
        </ul>

        <h2>2. Para que usamos</h2>
        <p>
          Prestar o serviço contratado, confirmar seu e-mail, recuperar sua senha, enviar alertas que você configurou, controlar
          limites do plano, prevenir abuso (um teste por CPF/CNPJ) e cumprir obrigações legais.
        </p>

        <h2>3. Com quem compartilhamos</h2>
        <ul>
          <li>Provedores de infraestrutura (hospedagem e banco de dados), de e-mail e de inteligência artificial, que tratam os dados apenas para nos prestar o serviço.</li>
          <li>Autoridades, quando houver obrigação legal.</li>
          <li>Não vendemos dados pessoais.</li>
        </ul>

        <h2>4. Isolamento e acesso interno</h2>
        <p>
          Os dados de cada empresa ficam separados dos demais. A equipe administradora da plataforma pode consultar os dados de uma
          empresa para suporte e segurança, e cada consulta é registrada em trilha de auditoria.
        </p>

        <h2>5. Por quanto tempo guardamos</h2>
        <p>
          Enquanto a conta existir e pelo prazo necessário para cumprir obrigações legais e defender direitos. [Prazos exatos a
          definir com o advogado.]
        </p>

        <h2>6. Seus direitos (LGPD)</h2>
        <p>
          Você pode pedir confirmação do tratamento, acesso, correção, anonimização, portabilidade e exclusão dos seus dados, além
          de informações sobre compartilhamento e revogação de consentimento.
        </p>

        <h2>7. Segurança</h2>
        <p>
          Usamos conexão criptografada, senhas protegidas por hash, limites contra tentativas em massa, sessões revogáveis e
          trilha de auditoria. Nenhum sistema é totalmente imune; em caso de incidente relevante, os afetados serão informados
          conforme a lei.
        </p>

        <h2>8. Contato do encarregado</h2>
        <p>[A definir: nome do encarregado de dados (DPO) e e-mail de contato.]</p>
      </div>
    </PublicProse>
  )
}
