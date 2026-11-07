// Passo a passo de uma participação, do zero ao contrato, com a tela da Bela onde
// cada passo acontece. Usado no Guia (cliente) e no atendimento (suporte humano).

export interface PassoDaParticipacao {
  titulo: string
  texto: string
  ondeNaBela?: { rotulo: string; href: string }
  foraDoSistema?: boolean
}

export const PASSOS_DA_PARTICIPACAO: PassoDaParticipacao[] = [
  {
    titulo: 'Acesso aos portais (fora da Bela, uma vez só)',
    texto:
      'Conta gov.br nível prata ou ouro do representante, credenciamento da empresa no SICAF para o Compras.gov.br e cadastro nos outros portais em que for disputar. Alguns pedem certificado digital. A Bela não faz esse cadastro pela empresa; o suporte orienta.',
    foraDoSistema: true,
  },
  {
    titulo: 'Dados da empresa e documentos',
    texto: 'Preencha os dados, a base de onde sai a entrega e o papel timbrado. No cofre, cadastre as certidões e documentos com a validade e o arquivo.',
    ondeNaBela: { rotulo: 'Empresa e documentos', href: '/empresa' },
  },
  {
    titulo: 'O que a empresa vende',
    texto: 'Informe o CNPJ ou descreva o que vende e a Bela sugere os itens monitorados. Ajuste palavras, estados e faixa de valor. É isso que faz chegar as licitações certas.',
    ondeNaBela: { rotulo: 'Itens monitorados', href: '/items' },
  },
  {
    titulo: 'Achar a licitação',
    texto: 'Veja o que chegou em Meus matches, filtre a lista de licitações ou pergunte à Bela, por exemplo: “quais licitações de câmeras abertas em GO acima de 50 mil?”.',
    ondeNaBela: { rotulo: 'Licitações', href: '/tenders' },
  },
  {
    titulo: 'Ler o edital',
    texto: 'Na licitação, peça a análise. A Bela traz o resumo, os prazos, as exigências com a página do edital, os riscos e as cláusulas que parecem passar dos limites da lei.',
  },
  {
    titulo: 'Posso participar?',
    texto: 'Na aba Habilitação, o parecer diz se a empresa está habilitada, o que falta e o que vence antes da sessão. Resolva o que estiver em vermelho antes da data.',
  },
  {
    titulo: 'Impugnar ou pedir esclarecimento',
    texto: 'Se algo no edital parecer errado ou ilegal, o prazo é de até 3 dias úteis antes da sessão. A Bela mostra a data-limite e ajuda com a minuta.',
  },
  {
    titulo: 'Quanto cobrar',
    texto: 'Escolha a licitação e faça o estudo de custos: custo e preço de cada item, impostos, deslocamento, lucro e até quanto dá para baixar o lance sem prejuízo.',
    ondeNaBela: { rotulo: 'Escolhidas', href: '/escolhidas' },
  },
  {
    titulo: 'Enviar a proposta',
    texto:
      'Com os preços do estudo, use “Copiar itens e preços” ou, na tela de cadastro da proposta do portal, a extensão “Bela na disputa”, que preenche o preço de cada item. Confira e envie no portal junto com os documentos.',
  },
  {
    titulo: 'Sessão de disputa',
    texto:
      'Abra o Pregão com a Bela e, no computador, a sala de disputa com a extensão ligada. A Bela lê o melhor lance, sugere o próximo sem passar do seu piso, preenche o campo para você conferir e enviar, e lê o chat do pregoeiro.',
    ondeNaBela: { rotulo: 'Minhas sessões', href: '/sessoes' },
  },
  {
    titulo: 'Convocação e habilitação',
    texto: 'Quando o pregoeiro chamar a empresa (anexo, proposta ajustada, negociação), a Bela avisa no sistema e no celular. Envie dentro do prazo que ele der.',
  },
  {
    titulo: 'Recurso, resultado e contrato',
    texto: 'Se outra empresa ganhou com documento falho, a aba Concorrentes ajuda a apontar e montar o recurso. Registre o resultado no Pregão; o contrato e a ata aparecem em Resultado.',
  },
]
