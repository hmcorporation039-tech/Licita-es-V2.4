export interface ModeloDeItem {
  id: string
  nome: string
  descricao: string
  palavrasChave: string[]
  palavrasDeExclusao: string[]
}

export const MODELOS_DE_ITEM: ModeloDeItem[] = [
  {
    id: 'aeroportos',
    nome: 'Aeroportos',
    descricao: 'Obras, serviços e equipamentos de aeroportos, aeródromos e helipontos.',
    palavrasChave: [
      'aeroporto',
      'aeroportuário',
      'aeroportuária',
      'aeródromo',
      'heliponto',
      'heliporto',
      'pista de pouso',
      'pista de decolagem',
      'pista de taxiamento',
      'pátio de aeronaves',
      'lado ar',
      'balizamento noturno',
      'balizamento luminoso',
      'sinalização aeroportuária',
      'PAPI',
      'SESCINC',
      'contraincêndio aeroportuário',
      'raio-x de bagagem',
      'inspeção de bagagem',
      'ponte de embarque',
      'esteira de bagagem',
      'rebocador de aeronave',
      'operador de aeródromo',
      'cerca operacional',
      'terminal de passageiros aeroportuário',
    ],
    palavrasDeExclusao: [
      'passagem aérea',
      'agenciamento de viagem',
      'agência de viagem',
      'traslado',
      'transfer',
      'bairro aeroporto',
      'jardim aeroporto',
      'vila aeroporto',
      'setor aeroporto',
      'conjunto aeroporto',
      'avenida aeroporto',
      'rua aeroporto',
      'transporte rodoviário',
      'transporte terrestre',
      'regularização fundiária',
      'reurb',
    ],
  },
]
