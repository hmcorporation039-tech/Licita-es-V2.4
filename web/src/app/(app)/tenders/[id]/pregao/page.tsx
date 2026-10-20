"use client";

import {
  use,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  Calculator,
  Check,
  FileSignature,
  Gavel,
  Mic,
  RotateCcw,
  Save,
  Square,
  Undo2,
} from "lucide-react";
import { useRequireSession } from "@/hooks/useRequireSession";
import { useEscuta, useFalaDaBela } from "@/hooks/useBela";
import { api, ApiRequestError } from "@/lib/api";
import { formatarData } from "@/lib/datas";
import type {
  AlvoDoPregao,
  AvaliacaoDoLance,
  BaseDoValorFinal,
  ConfigDoPregao,
  CriterioDoPregao,
  FaixaDoLance,
  LanceDoPregao,
  PainelDoPregao,
  PedidoDaBela,
  ResultadoDoPregao,
} from "@/lib/types";
import {
  Button,
  Carregando,
  Checkbox,
  cx,
  ErrorState,
  Field,
  FormError,
  Input,
  LinkButton,
  Notice,
  PageHeader,
  Panel,
  Select,
  StatusTag,
  TextLink,
} from "@/components/ui";
import { AvatarDaBela } from "@/components/Bela";
import {
  TEXTO_DA_BASE,
  acimaDoQueCostumaVencer,
  referenciaParaOPregao,
  textoDaReferencia,
  type PrecosVencedoresResposta,
  type ReferenciaDoPregao,
} from "@/lib/precosVencedores";
import { ChecklistDaDisputa, PlanoDoValorFinal } from "@/components/PlanoDeDisputa";

const ALVO_GLOBAL = "global";
const MAXIMO_DE_ALVOS_EM_BOTOES = 5;

type Acao =
  | "melhor"
  | "meu"
  | "desfazer"
  | "config"
  | "resultado"
  | "interpretar"
  | "plano";

const ROTULO_DO_RESULTADO: Record<ResultadoDoPregao, string> = {
  GANHOU: "Ganhou",
  PERDEU: "Perdeu",
  DESCLASSIFICADO: "Desclassificado",
  FRACASSADO: "Fracassado",
};

const TOM_DO_RESULTADO: Record<
  ResultadoDoPregao,
  "ok" | "info" | "danger" | "warn"
> = {
  GANHOU: "ok",
  PERDEU: "info",
  DESCLASSIFICADO: "danger",
  FRACASSADO: "warn",
};

const ESTILO_DA_FAIXA: Record<
  FaixaDoLance,
  { caixa: string; texto: string; rotulo: string }
> = {
  verde: {
    caixa: "border-ok-line bg-ok-soft",
    texto: "text-ok",
    rotulo: "Margem dentro do desejado",
  },
  amarela: {
    caixa: "border-warn-line bg-warn-soft",
    texto: "text-warn",
    rotulo: "Abaixo da margem desejada, ainda com lucro",
  },
  vermelha: {
    caixa: "border-danger-line bg-danger-soft",
    texto: "text-danger",
    rotulo: "Prejuízo: não cubra",
  },
};

function brl(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pct(valor: number): string {
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function horario(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function lerValorDigitado(bruto: string): number | null {
  const s = bruto.replace(/r\$/i, "").replace(/\s/g, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;
  let normal: string;
  if (s.includes(",")) {
    normal = s.replace(/\./g, "").replace(",", ".");
  } else {
    const partes = s.split(".");
    normal =
      partes.length > 2 || (partes.length === 2 && partes[1].length === 3)
        ? s.replace(/\./g, "")
        : s;
  }
  const n = Number(normal);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function paraCampo(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function rotuloCurto(alvo: AlvoDoPregao): string {
  if (alvo.id === ALVO_GLOBAL) return "Valor global";
  return `Item ${alvo.numero ?? "?"}`;
}

function baseDoValor(alvo: AlvoDoPregao, criterio: CriterioDoPregao): string {
  if (alvo.id === ALVO_GLOBAL) return "total da proposta, todos os itens";
  const quantidade = alvo.quantidade.toLocaleString("pt-BR");
  return criterio === "UNITARIO"
    ? `por unidade · ${quantidade} un`
    : `total do item · ${quantidade} un`;
}

function valorFinalSugerido(painel: PainelDoPregao): number | null {
  const meus = painel.lances.filter((l) => l.origem === "MEU_LANCE");
  const ultimo = meus[0];
  if (!ultimo) return null;
  if (ultimo.alvo === ALVO_GLOBAL) return ultimo.valor;
  const itens = painel.alvos.filter((a) => a.id !== ALVO_GLOBAL);
  let total = 0;
  for (const item of itens) {
    const lance = meus.find((l) => l.alvo === item.id);
    if (!lance) return null;
    total +=
      painel.config.criterio === "UNITARIO"
        ? lance.valor * item.quantidade
        : lance.valor;
  }
  return Math.round(total * 100) / 100;
}

function mensagemDeErro(e: unknown, padrao: string): string {
  return e instanceof ApiRequestError ? e.message : padrao;
}

function SeletorDeAlvo({
  alvos,
  valor,
  onChange,
  desabilitado,
}: {
  alvos: AlvoDoPregao[];
  valor: string;
  onChange: (id: string) => void;
  desabilitado: boolean;
}) {
  if (alvos.length <= 1) return null;
  if (alvos.length > MAXIMO_DE_ALVOS_EM_BOTOES) {
    return (
      <Field label="Lance de">
        <Select
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          disabled={desabilitado}
          className="h-11! sm:h-10!"
        >
          {alvos.map((a) => (
            <option key={a.id} value={a.id}>
              {a.id === ALVO_GLOBAL ? "Valor global" : a.rotulo}
            </option>
          ))}
        </Select>
      </Field>
    );
  }
  return (
    <div role="group" aria-label="Lance de" className="flex flex-wrap gap-1.5">
      {alvos.map((a) => {
        const ativo = a.id === valor;
        return (
          <button
            key={a.id}
            type="button"
            aria-pressed={ativo}
            title={a.rotulo}
            disabled={desabilitado}
            onClick={() => onChange(a.id)}
            className={cx(
              "inline-flex min-h-11 items-center rounded border px-3 text-sm transition-colors disabled:opacity-50 sm:min-h-9",
              ativo
                ? "border-accent bg-accent-soft font-semibold text-accent"
                : "border-line-strong bg-surface text-ink-2 hover:bg-sunken",
            )}
          >
            {rotuloCurto(a)}
          </button>
        );
      })}
    </div>
  );
}

function Indicador({
  rotulo,
  valor,
  detalhe,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 bg-surface px-3 py-2.5">
      <dt className="text-xs font-medium text-muted">{rotulo}</dt>
      <dd className="break-words font-mono text-base font-medium text-ink sm:text-lg">
        {valor}
      </dd>
      {detalhe && <dd className="text-2xs text-muted">{detalhe}</dd>}
    </div>
  );
}

function ReferenciaDosVencedores({
  alvo,
  criterio,
  referencia,
}: {
  alvo: AlvoDoPregao;
  criterio: CriterioDoPregao;
  referencia: ReferenciaDoPregao;
}) {
  const acima = acimaDoQueCostumaVencer(alvo, criterio, referencia);
  return (
    <p className="text-xs text-muted" title={TEXTO_DA_BASE}>
      {textoDaReferencia(referencia)}
      {acima && (
        <span className="text-ink-2"> · seu preço proposto está acima do que costuma vencer</span>
      )}
    </p>
  );
}

function ResumoDoAlvo({
  alvo,
  painel,
  referencia,
}: {
  alvo: AlvoDoPregao;
  painel: PainelDoPregao;
  referencia: ReferenciaDoPregao | null;
}) {
  const propostoAbaixoDoMinimo =
    alvo.precoProposto !== null &&
    alvo.minimoComMargem !== null &&
    alvo.precoProposto < alvo.minimoComMargem;
  const propostoComPrejuizo =
    alvo.precoProposto !== null &&
    alvo.equilibrio !== null &&
    alvo.precoProposto < alvo.equilibrio;
  return (
    <div className="flex flex-col gap-2">
      {propostoAbaixoDoMinimo && (
        <Notice tone={propostoComPrejuizo ? "danger" : "warn"}>
          {propostoComPrejuizo
            ? `Seu preço proposto (${brl(alvo.precoProposto!)}) está abaixo do ponto de equilíbrio: nesse valor há prejuízo. Reveja o preço de venda no estudo de custos.`
            : `Seu preço proposto (${brl(alvo.precoProposto!)}) já está abaixo do mínimo para a margem desejada (${brl(alvo.minimoComMargem!)}). Não há espaço para lances com essa margem.`}
        </Notice>
      )}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded border border-line bg-line lg:grid-cols-4">
        <Indicador
          rotulo="Preço proposto"
          valor={alvo.precoProposto !== null ? brl(alvo.precoProposto) : "—"}
          detalhe={baseDoValor(alvo, painel.config.criterio)}
        />
        <Indicador
          rotulo="Mínimo com margem"
          valor={
            alvo.minimoComMargem !== null ? brl(alvo.minimoComMargem) : "—"
          }
          detalhe={`margem desejada ${pct(painel.margemDesejadaPct)}`}
        />
        <Indicador
          rotulo="Ponto de equilíbrio"
          valor={alvo.equilibrio !== null ? brl(alvo.equilibrio) : "—"}
          detalhe="lucro zero"
        />
        <Indicador
          rotulo="Meus lances"
          valor={
            <>
              {alvo.meusLances}
              <span className="text-muted">/{painel.config.maxLances}</span>
            </>
          }
          detalhe="dados / limite combinado"
        />
      </dl>
      {referencia && (
        <ReferenciaDosVencedores
          alvo={alvo}
          criterio={painel.config.criterio}
          referencia={referencia}
        />
      )}
    </div>
  );
}

function CartaoDaAvaliacao({
  avaliacao,
  semCustos,
  idDoEstudo,
  encerrado,
  meuLanceAnotado,
  enviando,
  onDeiSugestao,
  onDeiOutro,
}: {
  avaliacao: AvaliacaoDoLance;
  semCustos: boolean;
  idDoEstudo: string;
  encerrado: boolean;
  meuLanceAnotado: number | null;
  enviando: Acao | null;
  onDeiSugestao: (valor: number) => void;
  onDeiOutro: (valor: number) => Promise<boolean>;
}) {
  const [outroAberto, setOutroAberto] = useState(false);
  const [outro, setOutro] = useState("");
  const [erroDoOutro, setErroDoOutro] = useState<string | null>(null);
  const estilo = ESTILO_DA_FAIXA[avaliacao.faixa];
  const sugestao = avaliacao.sugestao;

  async function anotarOutro(e: FormEvent) {
    e.preventDefault();
    const valor = lerValorDigitado(outro);
    if (!valor) {
      setErroDoOutro("Digite o valor do seu lance, por exemplo 179.100,00.");
      return;
    }
    setErroDoOutro(null);
    if (await onDeiOutro(valor)) {
      setOutro("");
      setOutroAberto(false);
    }
  }

  return (
    <section
      aria-label="Avaliação do melhor lance"
      aria-live="polite"
      className={cx(
        "flex flex-col gap-4 rounded border p-4",
        semCustos ? "border-line bg-surface" : estilo.caixa,
      )}
    >
      {semCustos ? (
        <p className="text-sm text-ink-2">
          {avaliacao.mensagem}{" "}
          <TextLink href={`/escolhidas/${idDoEstudo}`}>
            Abrir estudo de custos
          </TextLink>
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className={cx("text-xs font-semibold", estilo.texto)}>
                {estilo.rotulo}
              </span>
              <span
                className={cx(
                  "font-mono text-4xl font-semibold tracking-tight",
                  estilo.texto,
                )}
              >
                {pct(avaliacao.margemPct)}
              </span>
              <span className="text-xs text-muted">margem neste lance</span>
            </div>
            <dl className="flex flex-wrap gap-x-6 gap-y-2">
              <div className="flex flex-col">
                <dt className="text-xs text-muted">
                  {meuLanceAnotado === null ? "Melhor lance" : "Meu lance"}
                </dt>
                <dd className="font-mono text-base font-medium text-ink">
                  {brl(avaliacao.valor)}
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-xs text-muted">
                  {avaliacao.lucro < 0 ? "Prejuízo" : "Lucro"}
                </dt>
                <dd
                  className={cx(
                    "font-mono text-base font-medium",
                    avaliacao.lucro < 0 ? "text-danger" : "text-ink",
                  )}
                >
                  {brl(Math.abs(avaliacao.lucro))}
                </dd>
              </div>
            </dl>
          </div>
          <p className="text-base text-ink">{avaliacao.mensagem}</p>
        </>
      )}

      {!encerrado && (
        <div className="flex flex-col gap-2">
          {sugestao && (
            <div className="flex flex-col gap-1.5">
              <Button
                variant="primary"
                icon={Check}
                loading={enviando === "meu"}
                disabled={enviando !== null}
                onClick={() => onDeiSugestao(sugestao.valor)}
                className="h-14! w-full text-base!"
              >
                Dei este lance:{" "}
                <span className="font-mono">{brl(sugestao.valor)}</span>
              </Button>
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                margem de{" "}
                <span className="font-mono text-ink-2">
                  {pct(sugestao.margemPct)}
                </span>
                {sugestao.ultimo && (
                  <StatusTag tone="warn">Último lance</StatusTag>
                )}
              </p>
            </div>
          )}
          {outroAberto ? (
            <form onSubmit={anotarOutro} className="flex flex-col gap-1.5">
              <div className="flex gap-2">
                <Input
                  autoFocus
                  inputMode="decimal"
                  aria-label="Valor do lance que você deu"
                  placeholder="Ex.: 179.100,00"
                  value={outro}
                  onChange={(e) => setOutro(e.target.value)}
                  className="h-11! min-w-0 flex-1 font-mono sm:h-10!"
                />
                <Button
                  type="submit"
                  loading={enviando === "meu"}
                  disabled={enviando !== null}
                  className="h-11! sm:h-10!"
                >
                  Anotar
                </Button>
              </div>
              <FormError className="text-xs">{erroDoOutro}</FormError>
            </form>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOutroAberto(true)}
              className="h-11! self-start sm:h-8!"
            >
              {sugestao ? "Dei outro valor" : "Anotar um lance que eu dei"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

function Historico({
  lances,
  encerrado,
  desfazendo,
  onDesfazer,
}: {
  lances: LanceDoPregao[];
  encerrado: boolean;
  desfazendo: boolean;
  onDesfazer: (id: string) => void;
}) {
  return (
    <Panel
      title="Histórico deste lance"
      description="Mais recente primeiro"
      padding="none"
    >
      {lances.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted">
          Nenhum lance registrado ainda.
        </p>
      ) : (
        <ol className="flex flex-col divide-y divide-line-soft">
          {lances.map((l, i) => (
            <li
              key={l.id}
              className="flex min-h-14 items-center gap-3 px-4 py-2"
            >
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                <StatusTag
                  tone={l.origem === "MEU_LANCE" ? "accent" : "neutral"}
                >
                  {l.origem === "MEU_LANCE" ? "Meu lance" : "Melhor lance"}
                </StatusTag>
                <span className="font-mono text-xs text-muted">
                  {horario(l.createdAt)}
                </span>
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <span className="font-mono text-sm font-medium text-ink">
                  {brl(l.valor)}
                </span>
                <span
                  className={cx(
                    "font-mono text-xs",
                    l.margemPct !== null && l.margemPct < 0
                      ? "text-danger"
                      : "text-muted",
                  )}
                >
                  {l.margemPct !== null ? `margem ${pct(l.margemPct)}` : "—"}
                </span>
              </div>
              {i === 0 && !encerrado && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Undo2}
                  loading={desfazendo}
                  disabled={desfazendo}
                  onClick={() => onDesfazer(l.id)}
                  className="h-11! w-11! px-0! sm:h-8! sm:w-auto! sm:px-2.5!"
                  aria-label={`Desfazer o registro de ${brl(l.valor)}`}
                >
                  <span className="hidden sm:inline">Desfazer</span>
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function CriterioDoLance({
  alvo,
  criterio,
  salvando,
  desabilitado,
  onMudar,
}: {
  alvo: AlvoDoPregao;
  criterio: CriterioDoPregao;
  salvando: boolean;
  desabilitado: boolean;
  onMudar: (criterio: CriterioDoPregao) => void;
}) {
  return (
    <div className="-mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <p className="min-w-0 break-words text-xs text-muted">{alvo.rotulo}</p>
      <Field
        label="O portal mostra o lance deste item"
        hint={`Quantidade: ${alvo.quantidade.toLocaleString("pt-BR")} un`}
      >
        <Select
          value={criterio}
          onChange={(e) => onMudar(e.target.value as CriterioDoPregao)}
          disabled={desabilitado || salvando}
          aria-label="Critério do lance por item"
          className="h-11! sm:h-10!"
        >
          <option value="UNITARIO">Por unidade (unitário)</option>
          <option value="TOTAL_DO_ITEM">Total do item (unitário × quantidade)</option>
        </Select>
      </Field>
    </div>
  );
}

function Configuracao({
  config,
  salvando,
  desabilitado,
  onSalvar,
}: {
  config: ConfigDoPregao;
  salvando: boolean;
  desabilitado: boolean;
  onSalvar: (c: {
    decrementoPct: number;
    maxLances: number;
    criterio: CriterioDoPregao;
  }) => void;
}) {
  const [decremento, setDecremento] = useState(
    String(config.decrementoPct).replace(".", ","),
  );
  const [maxLances, setMaxLances] = useState(String(config.maxLances));
  const [erro, setErro] = useState<string | null>(null);

  function salvar(e: FormEvent) {
    e.preventDefault();
    const decrementoPct = Number(decremento.replace(",", "."));
    const maximo = Number(maxLances);
    if (
      !Number.isFinite(decrementoPct) ||
      decrementoPct < 0.01 ||
      decrementoPct > 20
    ) {
      setErro("O decremento vai de 0,01% a 20%.");
      return;
    }
    if (!Number.isInteger(maximo) || maximo < 1 || maximo > 10) {
      setErro("O máximo de lances vai de 1 a 10.");
      return;
    }
    setErro(null);
    onSalvar({ decrementoPct, maxLances: maximo, criterio: config.criterio });
  }

  return (
    <details className="group rounded border border-line bg-surface">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
        Configurações do lance
        <span className="text-xs font-normal text-muted">
          <span className="font-mono">{pct(config.decrementoPct)}</span> · até{" "}
          <span className="font-mono">{config.maxLances}</span>{" "}
          {config.maxLances === 1 ? "lance" : "lances"}
        </span>
      </summary>
      <form
        onSubmit={salvar}
        className="flex flex-col gap-3 border-t border-line-soft px-4 py-4"
      >
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Decremento (%)"
            hint="Quanto abaixo do melhor lance cobrir"
          >
            <Input
              inputMode="decimal"
              value={decremento}
              onChange={(e) => setDecremento(e.target.value)}
              disabled={desabilitado}
              className="h-11! font-mono sm:h-10!"
            />
          </Field>
          <Field label="Máximo de lances" hint="Quantos lances você topa dar">
            <Input
              type="number"
              min={1}
              max={10}
              step={1}
              value={maxLances}
              onChange={(e) => setMaxLances(e.target.value)}
              disabled={desabilitado}
              className="h-11! font-mono sm:h-10!"
            />
          </Field>
        </div>
        <FormError className="text-xs">{erro}</FormError>
        <Button
          type="submit"
          icon={Save}
          loading={salvando}
          disabled={desabilitado || salvando}
          className="h-11! self-start sm:h-10!"
        >
          Salvar configurações
        </Button>
      </form>
    </details>
  );
}

function Encerramento({
  sugestaoDeValor,
  salvando,
  onEncerrar,
}: {
  sugestaoDeValor: number | null;
  salvando: boolean;
  onEncerrar: (resultado: ResultadoDoPregao, valorFinal: number | null) => void;
}) {
  const [resultado, setResultado] = useState<ResultadoDoPregao | "">("");
  const [valor, setValor] = useState(paraCampo(sugestaoDeValor));
  const [erro, setErro] = useState<string | null>(null);

  function encerrar(e: FormEvent) {
    e.preventDefault();
    if (!resultado) {
      setErro("Escolha o resultado do pregão.");
      return;
    }
    const valorFinal = valor.trim() ? lerValorDigitado(valor) : null;
    if (valor.trim() && !valorFinal) {
      setErro("Valor final inválido. Use, por exemplo, 179.100,00.");
      return;
    }
    setErro(null);
    onEncerrar(resultado, valorFinal);
  }

  return (
    <details className="rounded border border-line bg-surface">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <Gavel size={16} className="text-faint" aria-hidden />
        Encerrar pregão
      </summary>
      <form
        onSubmit={encerrar}
        className="flex flex-col gap-3 border-t border-line-soft px-4 py-4"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <Field label="Resultado">
            <Select
              value={resultado}
              onChange={(e) =>
                setResultado(e.target.value as ResultadoDoPregao | "")
              }
              className="h-11! sm:h-10!"
            >
              <option value="">Escolha…</option>
              {(Object.keys(ROTULO_DO_RESULTADO) as ResultadoDoPregao[]).map(
                (r) => (
                  <option key={r} value={r}>
                    {ROTULO_DO_RESULTADO[r]}
                  </option>
                ),
              )}
            </Select>
          </Field>
          <Field
            label="Valor final global (total)"
            hint="Total da proposta, não o preço unitário. Sugerido a partir dos seus últimos lances."
          >
            <Input
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="Ex.: 179.100,00"
              className="h-11! font-mono sm:h-10!"
            />
          </Field>
        </div>
        <FormError className="text-xs">{erro}</FormError>
        <Button
          type="submit"
          variant="primary"
          icon={Gavel}
          loading={salvando}
          disabled={salvando}
          className="h-11! self-start sm:h-10!"
        >
          Encerrar pregão
        </Button>
      </form>
    </details>
  );
}

export default function PregaoComABelaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const user = useRequireSession();
  const escuta = useEscuta();
  const fala = useFalaDaBela();

  const [painel, setPainel] = useState<PainelDoPregao | null>(null);
  const [erro, setErro] = useState<{ mensagem: string; status: number } | null>(
    null,
  );
  const [tentativa, setTentativa] = useState(0);
  const [alvoId, setAlvoId] = useState<string | null>(null);
  const [lanceDigitado, setLanceDigitado] = useState("");
  const [enviando, setEnviando] = useState<Acao | null>(null);
  const [erroDaAcao, setErroDaAcao] = useState<string | null>(null);
  const [avisoDaBela, setAvisoDaBela] = useState<string | null>(null);
  const [vencedores, setVencedores] = useState<PrecosVencedoresResposta | null>(
    null,
  );

  useEffect(() => {
    if (!user) return;
    let cancelado = false;
    setErro(null);
    api
      .get<PainelDoPregao>(`/api/tenders/${id}/pregao`)
      .then((p) => {
        if (!cancelado) setPainel(p);
      })
      .catch((e) => {
        if (cancelado) return;
        setErro(
          e instanceof ApiRequestError
            ? { mensagem: e.message, status: e.status }
            : {
                mensagem:
                  "Não foi possível abrir o pregão. Verifique a conexão e tente de novo.",
                status: 0,
              },
        );
      });
    return () => {
      cancelado = true;
    };
  }, [user, id, tentativa]);

  useEffect(() => {
    if (!user) return;
    let cancelado = false;
    api
      .get<PrecosVencedoresResposta>(`/api/estudos/${id}/precos-vencedores`)
      .then((r) => {
        if (!cancelado) setVencedores(r);
      })
      .catch(() => {
        if (!cancelado) setVencedores(null);
      });
    return () => {
      cancelado = true;
    };
  }, [user, id]);

  const voltar = { href: `/tenders/${id}`, label: "Licitação" };

  if (!user) return null;

  if (erro) {
    return (
      <>
        <PageHeader title="Pregão com a Bela" back={voltar} />
        {erro.status === 409 || erro.status === 404 ? (
          <Notice
            tone="warn"
            title="Pregão com a Bela indisponível"
            action={
              <LinkButton href={`/tenders/${id}`} size="sm" icon={ArrowLeft}>
                Abrir licitação
              </LinkButton>
            }
          >
            {erro.mensagem}
          </Notice>
        ) : (
          <ErrorState
            message={erro.mensagem}
            onRetry={() => setTentativa((n) => n + 1)}
          />
        )}
      </>
    );
  }

  if (!painel) {
    return (
      <>
        <PageHeader title="Pregão com a Bela" back={voltar} />
        <Carregando linhas={6} texto="Carregando o pregão…" />
      </>
    );
  }

  const painelAtual = painel;
  const alvosDosItens = painelAtual.alvos.filter((a) => a.id !== ALVO_GLOBAL);
  const alvoPadrao =
    alvosDosItens.length === 1 ? alvosDosItens[0] : painelAtual.alvos[0];
  const alvo =
    painelAtual.alvos.find((a) => a.id === alvoId) ?? alvoPadrao;
  const encerrado = Boolean(painelAtual.config.encerradoEm);
  const referenciaDosVencedores =
    alvo.id === ALVO_GLOBAL
      ? null
      : referenciaParaOPregao(
          vencedores?.itens.find((v) => v.itemId === alvo.id),
        );
  const lancesDoAlvo = painelAtual.lances.filter((l) => l.alvo === alvo.id);
  const meuLanceAnotado =
    lancesDoAlvo[0]?.origem === "MEU_LANCE" ? lancesDoAlvo[0].valor : null;
  const meuUltimoLance = painelAtual.lances.find(
    (l) => l.origem === "MEU_LANCE",
  );
  const ocupado = enviando !== null;

  async function executar(
    acao: Acao,
    requisicao: () => Promise<PainelDoPregao>,
  ): Promise<PainelDoPregao | null> {
    setEnviando(acao);
    setErroDaAcao(null);
    try {
      const novo = await requisicao();
      setPainel(novo);
      return novo;
    } catch (e) {
      setErroDaAcao(
        mensagemDeErro(e, "Não foi possível salvar agora. Tente de novo."),
      );
      return null;
    } finally {
      setEnviando(null);
    }
  }

  async function registrarMelhorLance(destino: string, valor: number) {
    setAvisoDaBela(null);
    const novo = await executar("melhor", () =>
      api.post<PainelDoPregao>(`/api/tenders/${id}/pregao/lances`, {
        alvo: destino,
        origem: "MELHOR_LANCE",
        valor,
      }),
    );
    if (!novo) return;
    setLanceDigitado("");
    const mensagem = novo.alvos.find((a) => a.id === destino)?.avaliacao
      ?.mensagem;
    if (mensagem) fala.dizer(mensagem);
  }

  async function registrarMeuLance(valor: number): Promise<boolean> {
    const novo = await executar("meu", () =>
      api.post<PainelDoPregao>(`/api/tenders/${id}/pregao/lances`, {
        alvo: alvo.id,
        origem: "MEU_LANCE",
        valor,
      }),
    );
    if (!novo) return false;
    fala.dizer(`Anotado: seu lance de ${brl(valor)}.`);
    return true;
  }

  async function interpretar(texto: string) {
    setAvisoDaBela(null);
    setErroDaAcao(null);
    setEnviando("interpretar");
    let pedido: PedidoDaBela;
    try {
      pedido = await api.post<PedidoDaBela>("/api/bela/interpretar", {
        texto: texto.slice(0, 500),
        contexto: "pregao",
      });
    } catch (e) {
      setErroDaAcao(
        mensagemDeErro(
          e,
          "Não consegui interpretar agora. Digite o valor do lance.",
        ),
      );
      return;
    } finally {
      setEnviando(null);
    }
    if (pedido.acao !== "lance") {
      setAvisoDaBela(pedido.resumo);
      fala.dizer(pedido.resumo);
      return;
    }
    let destino = alvo;
    if (pedido.item !== null && painelAtual.alvos.length > 1) {
      const doItem = painelAtual.alvos.find((a) => a.numero === pedido.item);
      if (!doItem) {
        const aviso = `Não achei o item ${pedido.item} neste pregão.`;
        setAvisoDaBela(aviso);
        fala.dizer(aviso);
        return;
      }
      destino = doItem;
    }
    setAlvoId(destino.id);
    await registrarMelhorLance(destino.id, pedido.valor);
  }

  function aoEnviarLance(e: FormEvent) {
    e.preventDefault();
    const texto = lanceDigitado.trim();
    if (!texto) return;
    const valor = lerValorDigitado(texto);
    if (valor) void registrarMelhorLance(alvo.id, valor);
    else void interpretar(texto);
  }

  async function aoTocarNoMicrofone() {
    const ouvido = await escuta.alternar();
    if (ouvido) await interpretar(ouvido);
  }

  async function desfazer(lanceId: string) {
    await executar("desfazer", () =>
      api.delete<PainelDoPregao>(`/api/tenders/${id}/pregao/lances/${lanceId}`),
    );
  }

  async function salvarConfig(config: {
    decrementoPct: number;
    maxLances: number;
    criterio: CriterioDoPregao;
  }) {
    await executar("config", () =>
      api.put<PainelDoPregao>(`/api/tenders/${id}/pregao/config`, config),
    );
  }

  async function salvarPlano(pedido: {
    base?: BaseDoValorFinal;
    cadastradoNoPortal?: boolean;
  }) {
    await executar("plano", () =>
      api.put<PainelDoPregao>(`/api/tenders/${id}/pregao/plano`, {
        alvo: alvo.id,
        ...pedido,
      }),
    );
  }

  function avisarCopia(destino: string) {
    void api
      .post(`/api/tenders/${id}/pregao/plano/copiado`, { alvo: destino })
      .catch(() => undefined);
  }

  async function encerrar(
    resultado: ResultadoDoPregao,
    valorFinal: number | null,
  ) {
    await executar("resultado", () =>
      api.put<PainelDoPregao>(`/api/tenders/${id}/pregao/resultado`, {
        resultado,
        valorFinal,
      }),
    );
  }

  async function reabrir() {
    await executar("resultado", () =>
      api.put<PainelDoPregao>(`/api/tenders/${id}/pregao/resultado`, {
        resultado: null,
      }),
    );
  }

  const { tender, config } = painelAtual;

  return (
    <>
      <PageHeader
        back={voltar}
        eyebrow={
          <span className="flex flex-wrap items-center gap-x-2">
            {tender.orgao ?? "Órgão n/d"}
            {tender.numeroControle && (
              <span className="break-all font-mono text-faint">
                {tender.numeroControle}
              </span>
            )}
          </span>
        }
        title={
          <span className="inline-flex items-center gap-3">
            <AvatarDaBela tamanho={44} className="ring-2 ring-accent-soft" />
            Pregão com a Bela
          </span>
        }
        description={
          <span className="line-clamp-3 max-w-[920px] break-words">
            {tender.objeto}
          </span>
        }
        actions={
          fala.disponivel && (
            <Checkbox
              label="Bela fala as respostas"
              checked={fala.ligada}
              onChange={(e) => fala.mudar(e.target.checked)}
              className="min-h-11 sm:min-h-0"
            />
          )
        }
      />

      <Notice tone="info">
        A Bela não dá lances: ela calcula e sugere. Você dá o lance no portal.
      </Notice>

      {painelAtual.disputa.vedacaoARobo && (
        <Notice
          tone="danger"
          title="O edital proíbe robô de lances — use só lances manuais"
        >
          A análise do edital achou a proibição de lances automatizados. Veja
          o trecho no checklist da disputa.
        </Notice>
      )}

      {painelAtual.semCustos && (
        <Notice
          tone="warn"
          title="Faltam os custos"
          action={
            <LinkButton href={`/escolhidas/${id}`} size="sm" icon={Calculator}>
              Abrir estudo de custos
            </LinkButton>
          }
        >
          Sem os custos preenchidos, a Bela não calcula margem, mínimo nem ponto
          de equilíbrio.
        </Notice>
      )}

      {encerrado && config.resultado && (
        <Notice
          tone={TOM_DO_RESULTADO[config.resultado]}
          title={`Pregão encerrado: ${ROTULO_DO_RESULTADO[config.resultado]}`}
          action={
            <Button
              size="sm"
              icon={RotateCcw}
              loading={enviando === "resultado"}
              disabled={ocupado}
              onClick={reabrir}
              className="h-11! sm:h-8!"
            >
              Reabrir
            </Button>
          }
        >
          {config.valorFinal !== null && (
            <>
              Valor final{" "}
              <span className="font-mono font-medium text-ink">
                {brl(config.valorFinal)}
              </span>
              {" · "}
            </>
          )}
          {config.encerradoEm && (
            <span className="font-mono">
              {formatarData(config.encerradoEm, { comHora: true })}
            </span>
          )}
          {config.resultado === "GANHOU" && (
            <div className="mt-3">
              <LinkButton
                href={`/tenders/${id}/documentos?tipo=proposta&readequada=1`}
                variant="primary"
                icon={FileSignature}
                className="h-11! sm:h-9!"
              >
                Gerar proposta readequada
              </LinkButton>
            </div>
          )}
        </Notice>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <SeletorDeAlvo
            alvos={painelAtual.alvos}
            valor={alvo.id}
            onChange={setAlvoId}
            desabilitado={ocupado}
          />
          {alvo.id !== ALVO_GLOBAL && (
            <CriterioDoLance
              alvo={alvo}
              criterio={config.criterio}
              salvando={enviando === "config"}
              desabilitado={encerrado || ocupado}
              onMudar={(criterio) =>
                void salvarConfig({
                  decrementoPct: config.decrementoPct,
                  maxLances: config.maxLances,
                  criterio,
                })
              }
            />
          )}

          <ResumoDoAlvo
            alvo={alvo}
            painel={painelAtual}
            referencia={referenciaDosVencedores}
          />

          <Panel
            title="Melhor lance agora"
            description={`Digite o valor que aparece no portal (${baseDoValor(alvo, config.criterio)}) ou fale com a Bela.`}
          >
            <form
              onSubmit={aoEnviarLance}
              className="flex flex-col gap-2 sm:flex-row"
            >
              <div className="flex min-w-0 flex-1 gap-2">
                <Input
                  inputMode="decimal"
                  enterKeyHint="send"
                  autoComplete="off"
                  aria-label={`Melhor lance agora: ${rotuloCurto(alvo)}`}
                  placeholder="Ex.: 180.000,50"
                  value={lanceDigitado}
                  onChange={(e) => setLanceDigitado(e.target.value)}
                  disabled={encerrado}
                  className="h-12! min-w-0 flex-1 font-mono text-lg!"
                />
                {escuta.disponivel && (
                  <Button
                    variant={escuta.ouvindo ? "danger" : "secondary"}
                    icon={escuta.ouvindo ? Square : Mic}
                    onClick={aoTocarNoMicrofone}
                    disabled={encerrado || (ocupado && !escuta.ouvindo)}
                    aria-pressed={escuta.ouvindo}
                    aria-label={
                      escuta.ouvindo ? "Parar de ouvir" : "Falar o lance"
                    }
                    className="h-12! w-12 px-0!"
                  />
                )}
              </div>
              <Button
                type="submit"
                variant="primary"
                loading={enviando === "melhor" || enviando === "interpretar"}
                disabled={encerrado || ocupado || !lanceDigitado.trim()}
                className="h-12! sm:px-5"
              >
                Registrar
              </Button>
            </form>
            <div className="mt-2 flex flex-col gap-1">
              {escuta.ouvindo ? (
                <p aria-live="polite" className="text-sm text-ink-2">
                  {escuta.parcial ||
                    "Ouvindo… diga, por exemplo, “o lance está em 180 mil”."}
                </p>
              ) : (
                <p className="text-xs text-muted">
                  {escuta.disponivel
                    ? "Fale “o lance está em 180 mil” ou “item 3 está em 450”."
                    : "Digite o valor e aperte Enter. Também vale “item 3 está em 450”."}
                </p>
              )}
              <FormError className="text-xs">{escuta.erro}</FormError>
              {avisoDaBela && (
                <p className="text-sm font-medium text-warn">{avisoDaBela}</p>
              )}
              <FormError className="text-xs">{erroDaAcao}</FormError>
            </div>
          </Panel>

          {alvo.avaliacao ? (
            <CartaoDaAvaliacao
              key={`${alvo.id}-${lancesDoAlvo[0]?.id ?? "nenhum"}`}
              avaliacao={alvo.avaliacao}
              semCustos={painelAtual.semCustos || alvo.custo <= 0}
              idDoEstudo={id}
              encerrado={encerrado}
              meuLanceAnotado={meuLanceAnotado}
              enviando={enviando}
              onDeiSugestao={(valor) => void registrarMeuLance(valor)}
              onDeiOutro={registrarMeuLance}
            />
          ) : (
            <p className="rounded border border-dashed border-line-strong bg-surface px-4 py-5 text-sm text-muted">
              Registre o melhor lance do portal para a Bela calcular sua margem
              e sugerir o próximo lance.
            </p>
          )}

          <Historico
            lances={lancesDoAlvo}
            encerrado={encerrado}
            desfazendo={enviando === "desfazer"}
            onDesfazer={desfazer}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <PlanoDoValorFinal
            alvo={alvo}
            alvos={painelAtual.alvos}
            baseDoValor={baseDoValor(alvo, config.criterio)}
            margemDesejadaPct={painelAtual.margemDesejadaPct}
            vedacaoARobo={painelAtual.disputa.vedacaoARobo}
            idDoEstudo={id}
            salvando={enviando === "plano"}
            desabilitado={encerrado || ocupado}
            onMudarBase={(base) => void salvarPlano({ base })}
            onMarcarCadastrado={(cadastradoNoPortal) =>
              void salvarPlano({ cadastradoNoPortal })
            }
            onCopiado={avisarCopia}
          />
          <ChecklistDaDisputa disputa={painelAtual.disputa} idDaLicitacao={id} />
          {painelAtual.disputa.decrementoAjustado &&
            painelAtual.disputa.avisoDoDecremento && (
              <Notice tone="warn">{painelAtual.disputa.avisoDoDecremento}</Notice>
            )}
          <Configuracao
            key={`${config.decrementoPct}-${config.maxLances}-${config.criterio}`}
            config={config}
            salvando={enviando === "config"}
            desabilitado={encerrado}
            onSalvar={salvarConfig}
          />
          {!encerrado && (
            <Encerramento
              key={meuUltimoLance?.id ?? "sem-lance"}
              sugestaoDeValor={valorFinalSugerido(painelAtual)}
              salvando={enviando === "resultado"}
              onEncerrar={encerrar}
            />
          )}
        </div>
      </div>
    </>
  );
}
