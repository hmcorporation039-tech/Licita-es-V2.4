import { PublicProse } from '@/components/PublicShell'

export const metadata = { title: 'Política de Privacidade — Licita Bela' }

export default function PrivacidadePage() {
  return (
    <PublicProse titulo="Política de Privacidade" rotulo="Documento legal">
      <div className="text-base leading-relaxed text-ink-2 marker:text-faint [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink [&_li]:pl-1 [&_p]:mb-3 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        <p className="text-sm text-muted">Versão de 20 de outubro de 2026.</p>
        <p>
          Esta Política explica quais dados pessoais a Licita Bela trata, para quê, com quem compartilha e quais são os seus
          direitos, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018). A controladora dos dados é a{' '}
          <strong>H&amp;M Engenharia e Tecnologia LTDA</strong>, CNPJ 04.003.376/0001-00, Brasília/DF.
        </p>

        <h2>1. Quais dados tratamos</h2>
        <ul>
          <li>
            <strong>Cadastro:</strong> nome, e-mail, senha (guardada só como hash irreversível), CPF ou CNPJ, nome da empresa e
            telefone (opcional).
          </li>
          <li>
            <strong>Dados da empresa que você completa:</strong> endereço, e-mail e telefone da empresa, nome, CPF e cargo do
            responsável legal, dados bancários e logomarca. São usados para preencher propostas e declarações.
          </li>
          <li>
            <strong>Documentos de habilitação:</strong> os arquivos que você envia ao cofre (PDF, JPG ou PNG, até 10 MB cada) ficam
            guardados no nosso banco de dados, junto com nome, tipo e validade.
          </li>
          <li>
            <strong>Uso da plataforma:</strong> itens monitorados, licitações escolhidas, estudos de custos, planos de disputa e
            lances registrados, avisos enviados e pedidos de análise.
          </li>
          <li>
            <strong>Segurança e auditoria:</strong> registro de acessos e ações (data, usuário, endereço IP e navegador).
          </li>
          <li>
            <strong>Origem do cadastro:</strong> parâmetros do anúncio ou link pelo qual você chegou (UTM) e o termo pesquisado na
            página inicial.
          </li>
          <li>
            <strong>Vencedores de licitações:</strong> nome, CNPJ e porte de fornecedores vencedores, publicados pelos órgãos no
            PNCP. Quando o vencedor é pessoa física, guardamos o CPF já mascarado.
          </li>
        </ul>

        <h2>2. Para que usamos e com qual base legal</h2>
        <ul>
          <li>
            <strong>Prestar o serviço contratado</strong> (execução de contrato): criar e manter a conta, enviar os avisos que você
            configurou, gerar documentos, controlar limites do plano e cobrar a assinatura.
          </li>
          <li>
            <strong>Segurança e prevenção de fraude</strong> (legítimo interesse): confirmar o e-mail, limitar tentativas, impedir
            mais de um teste grátis por CPF ou CNPJ e manter a trilha de auditoria.
          </li>
          <li>
            <strong>Cumprir obrigações legais</strong>: guardar registros de acesso pelo prazo do Marco Civil da Internet e
            documentos fiscais.
          </li>
          <li>
            <strong>Melhorar o produto e entender de onde vêm os clientes</strong> (legítimo interesse), usando a origem do cadastro.
          </li>
        </ul>
        <p>Não vendemos dados pessoais e não usamos seus dados para publicidade de terceiros.</p>

        <h2>3. Com quem compartilhamos</h2>
        <p>Só com fornecedores necessários para o serviço funcionar, que tratam os dados em nosso nome:</p>
        <ul>
          <li><strong>Railway</strong>: servidores e banco de dados.</li>
          <li><strong>Vercel</strong>: hospedagem do site.</li>
          <li><strong>Upstash</strong>: fila de tarefas.</li>
          <li><strong>Resend</strong>: envio de e-mails (seu e-mail, nome e o conteúdo do aviso).</li>
          <li><strong>Cloudflare</strong>: verificação anti-robô no cadastro, quando ativada (endereço IP).</li>
          <li><strong>ViaCEP e BrasilAPI</strong>: consulta do endereço pelo CEP que você digita.</li>
          <li>
            <strong>Anthropic e Google</strong>: provedores de inteligência artificial. Recebem apenas o texto público do edital
            para gerar o resumo. Não enviamos seus dados cadastrais, financeiros nem os documentos do cofre.
          </li>
          <li>Intermediador de pagamento, quando você contratar um plano.</li>
          <li>Autoridades públicas, quando houver obrigação legal ou ordem judicial.</li>
        </ul>
        <p>
          Alguns desses fornecedores guardam ou processam dados fora do Brasil, principalmente nos Estados Unidos. Essa
          transferência é feita para executar o contrato com você, com fornecedores que adotam padrões de segurança compatíveis
          com a LGPD.
        </p>

        <h2>4. Isolamento e acesso interno</h2>
        <p>
          Os dados de cada empresa ficam separados dos demais clientes. A equipe da Licita Bela só consulta os dados de uma empresa
          para suporte, segurança ou cumprimento da lei, e cada consulta fica registrada na trilha de auditoria.
        </p>

        <h2>5. Cookies e armazenamento no navegador</h2>
        <p>
          A plataforma não usa cookies próprios nem pixels de publicidade. Guardamos no armazenamento local do seu navegador a
          sessão de acesso, a preferência de voz da Bela e os parâmetros do link pelo qual você chegou. Esses dados ficam no seu
          aparelho e são apagados quando você sai da conta ou limpa os dados do navegador. Se passarmos a usar ferramentas de
          medição de anúncios, esta Política será atualizada e pediremos seu consentimento antes.
        </p>

        <h2>6. Por quanto tempo guardamos</h2>
        <ul>
          <li>Dados da conta e da empresa: enquanto a conta existir.</li>
          <li>
            Depois que o acesso termina, os dados continuam guardados para você poder voltar ou exportá-los, até que você peça a
            exclusão. Contas sem acesso há mais de 12 meses podem ser excluídas, com aviso prévio por e-mail.
          </li>
          <li>Pedido de exclusão: atendido em até 15 dias, com confirmação por e-mail.</li>
          <li>
            Registros de acesso: no mínimo 6 meses, como exige o Marco Civil da Internet. Quando a conta é excluída, eles são
            anonimizados (sem e-mail, IP e navegador).
          </li>
          <li>Cópias de segurança do banco: guardadas com acesso restrito; dados excluídos podem permanecer nelas por até 90 dias.</li>
          <li>Dados fiscais e de pagamento: pelo prazo exigido pela legislação tributária.</li>
        </ul>

        <h2>7. Seus direitos</h2>
        <p>
          Você pode pedir a qualquer momento: confirmação de que tratamos seus dados, acesso, correção, anonimização, bloqueio ou
          eliminação de dados desnecessários, portabilidade, informação sobre com quem compartilhamos e revisão de decisões
          automatizadas.
        </p>
        <ul>
          <li>Pelos menus <strong>Conta</strong> e <strong>Empresa</strong>, você corrige seus dados; em <strong>Conta</strong>, também baixa uma cópia dos dados de cadastro e pede a exclusão da conta.</li>
          <li>Os demais pedidos, inclusive a cópia dos documentos do cofre e dos estudos, são feitos pelo e-mail do encarregado abaixo.</li>
        </ul>

        <h2>8. Segurança</h2>
        <p>
          Usamos conexão criptografada (HTTPS), senhas protegidas por hash, confirmação de e-mail, limites contra tentativas em
          massa, sessões que podem ser revogadas e trilha de auditoria. Nenhum sistema é totalmente imune. Em caso de incidente que
          possa trazer risco aos titulares, avisaremos os afetados e a Autoridade Nacional de Proteção de Dados, conforme a lei.
        </p>

        <h2>9. Alterações desta Política</h2>
        <p>
          Podemos atualizar esta Política. Mudanças relevantes serão avisadas na plataforma ou por e-mail, e a versão aceita por cada
          usuário fica registrada.
        </p>

        <h2>10. Encarregado de dados</h2>
        <p>
          Encarregado pelo tratamento de dados pessoais: <strong>Márcio Henrique</strong>, pelo e-mail{' '}
          <strong>suporte@licitabela.com.br</strong>. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).
        </p>
      </div>
    </PublicProse>
  )
}
