# Design system — Monitor de Licitações

Direção aprovada em 13/10/2026: **azul-tinta**, IBM Plex, neutros quentes, densidade de ferramenta profissional. Referências e motivos em [`REFERENCIAS_DESIGN_2026-10-13.md`](REFERENCIAS_DESIGN_2026-10-13.md).

## Tokens (`web/src/app/globals.css`)

| Uso | Classe Tailwind | Valor |
|---|---|---|
| Fundo da página | `bg-canvas` | `#F7F6F2` |
| Superfície (painel, tabela, input) | `bg-surface` | `#FFFFFF` |
| Superfície rebaixada (cabeçalho de tabela, sidebar) | `bg-sunken` | `#FBFAF7` |
| Borda padrão / suave / forte | `border-line` / `border-line-soft` / `border-line-strong` | `#E4E2DC` / `#EEECE6` / `#D3D0C7` |
| Texto principal / secundário forte | `text-ink` / `text-ink-2` | `#1A1C1F` / `#3D4046` |
| Texto secundário / terciário | `text-muted` / `text-faint` | `#5B5F66` / `#74777D` (os dois passam AA no branco) |
| Destaque | `bg-accent`, `text-accent`, `bg-accent-soft`, `border-accent-line`, `hover:bg-accent-hover` | `#1F3A5F` |
| Risco / atenção / ok | `danger`, `warn`, `ok` (+ `-soft`, `-line`) | `#B42318` / `#A15C07` / `#1E6B3A` |

Escala de texto (redefinida, mais densa): `text-2xs` 11 · `text-xs` 12 · **`text-sm` 13 (padrão de tela)** · `text-base` 14 (corpo de texto corrido) · `text-lg` 16 · `text-xl` 20 · `text-2xl` 24 (título de página) · `text-3xl` 32 · `text-4xl` 40 (só na landing).

As escalas `indigo-*` e `slate-*` foram sobrescritas para o azul-tinta e o neutro quente, como rede de segurança. **Código novo usa os tokens semânticos**, nunca `indigo-*`/`slate-*`/`gray-*`/`blue-*`/`red-*`/`amber-*`/`emerald-*` direto.

## Componentes (`web/src/components/ui`, importar de `@/components/ui`)

| Componente | Quando usar |
|---|---|
| `PageHeader` | Topo de toda tela logada: `title`, `description`, `actions`, `back` (link de volta) |
| `Panel` | Bloco com borda e título opcional (`title`, `description`, `actions`, `padding="none"` para tabela dentro) |
| `MetricRow` + `Metric` | KPIs: número em mono 24 px, rótulo 12 px. Nunca em cards coloridos |
| `Button` / `LinkButton` | `variant`: `primary` (uma ação principal por área), `secondary`, `ghost`, `danger`; `size`: `sm`/`md`; `icon` = ícone do lucide; `loading` |
| `TextLink` | Link dentro de texto |
| `Field` + `Input` / `Select` / `Textarea` | Todo campo de formulário. `Field` gera `id`/`htmlFor`/`aria-describedby` sozinho; `hint`, `error`, `required` |
| `Checkbox` | Caixa com rótulo (`label`, `hint`) |
| `FormError` | Erro geral do formulário (`role=alert`) |
| `StatusTag` | Situação/estado: `tone` = `neutral` · `accent` · `ok` · `warn` · `danger`; `dot`; `mono` (para fonte/código). **Único mapa de cores de status do sistema** |
| `StatusDot` | Estado em linha de texto (ponto + rótulo) |
| `Prazo` | Qualquer prazo/data-limite: calcula "em 20 h" / "em 3 dias" / "Encerrado" e a cor (≤48 h danger, ≤7 d warn, depois neutro), com a data em mono |
| `Tabs` + `useAbaNaUrl` | Abas dentro da página, com `?aba=` na URL (recarregar não perde a aba) e teclado (setas, Home/End) |
| `TabLinks` | Abas que são rotas (admin) |
| `TableWrap` + `Table`/`THead`/`Th`/`Tr`/`Td` | Toda tabela. `TableWrap minWidth={…}` rola na horizontal no celular sem estourar a página; `Td numeric` = mono à direita; `Tr interactive`/`selected` |
| `DescriptionList` | Pares rótulo/valor (dados da licitação, da empresa) |
| `EmptyState` | Lista vazia: frase do porquê + uma ação. Sem ilustração |
| `Notice` | Aviso inline (`tone` = `info`/`ok`/`warn`/`danger`) |
| `ErrorState` | Falha de carregamento com "Tentar de novo" |
| `Carregando` / `Skeleton` | Carregamento (em vez de "Carregando..." solto) |
| `useDialogo()` | Substitui `confirm()`/`alert()`: `const { confirmar, avisar, dialogo } = useDialogo()`; `if (!(await confirmar({ titulo, mensagem, confirmarRotulo: 'Excluir', perigo: true }))) return`; renderizar `{dialogo}` no JSX |
| `cx` | Juntar classes condicionais |

Moldura: `AppShell` (sidebar, já aplicado pelo `app/(app)/layout.tsx`, que entrega o `<main>` com largura máxima e `gap-6` entre filhos) e `PublicFrame` (`app/(public)/layout.tsx`). Nas páginas públicas: `PublicCard` (formulário centrado de 420 px) e `PublicProse` (texto legal de 720 px).

## Regras

1. **Um elemento colorido por linha de tabela.** A cor vai no texto/ícone ou numa `StatusTag`; nunca no fundo da linha (exceto `selected`).
2. **"OK" não tem cor.** Estado normal fica neutro; só o que pede ação ganha `warn`/`danger`.
3. **Números, datas, CNPJ, nº de processo, valores em R$: `font-mono`**, alinhados à direita em tabela (`Td numeric`).
4. **Raio**: `rounded` (4 px) em tudo; `rounded-sm` (2 px) em tag. Nada de `rounded-full` em botão ou card, nem `rounded-lg`/`xl`.
5. **Sem sombra, sem gradiente**, sem emoji, sem glifo Unicode como ícone (`←`, `✓`, `★`, `⚠`): usar `lucide-react` em 14–16 px, traço 1.75–2, inline com o texto, **nunca dentro de círculo colorido**.
6. **Hierarquia por tipografia**: título de página `text-2xl font-semibold`, título de painel `text-sm font-semibold`, rótulo `text-xs font-medium text-muted`, conteúdo `text-sm`.
7. **Acessibilidade**: todo controle com `<label>` associado (via `Field`), botão de ícone com `aria-label`, `role`/`aria-selected` nas abas, foco visível (já global).
8. **Estados**: toda tela que busca dados tem carregando (`Carregando`), erro (`ErrorState`, com `.catch`) e vazio (`EmptyState`).
9. **Celular (375 px)**: nada estoura a largura; tabela dentro de `TableWrap`; grade de formulário vira uma coluna; ações quebram linha.
10. **Zero comentários** no código.
