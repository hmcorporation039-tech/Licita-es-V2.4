// Ramos das páginas públicas de licitações (SEO): /licitacoes/[ramo] e /licitacoes/[ramo]/[estado].
// Cada ramo busca até 4 termos (sinônimos) nas licitações com prazo confirmado.
// O texto de cada ramo é próprio, para a página não ser só uma lista repetida.

import { ESTADOS, type Estado } from './estados'

export interface RamoPublico {
  slug: string
  nome: string
  // Como o ramo aparece na frase: "licitações de {de}"
  de: string
  termos: string[]
  resumo: string
  exemplos: string[]
}

export const RAMOS_PUBLICOS: RamoPublico[] = [
  {
    slug: 'limpeza',
    nome: 'Limpeza e higiene',
    de: 'material de limpeza',
    termos: ['material de limpeza', 'produtos de limpeza', 'higiene', 'limpeza'],
    resumo: 'Prefeituras, escolas, hospitais e repartições compram material de limpeza e higiene o ano inteiro, quase sempre por pregão eletrônico e registro de preços.',
    exemplos: ['desinfetante, água sanitária e detergente', 'papel higiênico e papel toalha', 'sacos de lixo e luvas', 'serviço de limpeza e conservação'],
  },
  {
    slug: 'construcao-e-obras',
    nome: 'Construção e obras',
    de: 'obras e construção',
    termos: ['obra', 'construção', 'reforma', 'pavimentação'],
    resumo: 'Obras públicas incluem construção, reforma, ampliação, pavimentação e drenagem. Exigem atestado de capacidade técnica e, em geral, registro no CREA ou CAU.',
    exemplos: ['construção de escolas e unidades de saúde', 'reforma e ampliação de prédios públicos', 'pavimentação asfáltica e drenagem', 'calçadas e meio-fio'],
  },
  {
    slug: 'material-de-construcao',
    nome: 'Material de construção',
    de: 'material de construção',
    termos: ['material de construção', 'materiais de construção', 'material hidráulico', 'cimento'],
    resumo: 'Órgãos compram material de construção, elétrico e hidráulico para manutenção própria, muitas vezes em atas de registro de preços que duram um ano.',
    exemplos: ['cimento, areia e brita', 'material hidráulico e conexões', 'tintas e ferragens', 'blocos e telhas'],
  },
  {
    slug: 'manutencao-predial',
    nome: 'Manutenção predial',
    de: 'manutenção predial',
    termos: ['manutenção predial', 'manutenção preventiva e corretiva', 'manutenção de ar condicionado'],
    resumo: 'Contratos de manutenção predial cobrem reparos, pintura, elétrica, hidráulica e climatização, com serviço contínuo por 12 meses ou mais.',
    exemplos: ['manutenção preventiva e corretiva', 'manutenção de ar-condicionado', 'pintura e pequenos reparos', 'manutenção elétrica e hidráulica'],
  },
  {
    slug: 'eletrica',
    nome: 'Material e serviços elétricos',
    de: 'material e serviços elétricos',
    termos: ['material elétrico', 'materiais elétricos', 'iluminação pública', 'instalações elétricas'],
    resumo: 'Material elétrico, iluminação pública com LED e instalações elétricas aparecem em prefeituras de todo o país, inclusive em projetos de eficiência energética.',
    exemplos: ['luminárias e lâmpadas LED', 'iluminação pública', 'cabos, disjuntores e quadros', 'subestações e SPDA'],
  },
  {
    slug: 'informatica',
    nome: 'Informática e tecnologia',
    de: 'informática',
    termos: ['informática', 'computadores', 'notebook', 'impressoras'],
    resumo: 'Governo federal, estados, municípios, universidades e tribunais compram computadores, notebooks, impressoras, rede e software continuamente.',
    exemplos: ['computadores e notebooks', 'impressoras e suprimentos', 'equipamentos de rede', 'licenças de software'],
  },
  {
    slug: 'cftv-e-seguranca-eletronica',
    nome: 'CFTV e segurança eletrônica',
    de: 'CFTV e segurança eletrônica',
    termos: ['videomonitoramento', 'cftv', 'câmeras de segurança', 'alarme'],
    resumo: 'Videomonitoramento, câmeras, alarmes e controle de acesso estão entre as compras que mais crescem em prefeituras e escolas.',
    exemplos: ['câmeras e gravadores (CFTV)', 'videomonitoramento urbano', 'alarme e controle de acesso', 'instalação e manutenção'],
  },
  {
    slug: 'alimentacao',
    nome: 'Alimentação',
    de: 'gêneros alimentícios',
    termos: ['gêneros alimentícios', 'alimentação escolar', 'merenda', 'refeições'],
    resumo: 'Merenda escolar, gêneros alimentícios e refeições prontas são compras recorrentes, com espaço garantido para agricultura familiar e pequenas empresas.',
    exemplos: ['gêneros alimentícios perecíveis e não perecíveis', 'merenda e alimentação escolar', 'refeições e marmitex', 'hortifrúti'],
  },
  {
    slug: 'medicamentos',
    nome: 'Medicamentos',
    de: 'medicamentos',
    termos: ['medicamentos', 'farmácia básica'],
    resumo: 'Secretarias de saúde compram medicamentos por registro de preços para a farmácia básica, hospitais e unidades de atendimento.',
    exemplos: ['medicamentos da farmácia básica', 'medicamentos hospitalares', 'medicamentos controlados', 'atendimento a ordens judiciais'],
  },
  {
    slug: 'material-hospitalar',
    nome: 'Material hospitalar',
    de: 'material hospitalar',
    termos: ['material hospitalar', 'materiais hospitalares', 'material médico', 'equipamentos hospitalares'],
    resumo: 'Hospitais e unidades de saúde compram material médico-hospitalar, insumos e equipamentos em grande volume, quase sempre por pregão.',
    exemplos: ['seringas, luvas e gazes', 'material odontológico', 'equipamentos hospitalares', 'insumos de laboratório'],
  },
  {
    slug: 'mobiliario',
    nome: 'Mobiliário',
    de: 'mobiliário',
    termos: ['mobiliário', 'móveis', 'cadeiras', 'mobiliário escolar'],
    resumo: 'Mesas, cadeiras, armários e mobiliário escolar são comprados por órgãos e escolas, geralmente com amostra e laudos de conformidade.',
    exemplos: ['mobiliário escolar', 'cadeiras e mesas de escritório', 'armários e estantes', 'móveis planejados'],
  },
  {
    slug: 'material-de-escritorio',
    nome: 'Material de escritório',
    de: 'material de escritório',
    termos: ['material de expediente', 'material de escritório', 'material escolar', 'papel a4'],
    resumo: 'Material de expediente, escritório e escolar é uma das compras mais comuns do setor público e uma ótima porta de entrada para quem está começando.',
    exemplos: ['papel A4 e envelopes', 'canetas, pastas e grampeadores', 'kits de material escolar', 'toner e cartuchos'],
  },
  {
    slug: 'veiculos',
    nome: 'Veículos',
    de: 'veículos',
    termos: ['veículos', 'veículo', 'locação de veículos', 'ambulância'],
    resumo: 'Compra e locação de veículos, ambulâncias, ônibus escolares e máquinas aparecem em todas as esferas, muitas com recursos de convênios.',
    exemplos: ['aquisição de veículos', 'locação de veículos com ou sem motorista', 'ambulâncias', 'ônibus escolar'],
  },
  {
    slug: 'pecas-e-manutencao-de-veiculos',
    nome: 'Peças e manutenção de veículos',
    de: 'peças e manutenção de veículos',
    termos: ['peças automotivas', 'manutenção de veículos', 'manutenção da frota', 'pneus'],
    resumo: 'A manutenção da frota pública gera compras de peças, pneus e serviços mecânicos, muitas vezes por percentual de desconto sobre tabela.',
    exemplos: ['peças e acessórios', 'pneus e câmaras', 'serviços de mecânica', 'manutenção de máquinas pesadas'],
  },
  {
    slug: 'combustivel',
    nome: 'Combustível',
    de: 'combustível',
    termos: ['combustível', 'combustíveis', 'óleo diesel', 'gasolina'],
    resumo: 'Combustível para a frota de prefeituras, secretarias e consórcios é comprado continuamente, em geral com entrega em posto credenciado no município.',
    exemplos: ['gasolina e etanol', 'óleo diesel', 'lubrificantes', 'gás de cozinha (GLP)'],
  },
  {
    slug: 'uniformes-e-epi',
    nome: 'Uniformes e EPI',
    de: 'uniformes e EPI',
    termos: ['uniformes', 'fardamento', 'equipamentos de proteção individual', 'epi'],
    resumo: 'Uniformes escolares, fardamentos e equipamentos de proteção individual são compras frequentes de prefeituras, secretarias e forças de segurança.',
    exemplos: ['uniforme escolar', 'fardamento de servidores', 'EPI: botas, luvas e capacetes', 'jalecos e roupas hospitalares'],
  },
  {
    slug: 'transporte',
    nome: 'Transporte',
    de: 'transporte',
    termos: ['transporte escolar', 'transporte de passageiros', 'fretamento'],
    resumo: 'Transporte escolar e de passageiros é contratado por rotas, com exigência de veículos vistoriados e motoristas habilitados.',
    exemplos: ['transporte escolar por rota', 'fretamento de ônibus', 'transporte de pacientes', 'transporte de cargas'],
  },
  {
    slug: 'eventos',
    nome: 'Eventos',
    de: 'eventos',
    termos: ['eventos', 'estrutura para eventos', 'sonorização', 'palco'],
    resumo: 'Festas tradicionais, aniversário de cidades e eventos oficiais geram contratos de palco, som, iluminação, tendas e banheiros químicos.',
    exemplos: ['palco, som e iluminação', 'tendas e grades', 'banheiros químicos', 'organização de eventos'],
  },
  {
    slug: 'grafica-e-comunicacao',
    nome: 'Gráfica e comunicação',
    de: 'serviços gráficos',
    termos: ['serviços gráficos', 'material gráfico', 'impressos', 'publicidade'],
    resumo: 'Impressos, banners, placas e campanhas de comunicação são contratados por órgãos de todas as esferas, muitas vezes por item.',
    exemplos: ['impressos e formulários', 'banners e adesivos', 'placas de sinalização', 'campanhas de publicidade'],
  },
  {
    slug: 'agua-e-saneamento',
    nome: 'Água e saneamento',
    de: 'água e saneamento',
    termos: ['saneamento', 'abastecimento de água', 'esgotamento sanitário', 'poços'],
    resumo: 'Obras e materiais de saneamento, redes de água e esgoto e perfuração de poços aparecem em prefeituras, companhias estaduais e consórcios.',
    exemplos: ['redes de água e esgoto', 'perfuração de poços', 'tratamento de água', 'tubos e conexões de PVC'],
  },
]

export function ramoDoSlug(slug: string): RamoPublico | null {
  return RAMOS_PUBLICOS.find((r) => r.slug === slug) ?? null
}

export function slugDoEstado(estado: Estado): string {
  return estado.nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
}

export function estadoDoSlug(slug: string): Estado | null {
  return ESTADOS.find((e) => slugDoEstado(e) === slug) ?? null
}

export function caminhoDoRamo(ramo: RamoPublico, estado?: Estado | null): string {
  return estado ? `/licitacoes/${ramo.slug}/${slugDoEstado(estado)}` : `/licitacoes/${ramo.slug}`
}
