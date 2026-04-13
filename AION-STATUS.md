# AION Repair OS — Status do Projeto

> Ultima atualizacao: 2026-04-13
> Versao: 7.0.3 (deploy confirmado no VPS)
> Ultimo deploy: 2026-04-13 — commit 18e4c4b

---

## Estado Atual

O AION esta **em producao** na VPS Hostinger, rodando com:
- **Modelo IA**: DeepSeek Reasoner (R1) via API direta
- **Container**: Docker, usuario non-root `aion`, network_mode: host
- **33 Skills diagnosticos**, **256 comandos ADB** (open policy para read-only)
- **Tool execution loop**: IA auto-executa acoes LOW risk e responde com dados reais
- **System prompt**: zero-tolerance para alucinacao, esforco maximo sempre
- **Autenticacao**: NAO configurada (API_TOKEN e ADMIN_TOKEN ausentes no .env do VPS)

---

## Infraestrutura

| Componente | Localizacao | Detalhes |
|---|---|---|
| **VPS** | Hostinger (srv907802.hstgr.cloud) | IP: 31.97.83.152 |
| **EasyPanel** | http://31.97.83.152:3000 | Painel de controle |
| **AION Web** | http://31.97.83.152:3002 | Interface principal |
| **Projeto na VPS** | /opt/aion-repair-os/ | Codigo + .env |
| **Projeto local** | /home/bluecamp/aion-repair-os/ | Desenvolvimento |
| **GitHub** | github.com/crhomagnus/AION-Repair-OS2 | Repositorio |
| **SSH Bridge** | aion_bridge_ed25519 | Tunel ADB local->VPS |

---

## Credenciais

### DeepSeek (IA — provedor ativo)
- **Chave**: ver .env local e VPS (DEEPSEEK_API_KEY)
- **Modelo**: deepseek-reasoner (R1)
- **Base URL**: https://api.deepseek.com

### OpenRouter (alternativo, suportado no codigo)
- **Modelo default**: qwen/qwen3.6-plus
- **Dashboard**: https://openrouter.ai
- **Status**: nao configurado no .env atual

### Hostinger VPS
- **IP**: 31.97.83.152
- **User**: root
- **SSH Key**: /home/bluecamp/.ssh/aion_bridge_ed25519
- **Porta SSH**: 22

### Seguranca da Aplicacao
- **API_TOKEN**: NAO configurado (todos os endpoints abertos)
- **ADMIN_TOKEN**: NAO configurado (endpoints admin abertos)
- **CORS_ORIGIN**: NAO configurado (permissivo)

### GitHub
- **Repo**: AION-Repair-OS2
- **User**: crhomagnus
- **Token**: ver CREDENCIAIS_LOCAIS.md (local only, .gitignore)

---

## Ultimo Snapshot Operacional (2026-04-13)

| Metrica | Valor |
|---|---|
| Versao | 7.0.3 |
| Status | healthy |
| AI | configured (deepseek-reasoner) |
| Device | Redmi 12 (7b8127147d81), Android 13 |
| CPU | 46% |
| RAM | 46% |
| Temperatura | 33C |
| Bateria | 100% (carregando) |
| Disco | 15% |
| WiFi | conectado |
| Bluetooth | inativo |
| Sinal celular | -103 dBm |

---

## Evolucao de Versoes

### v7.0.3 (2026-04-13) — VERSAO ATUAL
- System prompt reescrito: zero-tolerance para alucinacao, esforco maximo
- 33 skills diagnosticos (era 19)
- 256 comandos ADB (era 105)
- Open policy para comandos read-only (agente investiga livremente)
- Host-side ADB commands (bugreport, backup, pull/push)
- Pipe commands (grep, head, tail, wc, sort, awk, sed)
- AUDIO_ANALYSIS e DISPLAY_ANALYSIS com comandos especificos de dados
- Deploy confirmado no VPS em 2026-04-13

### v7.0.2-security (2026-04-13)
- Autenticacao token-based em todas as rotas + WebSocket
- Isolamento de sessao (historico IA por sessao, broadcast filtrado)
- Hardening do cmd-validator (path traversal fix, SHELL_SAFE validation)
- Container non-root, rate limiter cleanup

### v7.0.2-ai-optimization (2026-04-13)
- System prompt reestruturado com XML tags (<think>/<response>/<actions>)
- Parser de resposta com fallback automatico
- Tool execution loop (auto-executa LOW risk, injeta resultados, re-chama IA)

### v7.0.2-knowledge-expansion (2026-04-13)
- Expansao para 19 skills, 105 comandos ADB
- cmd-validator expandido com 100+ entradas

### v7.0.0 (original)
- DeepSeek R1 como modelo IA
- Sem autenticacao
- 8 skills basicos, ~30 comandos whitelistados

---

## Arquitetura

```
Workstation (PC do Dr. Marcio)
  +-- ADB Server (porta 5037, celulares USB)
  +-- SSH Bridge (local-bridge.js -> VPS)
  +-- Codigo fonte (/home/bluecamp/aion-repair-os/)

VPS Hostinger (31.97.83.152)
  +-- Docker Container (aion-repair-os, porta 3002)
  |   +-- Express + WebSocket server
  |   +-- AI Agent (DeepSeek Reasoner R1)
  |   +-- ADB Bridge (conecta via tunel SSH, auto-tracking)
  |   +-- Sensor Poller (12 metricas a cada 500ms)
  |   +-- SkillRunner (33 diagnosticos compostos)
  |   +-- Cmd Validator (256 comandos, open policy read-only)
  +-- EasyPanel (porta 3000)
  +-- SSH Tunnel Listener (porta 5037)

Browser (qualquer lugar)
  +-- UI em http://31.97.83.152:3002
      +-- WebSocket (telemetria em tempo real)
      +-- Chat com IA (tool loop automatico)
```

---

## Arquivos Criticos

| Arquivo | Linhas | Funcao |
|---|---|---|
| server/index.js | ~840 | Servidor principal, rotas, WebSocket, auth |
| server/ai-agent.js | ~760 | Agente IA, prompt, parser, tool loop |
| server/skills.js | ~500 | 33 skills diagnosticos compostos |
| server/cmd-validator.js | ~355 | Whitelist + open policy para read-only |
| server/adb-bridge.js | ~560 | Comunicacao ADB, device tracking, diagnosticos |
| server/sensor-poller.js | ~227 | Telemetria (12 metricas) |
| server/store.js | ~146 | Persistencia (sessoes + audit log) |
| server/ai-executor.js | ~149 | Executor autonomo (opt-in) |
| server/logger.js | ~47 | Logger estruturado |
| web/index.html | ~1730 | Frontend dark neon completo |

---

## Deploy

```bash
# Via Git (recomendado):
SSH_KEY="/home/bluecamp/.ssh/aion_bridge_ed25519"
ssh -i $SSH_KEY root@31.97.83.152 "cd /opt/aion-repair-os && git fetch origin && git reset --hard origin/main && docker compose down && docker compose up -d --build"

# Bridge (no PC local):
node bridge/local-bridge.js

# Verificar:
curl http://31.97.83.152:3002/api/health
```

---

## Pendencias para Producao Completa

1. Configurar `API_TOKEN` e `ADMIN_TOKEN` no `.env` do VPS
2. Configurar dominio + HTTPS (Nginx + Let's Encrypt)
3. Configurar `CORS_ORIGIN` para restringir ao dominio
4. (Opcional) Migrar de DeepSeek para OpenRouter/Qwen se desejado

---

## Para a Proxima IA

1. O codigo esta em `/home/bluecamp/aion-repair-os/`
2. Credenciais estao no `.env` local e no `CREDENCIAIS_LOCAIS.md`
3. O remote Git e `origin` -> `github.com/crhomagnus/AION-Repair-OS2`
4. O deploy e via git pull + docker compose rebuild na VPS
5. A chave SSH para a VPS e `/home/bluecamp/.ssh/aion_bridge_ed25519`
6. O modelo IA e `deepseek-reasoner` (DeepSeek R1) — OpenRouter e alternativo
7. O .env do VPS NAO tem API_TOKEN — endpoints estao abertos
