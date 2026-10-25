// ============================================================
// lib/modalidadesEducativo.ts — Conteúdo educativo curto de cada modalidade de
// licitação (o que é, quando se usa, quem participa, cuidados). O `value` bate
// com MODALIDADE_OPTIONS/ModalidadeEnum, para no futuro ligar cada card a uma
// aula de um curso dentro da plataforma. É apoio didático, não aconselhamento
// jurídico: o que vale é sempre o edital e a lei.
// ============================================================

export interface ModalidadeEducativa {
  value: string
  label: string
  legado?: string
  oQueE: string
  quandoUsada: string
  quemPode: string
  cuidados: string
}

export const MODALIDADES_EDUCATIVO: ModalidadeEducativa[] = [
  {
    value: 'PREGAO_ELETRONICO',
    label: 'Pregão Eletrônico',
    oQueE: 'A modalidade mais comum na Lei 14.133/2021. A disputa acontece pela internet, com lances sucessivos, e vence em geral o menor preço (ou o maior desconto).',
    quandoUsada: 'Para bens e serviços comuns — aqueles cujo padrão de qualidade e desempenho dá para descrever objetivamente no edital.',
    quemPode: 'Qualquer empresa do ramo que atenda às exigências de habilitação. ME e EPP têm benefícios (empate ficto e, em alguns casos, exclusividade).',
    cuidados: 'Acompanhe a sessão de lances em tempo real e cuide da exequibilidade: preço muito abaixo do estimado, sem justificativa, pode ser desclassificado.',
  },
  {
    value: 'PREGAO_PRESENCIAL',
    label: 'Pregão Presencial',
    oQueE: 'Mesma lógica do pregão, mas a sessão e os lances ocorrem presencialmente, com representante no local.',
    quandoUsada: 'Também para bens e serviços comuns. Na 14.133 é exceção: só quando se justifica a inviabilidade do eletrônico.',
    quemPode: 'Qualquer empresa do ramo habilitada, com representante credenciado presente na sessão.',
    cuidados: 'Exige deslocamento e procuração com poderes para dar lances. Confira as regras de credenciamento do representante no edital.',
  },
  {
    value: 'CONCORRENCIA',
    label: 'Concorrência',
    oQueE: 'Modalidade para contratações maiores ou mais complexas, que admite outros critérios além do menor preço (melhor técnica, técnica e preço, maior retorno econômico).',
    quandoUsada: 'Para bens e serviços especiais e para obras e serviços de engenharia.',
    quemPode: 'Qualquer interessado que atenda à habilitação — que aqui costuma ser mais exigente (qualificação técnica e econômico-financeira).',
    cuidados: 'Leia com atenção as exigências de atestados, índices contábeis e garantias; costumam ser o que mais inabilita concorrentes.',
  },
  {
    value: 'DIALOGO_COMPETITIVO',
    label: 'Diálogo Competitivo',
    oQueE: 'Modalidade nova da 14.133: a Administração dialoga com licitantes pré-selecionados para construir a solução antes de receber as propostas.',
    quandoUsada: 'Em objetos de inovação técnica ou tecnológica, quando o órgão não consegue definir sozinho a melhor solução.',
    quemPode: 'Interessados que passam por uma pré-seleção e são convidados a participar das rodadas de diálogo.',
    cuidados: 'É rara e complexa, com várias fases. Exige equipe técnica para acompanhar os diálogos.',
  },
  {
    value: 'CONCURSO',
    label: 'Concurso',
    oQueE: 'Escolha de um trabalho técnico, científico ou artístico, premiando ou remunerando o vencedor.',
    quandoUsada: 'Para projetos, estudos, peças publicitárias, arquitetura e afins.',
    quemPode: 'Pessoas ou empresas que apresentem o trabalho conforme o regulamento do concurso.',
    cuidados: 'O foco é a qualidade do trabalho, não o preço. Guarde os direitos autorais e as regras de uso previstas no edital.',
  },
  {
    value: 'CREDENCIAMENTO',
    label: 'Credenciamento',
    oQueE: 'Não é uma disputa por preço: é uma contratação direta em que todos os interessados que cumprem os requisitos são credenciados e podem contratar.',
    quandoUsada: 'Quando a Administração quer contratar todos os aptos de um mercado (ex.: rede de saúde, leiloeiros, oficinas).',
    quemPode: 'Todos que atendam aos requisitos do edital de credenciamento — não há "ganhador" único.',
    cuidados: 'O preço costuma ser tabelado pela Administração. O jogo é cumprir os requisitos e manter os documentos em dia durante toda a vigência.',
  },
  {
    value: 'DISPENSA_COM_DISPUTA',
    label: 'Dispensa (com disputa)',
    oQueE: 'Contratação direta (dispensa de licitação) feita por um pregão simplificado: há uma fase de lances eletrônicos, geralmente rápida.',
    quandoUsada: 'Principalmente em compras de pequeno valor, dentro dos limites da lei (dispensa por valor).',
    quemPode: 'Qualquer empresa do ramo habilitada; ME e EPP mantêm os benefícios legais.',
    cuidados: 'Prazos curtos — é preciso estar atento para não perder a abertura. Fracionar a mesma compra para fugir da licitação é vedado.',
  },
  {
    value: 'DISPENSA_SEM_DISPUTA',
    label: 'Dispensa (sem disputa)',
    oQueE: 'Contratação direta sem fase de lances: o órgão escolhe com base em cotação ou nas hipóteses previstas em lei.',
    quandoUsada: 'Em situações específicas do art. 75 (emergência, valor baixo, hipóteses legais) em que não há disputa.',
    quemPode: 'Empresas do ramo que o órgão convida a cotar ou que atendem à hipótese legal.',
    cuidados: 'Mantenha preços e documentos prontos para responder rápido. Confira sempre a justificativa e a base legal da dispensa.',
  },
  {
    value: 'INEXIGIBILIDADE',
    label: 'Inexigibilidade',
    oQueE: 'Contratação direta quando a competição é inviável — não há "disputa" porque só um fornecedor pode atender.',
    quandoUsada: 'Fornecedor ou produto exclusivo, serviços técnicos especializados de notória especialização, ou profissional/artista consagrado.',
    quemPode: 'Em regra, o fornecedor que comprova a exclusividade ou a especialização exigida.',
    cuidados: 'A exclusividade/especialização precisa estar bem comprovada; é um dos pontos mais fiscalizados pelos órgãos de controle.',
  },
  {
    value: 'TOMADA_DE_PRECOS',
    label: 'Tomada de Preços',
    legado: 'Extinta pela Lei 14.133/2021. Só aparece em processos antigos, regidos pela Lei 8.666/1993.',
    oQueE: 'Modalidade da antiga Lei 8.666, para contratações de valor intermediário, que exigia cadastro prévio dos interessados.',
    quandoUsada: 'Não é mais usada em processos novos. Hoje o equivalente cai em pregão ou concorrência.',
    quemPode: 'Na época, empresas cadastradas (ou que se cadastrassem até três dias antes).',
    cuidados: 'Se encontrar uma hoje, é processo antigo — confira a data e a lei aplicável antes de participar.',
  },
  {
    value: 'CONVITE',
    label: 'Convite',
    legado: 'Extinta pela Lei 14.133/2021 (a antiga "carta convite"). Só aparece em processos antigos, regidos pela Lei 8.666/1993.',
    oQueE: 'Modalidade mais simples da antiga Lei 8.666, para valores baixos, em que o órgão convidava ao menos três empresas.',
    quandoUsada: 'Não é mais usada em processos novos. Hoje o equivalente é a dispensa ou o pregão.',
    quemPode: 'Na época, convidados pelo órgão e também cadastrados que manifestassem interesse.',
    cuidados: 'Se aparecer, é processo antigo. A plataforma a marca como "legado" para você não confundir com as regras atuais.',
  },
]
