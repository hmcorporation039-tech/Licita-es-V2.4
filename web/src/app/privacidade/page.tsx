import PublicShell from '@/components/PublicShell'

export const metadata = { title: 'Política de Privacidade — Monitor de Licitações' }

// MINUTA (LGPD). Texto-base para revisão por advogado/encarregado de dados.
// Ao alterar, atualize TERMOS_VERSAO em src/lib/legal.ts (API).
export default function PrivacidadePage() {
  return (
    <PublicShell>
      <div className="mb-6 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <strong>Minuta em revisão.</strong> Este texto descreve o que a plataforma faz hoje e será revisado por advogado
        (LGPD) antes do lançamento comercial. Versão: 2026-10-minuta-1.
      </div>
      <article className="mx-auto max-w-3xl text-sm leading-relaxed text-slate-700 [&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-900 [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5">
        <h1 className="mb-4 text-2xl font-semibold text-slate-900">Política de Privacidade</h1>

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
      </article>
    </PublicShell>
  )
}
