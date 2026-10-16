# Design system — Monitor de Licitações

Direção atual (16/10/2026): **azul vibrante**, a mesma identidade da página de entrada, aplicada à área logada sem perder a densidade de ferramenta profissional. Substituiu o azul-tinta com neutros quentes de 13/10/2026 (referências antigas em [`REFERENCIAS_DESIGN_2026-10-13.md`](REFERENCIAS_DESIGN_2026-10-13.md)). Os **nomes** dos tokens não mudaram: toda tela que usa `bg-accent`, `text-muted` etc. já herda o azul.

## Tokens (`web/src/app/globals.css`)

| Uso | Classe Tailwind | Valor |
|---|---|---|
| Fundo da página (neutro frio, levemente azulado) | `bg-canvas` | `#F2F6FC` |
| Superfície (painel, tabela, input, **folha da prévia de documentos**) | `bg-surface` | `#FFFFFF` (não mudar: a folha precisa ficar branca) |
| Superfície rebaixada (linha zebrada, campo desabilitado) | `bg-sunken` | `#F7F9FD` |
| Borda padrão / suave / forte | `border-line` / `border-line-soft` / `border-line-strong` | `#DFE6F1` / `#EBF0F7` / `#BFCBDD` |
| Texto principal / secundário forte | `text-ink` / `text-ink-2` | `#0B1F44` / `#2A3B5C` |
| Texto secundário / terciário | `text-muted` / `text-faint` | `#51617F` (6,2:1 no branco) / `#5F6E89` (5,1:1 no branco, 4,7:1 no canvas) |
| Destaque | `bg-accent`, `text-accent`, `bg-accent-soft`, `border-accent-line`, `hover:bg-accent-hover` | `#0A4FD6` (6,8:1 com branco) / hover `#0843B8` / suave `#E8F0FF` / linha `#A8C3F4` |
| Risco / atenção / ok | `danger`, `warn`, `ok` (+ `-soft`, `-line`) | `#B42318` / `#A15C07` / `#1E6B3A`, todos ≥ 4,8:1 sobre o próprio `-soft` |
| Cores extras dos cartões de KPI | `ceu`, `violeta` (+ `-soft`) | `#0369A1` / `#6D3FD1` (≥ 5,2:1 sobre o `-soft`) |
| Menu lateral e topo do celular | `bg-nav`, `bg-nav-2`, `text-nav-ink`, `text-nav-muted`, `text-nav-suave` | `#063AA8` / `#0843B8` / `#FFFFFF` / `#CFE0FF` (≥ 5:1 no azul) / `#9FD3FF` (só decorativo) |
| Sombras | `shadow-cartao`, `shadow-cartao-alto`, `shadow-botao` | sombra azulada suave (painel/tabela), elevada (diálogo, folha, hover de KPI), botão primário |
| Raio padrão | `rounded` | 8 px (`--radius`) |
| Faixa escura (landing v2, sem uso desde a página azul) | `bg-noite`, `bg-noite-2`, `border-noite-line`, `text-noite-ink`, `text-noite-muted`, `text-noite-accent` + classe `.faixa-noite` | `#0E1B2E` / `#14253D` / `#26395A` / `#EEF2F7` / `#A9B8CB` / `#9CBCE3` |

Escala de texto (densa): `text-2xs` 11 · `text-xs` 12 · **`text-sm` 13 (padrão de tela)** · `text-base` 14 · `text-lg` 16 · `text-xl` 20 · `text-2xl` 24 (título de página no celular) · `text-3xl` 32 · `text-4xl` 40.

As escalas `indigo-*` e `slate-*` foram sobrescritas para o azul vibrante e o neutro frio, como rede de segurança. **Código novo usa os tokens semânticos**, nunca `indigo-*`/`slate-*`/`gray-*`/`blue-*`/`red-*`/`amber-*`/`emerald-*` direto.

### Tipografia

- **Nunito** (`font-display`, carregada no `app/layout.tsx` raiz) em `h1`/`h2`/`h3` (regra global em `@layer base`), na marca, nos valores dos KPIs e nos títulos de estado vazio e de diálogo. É o que liga a área logada à página de entrada.
- **IBM Plex Sans** continua no corpo, formulários e tabelas: é mais estreita e tem `1`/`l`/`I` distintos e algarismos tabulares, o que mantém as tabelas densas (13 px) legíveis e alinhadas. A Nunito, arredondada e mais larga, custaria cerca de 10 % de largura por coluna e fica menos nítida a 13 px.
- **IBM Plex Mono** continua em números, datas, CNPJ, nº de processo e valores em tabela.

## Página de entrada (estilo B · azul vibrante, 16/10/2026)

A página pública `/` (`web/src/app/(entrada)/`) tem identidade própria e **não** usa os tokens acima. Tudo fica isolado no grupo de rotas `(entrada)`: fonte Nunito variável (`fonts/nunito-latin-variable.woff2`, carregada só no `layout.tsx` desse grupo) e as classes `az-*` de `entrada.css`, todas sob `.entrada-azul`. A área logada usa o mesmo azul (`#0A4FD6`) e a Nunito nos títulos, via tokens semânticos.

| Uso | Valor |
|---|---|
| Azul principal / claro / fundo / noite | `#0A4FD6` / `#2469F0` / `#063AA8` / `#052C82` |
| Azul suave (só texto grande sobre azul) | `#9FD3FF` |
| Papel / tinta / tinta secundária / linha | `#F4F8FF` / `#0B1F44` / `#51617F` / `#DBE6F7` |
| Verde dos botões (texto `#04220F`, não branco: branco no verde não passa AA) | `#18C25A` |

Regras: títulos misturam Nunito 300 e 900; botões em pílula (`az-pilula` + `-verde`, `-branca`, `-vazada`, `-azul`, `-contorno`); cartões brancos com raio 24 px sobre o papel; telas do produto sempre com o selo "Exemplo ilustrativo". Logotipos das fontes ficam em `web/public/fontes/`, baixados só dos sites oficiais e exibidos em branco monocromático.

## Componentes (`web/src/components/ui`, importar de `@/components/ui`)

| Componente | Quando usar |
|---|---|
| `PageHeader` | Topo de toda tela logada: `title`, `description`, `actions`, `back` (link de volta) |
| `Panel` | Bloco com borda e título opcional (`title`, `description`, `actions`, `padding="none"` para tabela dentro) |
| `MetricRow` + `Metric` | KPIs em cartões separados: faixa colorida no topo, número em Nunito 28 px, rótulo 12 px. `icon` (lucide) num quadrado tingido; `color` = `accent` · `ceu` · `violeta` · `ok` · `warn` · `danger` (padrão: `accent`, ou a cor do `tone`) |
| `Button` / `LinkButton` | `variant`: `primary` (uma ação principal por área), `secondary`, `ghost`, `danger`; `size`: `sm`/`md`; `icon` = ícone do lucide; `loading` |
| `TextLink` | Link dentro de texto |
| `Field` + `Input` / `Select` / `Textarea` | Todo campo de formulário. `Field` gera `id`/`htmlFor`/`aria-describedby` sozinho; `hint`, `error`, `required` |
| `Checkbox` | Caixa com rótulo (`label`, `hint`) |
| `FormError` | Erro geral do formulário (`role=alert`) |
| `StatusTag` | Selo em pílula. Situação/estado: `tone` = `neutral` · `accent` · `ok` · `warn` · `danger`; `dot`; `mono` (para fonte/código). **Único mapa de cores de status do sistema** |
| `StatusDot` | Estado em linha de texto (ponto + rótulo) |
| `Prazo` | Qualquer prazo/data-limite: calcula "em 20 h" / "em 3 dias" / "Encerrado" e a cor (≤48 h danger, ≤7 d warn, depois neutro), com a data em mono |
| `Tabs` + `useAbaNaUrl` | Abas dentro da página, com `?aba=` na URL (recarregar não perde a aba) e teclado (setas, Home/End) |
| `TabLinks` | Abas que são rotas (admin) |
| `TableWrap` + `Table`/`THead`/`Th`/`Tr`/`Td` | Toda tabela (cartão com sombra, cabeçalho azul-claro em caixa alta, linhas zebradas e realce azul no hover). `TableWrap minWidth={…}` rola na horizontal no celular sem estourar a página; `Td numeric` = mono à direita; `Tr interactive`/`selected` |
| `DescriptionList` | Pares rótulo/valor (dados da licitação, da empresa) |
| `EmptyState` | Lista vazia: ícone num círculo branco (`icon`, padrão `Sparkles`), frase do porquê + uma ação, fundo azul bem claro com borda tracejada |
| `Notice` | Aviso inline (`tone` = `info`/`ok`/`warn`/`danger`) |
| `ErrorState` | Falha de carregamento com "Tentar de novo" |
| `Carregando` / `Skeleton` | Carregamento (em vez de "Carregando..." solto) |
| `useDialogo()` | Substitui `confirm()`/`alert()`: `const { confirmar, avisar, dialogo } = useDialogo()`; `if (!(await confirmar({ titulo, mensagem, confirmarRotulo: 'Excluir', perigo: true }))) return`; renderizar `{dialogo}` no JSX |
| `cx` | Juntar classes condicionais |

Moldura: `AppShell` (menu lateral azul com a marca "**Monitor** de Licitações", item ativo em pílula branca, cartão "Falar com a Bela" com o avatar redondo e o medidor/usuário num cartão branco no rodapé; no celular, barra azul com o botão da Bela e o menu em gaveta; já aplicado pelo `app/(app)/layout.tsx`, que entrega o `<main>` com largura máxima e `gap-6` entre filhos) e `PublicFrame` (`app/(public)/layout.tsx`). Nas páginas públicas: `PublicCard` (formulário centrado de 420 px) e `PublicProse` (texto legal de 720 px).

## Regras

1. **Um elemento colorido por linha de tabela.** A cor vai no texto/ícone ou numa `StatusTag`; nunca no fundo da linha (exceto `selected`; a zebra neutra e o realce do hover já vêm do `Table`).
2. **"OK" não tem cor.** Estado normal fica neutro; só o que pede ação ganha `warn`/`danger`.
3. **Números, datas, CNPJ, nº de processo, valores em R$: `font-mono`**, alinhados à direita em tabela (`Td numeric`). Exceção: o número grande do `Metric`, em Nunito com algarismos tabulares.
4. **Raio**: `rounded`/`rounded-lg` (8 px) em botão e campo; `rounded-xl` (12 px) em painel, tabela e cartão; `rounded-2xl` em diálogo; `rounded-full` só em selo (`StatusTag`), contador de aba e avatar.
5. **Sombra só nas superfícies** (`shadow-cartao` em painel/tabela/KPI, `shadow-cartao-alto` em diálogo e folha). Gradiente só no menu lateral (azul para azul-escuro). Sem emoji, sem glifo Unicode como ícone (`←`, `✓`, `★`, `⚠`): usar `lucide-react` em 14–18 px. Ícone em quadrado/círculo tingido só no KPI e no estado vazio. A Bela aparece sempre com o avatar redondo (`AvatarDaBela`, `web/public/bela/bela-640.webp`).
6. **Hierarquia por tipografia**: título de página Nunito `text-2xl`/28 px extrabold, título de painel Nunito `text-base font-bold`, rótulo de campo `text-xs font-semibold text-ink-2`, conteúdo `text-sm`.
7. **Acessibilidade**: todo controle com `<label>` associado (via `Field`), botão de ícone com `aria-label`, `role`/`aria-selected` nas abas, foco visível (já global; campos ganham também um halo azul `ring-4 ring-accent/15`).
8. **Estados**: toda tela que busca dados tem carregando (`Carregando`), erro (`ErrorState`, com `.catch`) e vazio (`EmptyState`).
9. **Celular (375 px)**: nada estoura a largura; tabela dentro de `TableWrap`; grade de formulário vira uma coluna; ações quebram linha.
10. **Zero comentários** no código.
