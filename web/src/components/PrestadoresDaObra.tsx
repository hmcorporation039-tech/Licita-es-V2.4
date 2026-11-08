"use client";

// "Prestadores para a minha obra": quem ganhou longe de casa procura quem execute
// um serviço perto da obra. Primeiro as empresas da Bela que aceitaram aparecer;
// depois, sob demanda, o Google (nota e avaliações).

import { useEffect, useState, type FormEvent } from "react";
import {
  ExternalLink,
  Globe,
  Mail,
  MapPin,
  Phone,
  Search,
  Star,
  Users,
} from "lucide-react";
import { api, ApiRequestError } from "@/lib/api";
import {
  Button,
  EmptyState,
  Field,
  Input,
  Notice,
  Panel,
  Select,
  StatusTag,
  TextLink,
} from "@/components/ui";

const UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];
const RAIOS = [30, 50, 100, 150, 200, 300];

interface Servico {
  id: string;
  nome: string;
}

interface PrestadorDaBela {
  id: string;
  nome: string;
  cidade: string | null;
  distanciaKm: number | null;
  nichos: string[];
  todosOsNichos: string[];
  apresentacao: string | null;
  telefone: string | null;
  email: string | null;
}

interface LugarDoGoogle {
  id: string;
  nome: string;
  endereco: string | null;
  nota: number | null;
  avaliacoes: number;
  telefone: string | null;
  site: string | null;
  linkMaps: string | null;
  distanciaKm: number | null;
}

interface Resposta {
  obra: { municipio: string; uf: string };
  servico: Servico;
  raioKm: number;
  daBela: PrestadorDaBela[];
  google: boolean;
}

function lerDaUrl(): { cidade: string; uf: string } {
  if (typeof window === "undefined") return { cidade: "", uf: "" };
  const p = new URLSearchParams(window.location.search);
  const uf = (p.get("uf") ?? "").toUpperCase();
  return { cidade: p.get("cidade") ?? "", uf: UFS.includes(uf) ? uf : "" };
}

export default function PrestadoresDaObra({
  servicos,
  googleAtivo,
  planoGratuito,
}: {
  servicos: Servico[];
  googleAtivo: boolean;
  planoGratuito: boolean;
}) {
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [servico, setServico] = useState(servicos[0]?.id ?? "");
  const [raioKm, setRaioKm] = useState(100);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resposta, setResposta] = useState<Resposta | null>(null);
  const [google, setGoogle] = useState<LugarDoGoogle[] | null>(null);
  const [buscandoGoogle, setBuscandoGoogle] = useState(false);
  const [erroGoogle, setErroGoogle] = useState<string | null>(null);

  useEffect(() => {
    const daUrl = lerDaUrl();
    if (daUrl.cidade) setCidade(daUrl.cidade);
    if (daUrl.uf) setUf(daUrl.uf);
  }, []);

  const params = () =>
    new URLSearchParams({
      servico,
      cidade: cidade.trim(),
      uf,
      raioKm: String(raioKm),
    });

  async function buscar(e: FormEvent) {
    e.preventDefault();
    if (!cidade.trim() || !uf) {
      setErro("Informe a cidade e o estado da obra.");
      return;
    }
    setBuscando(true);
    setErro(null);
    setGoogle(null);
    setErroGoogle(null);
    try {
      setResposta(
        await api.get<Resposta>(`/api/obras/prestadores?${params()}`),
      );
    } catch (e) {
      setErro(
        e instanceof ApiRequestError
          ? e.message
          : "Não foi possível buscar agora.",
      );
    } finally {
      setBuscando(false);
    }
  }

  async function buscarNoGoogle() {
    setBuscandoGoogle(true);
    setErroGoogle(null);
    try {
      const r = await api.get<{ lugares: LugarDoGoogle[] }>(
        `/api/obras/prestadores/google?${params()}`,
      );
      setGoogle(r.lugares);
    } catch (e) {
      setErroGoogle(
        e instanceof ApiRequestError
          ? e.message
          : "A busca no Google falhou agora.",
      );
    } finally {
      setBuscandoGoogle(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Onde é a obra e o que você precisa"
        description="Ganhou longe de casa? Ache quem execute o serviço perto da obra, sem deslocar a sua equipe."
      >
        <form
          onSubmit={buscar}
          className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_6rem_2fr_9rem_auto] sm:items-end"
        >
          <Field label="Cidade da obra">
            <Input
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              placeholder="Ex.: Belém"
              maxLength={80}
            />
          </Field>
          <Field label="UF">
            <Select value={uf} onChange={(e) => setUf(e.target.value)}>
              <option value="">—</option>
              {UFS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Serviço">
            <Select
              value={servico}
              onChange={(e) => setServico(e.target.value)}
            >
              {servicos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Distância">
            <Select
              value={raioKm}
              onChange={(e) => setRaioKm(Number(e.target.value))}
            >
              {RAIOS.map((r) => (
                <option key={r} value={r}>
                  até {r} km
                </option>
              ))}
            </Select>
          </Field>
          <Button
            type="submit"
            variant="primary"
            icon={Search}
            loading={buscando}
          >
            Buscar
          </Button>
        </form>
        {erro && (
          <Notice tone="danger" className="mt-3">
            {erro}
          </Notice>
        )}
      </Panel>

      {resposta && (
        <>
          <Panel
            padding="none"
            title={`Na Bela: ${resposta.daBela.length} ${resposta.daBela.length === 1 ? "empresa" : "empresas"}`}
            description={`${resposta.servico.nome} perto de ${resposta.obra.municipio}/${resposta.obra.uf}. Empresas que usam a Bela e aceitaram aparecer para quem ganhou obra na região delas.`}
          >
            {resposta.daBela.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={Users}
                  title="Nenhuma empresa da Bela nessa região ainda"
                  description="A lista cresce conforme novas empresas se cadastram como prestadoras. Busque também no Google, abaixo."
                />
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-line-soft">
                {resposta.daBela.map((p) => (
                  <li key={p.id} className="flex flex-col gap-1.5 px-4 py-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-semibold text-ink">{p.nome}</p>
                      <StatusTag tone="accent">Usa a Bela</StatusTag>
                    </div>
                    <p className="inline-flex items-center gap-1 text-xs text-muted">
                      <MapPin size={12} aria-hidden />
                      {[
                        p.cidade,
                        p.distanciaKm !== null
                          ? `${p.distanciaKm} km da obra`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Cidade não informada"}
                    </p>
                    {p.apresentacao && (
                      <p className="text-sm text-ink-2">{p.apresentacao}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {p.todosOsNichos.map((n) => (
                        <StatusTag
                          key={n}
                          tone={p.nichos.includes(n) ? "accent" : "neutral"}
                        >
                          {n}
                        </StatusTag>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      {p.telefone && (
                        <a
                          className="inline-flex items-center gap-1 text-accent underline"
                          href={`tel:${p.telefone.replace(/[^\d+]/g, "")}`}
                        >
                          <Phone size={14} aria-hidden /> {p.telefone}
                        </a>
                      )}
                      {p.email && (
                        <a
                          className="inline-flex items-center gap-1 text-accent underline"
                          href={`mailto:${p.email}`}
                        >
                          <Mail size={14} aria-hidden /> {p.email}
                        </a>
                      )}
                      {!p.telefone && !p.email && (
                        <span className="text-muted">
                          Sem contato cadastrado.
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            padding="none"
            title="No Google"
            description="Empresas da região pela nota e pelo número de avaliações no Google. Uma nota 4,8 com 200 avaliações vem antes de 5,0 com 3."
          >
            <div className="flex flex-col gap-3 p-4">
              {!googleAtivo ? (
                <Notice tone="info">
                  A busca no Google ainda não foi ativada nesta instalação.
                </Notice>
              ) : planoGratuito ? (
                <Notice tone="info">
                  A busca no Google é liberada nos planos pagos.{" "}
                  <TextLink href="/conta">Ver planos</TextLink>
                </Notice>
              ) : google === null ? (
                <Button
                  variant="secondary"
                  icon={Search}
                  loading={buscandoGoogle}
                  onClick={buscarNoGoogle}
                  className="self-start"
                >
                  Buscar no Google
                </Button>
              ) : google.length === 0 ? (
                <p className="text-sm text-ink-2">
                  O Google não achou empresas desse serviço nessa distância.
                  Tente aumentar a distância.
                </p>
              ) : null}
              {erroGoogle && <Notice tone="danger">{erroGoogle}</Notice>}
            </div>
            {google && google.length > 0 && (
              <ul className="flex flex-col divide-y divide-line-soft border-t border-line-soft">
                {google.map((l) => (
                  <li key={l.id} className="flex flex-col gap-1 px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-semibold text-ink">{l.nome}</p>
                      {l.nota !== null && (
                        <span className="inline-flex items-center gap-1 text-sm text-ink">
                          <Star
                            size={14}
                            className="fill-current text-warn"
                            aria-hidden
                          />
                          <span className="font-mono">
                            {l.nota.toLocaleString("pt-BR", {
                              minimumFractionDigits: 1,
                              maximumFractionDigits: 1,
                            })}
                          </span>
                          <span className="text-xs text-muted">
                            ({l.avaliacoes}{" "}
                            {l.avaliacoes === 1 ? "avaliação" : "avaliações"})
                          </span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted">
                      {[
                        l.endereco,
                        l.distanciaKm !== null
                          ? `${l.distanciaKm} km da obra`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      {l.telefone && (
                        <a
                          className="inline-flex items-center gap-1 text-accent underline"
                          href={`tel:${l.telefone.replace(/[^\d+]/g, "")}`}
                        >
                          <Phone size={14} aria-hidden /> {l.telefone}
                        </a>
                      )}
                      {l.site && (
                        <a
                          className="inline-flex items-center gap-1 text-accent underline"
                          href={l.site}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Globe size={14} aria-hidden /> Site
                        </a>
                      )}
                      {l.linkMaps && (
                        <a
                          className="inline-flex items-center gap-1 text-accent underline"
                          href={l.linkMaps}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Ver no Google Maps{" "}
                          <ExternalLink size={12} aria-hidden />
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {google && google.length > 0 && (
              <p className="border-t border-line-soft px-4 py-2 text-2xs text-muted">
                Dados do Google Maps. Confira a empresa antes de contratar.
              </p>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
