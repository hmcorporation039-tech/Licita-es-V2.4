# Ponte no Brasil

TCE-RS, Infraero e parte do Sistema S recusam acesso que vem de servidor fora do Brasil. O Railway não tem região no Brasil, então esses coletores saem por uma máquina em São Paulo. O resto do sistema continua saindo direto.

## Como está montada

- **Máquina:** Oracle Cloud, região São Paulo, `licitabela-proxy-sp` (Ubuntu 24.04). Acesso por SSH com a chave `~/.ssh/licitabela_proxy_sp`, que fica só no PC do Márcio.
- **Programa:** tinyproxy na porta 48231.
- **Trancas:**
  - usuário e senha; a senha fica em `/root/.proxy-senha`, legível só pelo root;
  - só os domínios de `/etc/tinyproxy/filter` passam; qualquer outro endereço é recusado;
  - a porta 48231 está aberta na Security List da Oracle e no iptables da máquina.
- **No sistema:** a variável `PROXY_BRASIL_URL` no serviço **Workers** do Railway. Sem ela, os coletores saem direto como antes.
- **Quem usa a ponte:** os clientes HTTP marcados com `pelaPonteNoBrasil` em `src/lib/httpClient.ts`: TCE-RS, Infraero, SESC GO, SESC regionais, Portal da Indústria, Paradigma e páginas do Sistema S. Ao subir, o Workers registra no log se a ponte está ligada (sem mostrar a senha).

## Manutenção

- **Portal novo do Sistema S que precisa da ponte:** acrescente o domínio em `/etc/tinyproxy/filter`, no formato `(^|\.)dominio\.com\.br$`, e reinicie com `sudo systemctl restart tinyproxy`.
- **Trocar a senha:** gere uma nova em `/root/.proxy-senha`, atualize a linha `BasicAuth` de `/etc/tinyproxy/tinyproxy.conf`, reinicie o tinyproxy e atualize `PROXY_BRASIL_URL` no Railway.
- **Ponte fora do ar:** esses coletores falham e o motivo aparece em `worker_logs`. O resto do sistema não é afetado. Para desligar a ponte, apague `PROXY_BRASIL_URL` no Railway.
- **IP:** o IP público é efêmero e muda se a máquina for recriada. Nesse caso, atualize `PROXY_BRASIL_URL`.
- **Custo:** a máquina atual (E5.Flex) usa os créditos do trial da Oracle. Antes de o trial acabar, passe a conta para Pay As You Go, com alerta de orçamento, e mude a ponte para uma máquina Always Free (A1 ou E2.1.Micro).
