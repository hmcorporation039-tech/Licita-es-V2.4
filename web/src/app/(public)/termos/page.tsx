import { PublicProse } from '@/components/PublicShell'

export const metadata = { title: 'Termos de Uso — Licita Bela' }

export default function TermosPage() {
  return (
    <PublicProse titulo="Termos de Uso" rotulo="Documento legal">
      <div className="text-base leading-relaxed text-ink-2 marker:text-faint [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink [&_li]:pl-1 [&_p]:mb-3 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        <p className="text-sm text-muted">Versão de 20 de outubro de 2026.</p>
        <p>
          Estes Termos regulam o uso da Licita Bela, plataforma oferecida pela <strong>H&amp;M Engenharia e Tecnologia LTDA</strong>,
          CNPJ 04.003.376/0001-00, com sede em Brasília/DF (&ldquo;nós&rdquo;). Ao criar uma conta ou usar a plataforma, você
          (&ldquo;cliente&rdquo;) declara que leu e concorda com estes Termos e com a{' '}
          <a href="/privacidade" className="font-semibold text-accent underline underline-offset-2">
            Política de Privacidade
          </a>
          . Se você usa a plataforma em nome de uma empresa, declara ter poderes para aceitá-los em nome dela.
        </p>

        <h2>1. O que a Licita Bela faz</h2>
        <ul>
          <li>Reúne licitações publicadas em portais públicos (como o PNCP, tribunais de contas e diários oficiais) e avisa quando surge alguma ligada aos itens que você monitora.</li>
          <li>Resume editais com inteligência artificial e aponta exigências, prazos e pontos de atenção.</li>
          <li>Ajuda a calcular custos, preço e valor mínimo no estudo de custos e no plano de disputa com a Bela.</li>
          <li>Gera modelos de proposta, declarações e outros documentos a partir dos dados que você informa.</li>
          <li>Organiza os documentos de habilitação da empresa e avisa sobre vencimentos e prazos.</li>
          <li>Mostra o resultado de licitações já encerradas e preços vencedores de itens parecidos, quando o portal de origem publica essa informação.</li>
        </ul>

        <h2>2. Limites do serviço: leia com atenção</h2>
        <ul>
          <li>
            <strong>A plataforma apoia a sua decisão, não decide por você.</strong> Participar, dar lance, definir preço e enviar
            documentos são decisões e atos exclusivos do cliente.
          </li>
          <li>
            <strong>A análise por inteligência artificial pode errar ou omitir exigências.</strong> O edital original publicado pelo
            órgão sempre prevalece e deve ser conferido antes de qualquer decisão.
          </li>
          <li>
            <strong>A Bela não dá lances.</strong> Ela sugere valores e calcula limites com base no custo e na margem que você informa.
            Quem registra o lance no portal de compras é você.
          </li>
          <li>
            <strong>Os documentos gerados são modelos.</strong> Confira se o edital exige modelo próprio e revise o conteúdo antes de
            assinar ou protocolar. Para questões jurídicas, consulte um advogado.
          </li>
          <li>
            Os dados vêm de portais públicos de terceiros, que podem mudar, sair do ar, atrasar ou conter erros. Não garantimos que
            toda licitação publicada será encontrada, nem que as informações estarão atualizadas em tempo real.
          </li>
          <li>Prazos em dias úteis consideram apenas feriados nacionais e são estimativas. O prazo que vale é o do edital.</li>
          <li>
            Preços vencedores e de mercado são referências históricas, não garantia de resultado. O estudo de custos depende dos
            valores que você informa.
          </li>
          <li>A plataforma não presta consultoria jurídica, contábil, tributária ou de engenharia.</li>
        </ul>

        <h2>3. Conta e acesso</h2>
        <ul>
          <li>O cadastro exige dados verdadeiros, um e-mail que você controla e um CPF ou CNPJ válido.</li>
          <li>Cada CPF ou CNPJ tem direito a um único período de teste gratuito.</li>
          <li>
            Você é responsável por guardar a senha e pelas ações feitas na sua conta, inclusive pelos usuários que convidar para a
            empresa. Avise-nos imediatamente se suspeitar de uso indevido.
          </li>
          <li>Os dados que você cadastra, como CPF do responsável e dados bancários usados na proposta, devem ser corretos e autorizados pelos seus titulares.</li>
        </ul>

        <h2>4. Teste grátis, planos e pagamento</h2>
        <ul>
          <li>O teste grátis dura 7 dias a partir da confirmação do e-mail, não pede cartão e não vira assinatura automaticamente.</li>
          <li>
            Os planos, seus limites (itens monitorados, usuários e análises por mês) e preços são os divulgados na página de planos
            no momento da contratação. Ao atingir um limite, novas ações daquele tipo ficam indisponíveis até a renovação do período
            ou a mudança de plano.
          </li>
          <li>
            A assinatura é mensal ou anual, paga antecipadamente por meio de um intermediador de pagamento, e renova
            automaticamente ao fim de cada período até ser cancelada.
          </li>
          <li>
            Você pode cancelar a qualquer momento, sem multa. O acesso continua até o fim do período já pago, sem devolução
            proporcional, exceto no caso previsto no item seguinte.
          </li>
          <li>Na primeira contratação, você pode desistir em até 7 dias e receber de volta o valor pago.</li>
          <li>
            Com pagamento em atraso por mais de 5 dias, o acesso pode ser suspenso até a regularização. Os dados continuam guardados
            durante a suspensão.
          </li>
          <li>Reajustes de preço serão avisados com pelo menos 30 dias de antecedência e valem a partir da renovação seguinte.</li>
        </ul>

        <h2>5. Uso adequado</h2>
        <p>
          É proibido usar a plataforma para violar a lei ou direitos de terceiros, tentar acessar dados de outros clientes, testar
          ou burlar a segurança, sobrecarregar o serviço, extrair o conteúdo em massa por robôs ou revender o acesso sem autorização
          por escrito.
        </p>

        <h2>6. Disponibilidade</h2>
        <p>
          Trabalhamos para manter a plataforma no ar o tempo todo, mas pode haver interrupções por manutenção, falhas de
          fornecedores ou de portais públicos. Sempre que possível, avisaremos manutenções programadas com antecedência.
        </p>

        <h2>7. Responsabilidade</h2>
        <ul>
          <li>
            Não respondemos por perda de licitação, desclassificação, inabilitação, multas, lucros cessantes ou outros prejuízos
            decorrentes de decisões tomadas com base nas informações da plataforma, de erros ou atrasos dos portais de origem, ou de
            dados incorretos informados pelo cliente.
          </li>
          <li>
            Em qualquer caso, nossa responsabilidade total fica limitada ao valor pago pelo cliente nos 12 meses anteriores ao fato.
          </li>
          <li>Essas limitações não se aplicam a danos causados por dolo ou nos casos em que a lei não permita limitar a responsabilidade.</li>
        </ul>

        <h2>8. Propriedade</h2>
        <p>
          A plataforma, a marca Licita Bela e seus conteúdos próprios pertencem à H&amp;M Engenharia e Tecnologia LTDA. Os dados e
          documentos que você cadastra continuam sendo seus, e você nos autoriza a tratá-los apenas para prestar o serviço, como
          descrito na Política de Privacidade.
        </p>

        <h2>9. Suporte</h2>
        <p>
          O atendimento é feito em dias úteis, das 9h às 18h (horário de Brasília), pelo e-mail{' '}
          <strong>suporte@licitabela.com.br</strong>. Respondemos em até 1 dia útil.
        </p>

        <h2>10. Suspensão e encerramento</h2>
        <p>
          Podemos suspender ou encerrar contas que violem estes Termos ou coloquem o serviço em risco, avisando o motivo. Você pode
          encerrar a conta a qualquer momento e pedir a exclusão dos dados pelo menu Conta.
        </p>

        <h2>11. Alterações destes Termos</h2>
        <p>
          Podemos atualizar estes Termos. Mudanças relevantes serão avisadas na plataforma ou por e-mail, e a versão aceita por cada
          usuário fica registrada. O uso depois do aviso depende do aceite da nova versão.
        </p>

        <h2>12. Lei e foro</h2>
        <p>
          Aplica-se a lei brasileira. Fica eleito o foro de Brasília/DF para resolver qualquer questão sobre estes Termos,
          ressalvado o foro do domicílio do consumidor quando a lei assim determinar.
        </p>
      </div>
    </PublicProse>
  )
}
