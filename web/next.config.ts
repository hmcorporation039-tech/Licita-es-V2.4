import type { NextConfig } from "next";
import path from "path";

// A API define a URL base do backend; o CSP precisa liberar connect-src pra ela
// (senão o fetch é bloqueado). Sem a variável, cai no default de desenvolvimento.
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

// "Portal dentro da Bela": a página conversa por WebSocket com o serviço navegador.
// Mesma URL configurada na API (NAVEGADOR_URL), em ws(s)://. Na Vercel, sem a variável,
// valem os dois endereços de produção (públicos, não são segredo): o do Railway e o do
// Fly.io em São Paulo (fly.toml). Assim a troca de um para o outro é só na API, sem novo
// deploy aqui. A variável NAVEGADOR_URL, quando existir, vale por cima. Fora da Vercel,
// sem ela, nada é liberado.
const NAVEGADORES_DE_PRODUCAO = ["https://licita-es-v24-production.up.railway.app", "https://bela-navegador.fly.dev"];
const paraWs = (url: string) =>
  url
    .trim()
    .replace(/^http(s?):\/\//i, (_m, s: string) => `ws${s}://`)
    .replace(/\/+$/, "");
const navegadorUrl = (process.env.NAVEGADOR_URL?.trim() ? [process.env.NAVEGADOR_URL] : process.env.VERCEL ? NAVEGADORES_DE_PRODUCAO : [])
  .map(paraWs)
  .filter(Boolean)
  .join(" ");

// Content-Security-Policy: o app não usa CDN de script nem estilo externo, só
// o próprio bundle e chamadas à API. O Next (App Router) injeta scripts INLINE
// de hidratação sem nonce, então 'unsafe-inline' em script-src é necessário
// para o app não quebrar; o dev ainda precisa de 'unsafe-eval'. Isto bloqueia
// o vetor principal (carregar script de origem externa) — um endurecimento
// maior (CSP com nonce por requisição) fica como evolução. frame-ancestors
// 'none' impede embutir o site em iframe (clickjacking), além do X-Frame-Options.
const isProd = process.env.NODE_ENV === "production";
const scriptSrc = isProd
  ? "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com"
  : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com";

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  scriptSrc,
  // Captcha Turnstile (cadastro) roda num iframe da Cloudflare.
  "frame-src https://challenges.cloudflare.com",
  `connect-src 'self' ${apiUrl}${navegadorUrl ? ` ${navegadorUrl}` : ""}`,
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    root: path.join(__dirname),
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
