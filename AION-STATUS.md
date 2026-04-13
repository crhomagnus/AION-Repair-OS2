# AION Repair OS — Status do Projeto

> Última atualização: 2026-04-13
> Versão: 7.0.2 (com patches de segurança e otimização de IA)

---

## Estado Atual

O AION está **em produção** na VPS Hostinger, rodando com:
- **Modelo IA**: Qwen 3.6 Plus (via OpenRouter, pago ~$0.50/$2.00 por 1M tokens)
- **Container**: Docker, usuário non-root `aion`, network_mode: host
- **Autenticação**: Token-based (API_TOKEN) em todos os endpoints
- **19 Skills diagnósticos**, **105 comandos ADB** whitelistados
- **Tool execution loop**: IA auto-executa ações LOW risk e responde com dados reais

---

## Infraestrutura

| Componente | Localização | Detalhes |
|---|---|---|
| **VPS** | Hostinger (srv907802.hstgr.cloud) | IP: 31.97.83.152 |
| **EasyPanel** | http://31.97.83.152:3000 | Painel de controle |
| **AION Web** | http://31.97.83.152:3002 | Interface principal |
| **Projeto na VPS** | /opt/aion-repair-os/ | Código + .env |
| **Projeto local** | /home/bluecamp/aion-repair-os/ | Desenvolvimento |
| **GitHub** | github.com/crhomagnus/AION-Repair-OS2 | Repositório |
| **SSH Bridge** | aion_bridge_ed25519 | Túnel ADB local→VPS |

---

## Credenciais

### OpenRouter (IA)
- **Chave**: ver .env local e VPS
- **Modelo**: qwen/qwen3.6-plus
- **Dashboard**: https://openrouter.ai

### Hostinger VPS
- **IP**: 31.97.83.152
- **User**: root
- **SSH Key**: /home/bluecamp/.ssh/aion_bridge_ed25519
- **Porta SSH**: 22

### AION Authentication
- **API_TOKEN**: ver .env local e VPS
- **ADMIN_TOKEN**: mesmo que API_TOKEN (pode ser separado)

### GitHub
- **Repo**: AION-Repair-OS2
- **User**: crhomagnus
- **Token**: ver CREDENCIAIS_LOCAIS.md (local only, .gitignore)

---

## Evolução de Versões

### v7.0.2-security (2026-04-13)
- Limpeza de credenciais do histórico Git (git-filter-repo)
- Autenticação token-based em todas as rotas + WebSocket
- Isolamento de sessão (histórico IA por sessão, broadcast filtrado)
- Hardening do cmd-validator (path traversal fix, SHELL_SAFE validation)
- Input validation (enums, limites, CORS restritivo)
- Container non-root, rate limiter cleanup

### v7.0.2-ai-optimization (2026-04-13)
- System prompt reestruturado com XML tags (<think>/<response>/<actions>)
- Parser de resposta com fallback automático
- Tool execution loop (auto-executa LOW risk, injeta resultados, re-chama IA)
- 8 skills diagnósticos iniciais

### v7.0.2-knowledge-expansion (2026-04-13)
- Expansão para 19 skills, 105 comandos ADB
- Novos skills: CELLULAR_ANALYSIS, WIFI_ANALYSIS, BLUETOOTH_ANALYSIS,
  PROCESS_ANALYSIS, APP_CRASH_LOG, HARDWARE_PROFILE, DEVICE_IDENTITY,
  LOG_COLLECTION, FORENSIC_SNAPSHOT, DISPLAY_ANALYSIS, AUDIO_ANALYSIS
- cmd-validator expandido com 100+ entradas (dumpsys 30+, getprop 15+, etc.)
- Few-shot examples expandidos para cenários de rede e performance

### v7.0.0 (original, antes das mudanças)
- DeepSeek R1 como modelo IA
- Sem autenticação
- Histórico IA compartilhado entre sessões
- 8 skills básicos, ~30 comandos whitelistados
- Credenciais expostas no Git

---

## Arquitetura

```
Workstation (PC do Dr. Marcio)
  ├── ADB Server (porta 5037, celulares USB)
  ├── SSH Bridge (local-bridge.js → VPS)
  └── Código fonte (/home/bluecamp/aion-repair-os/)

VPS Hostinger (31.97.83.152)
  ├── Docker Container (aion-repair-os, porta 3002)
  │   ├── Express + WebSocket server
  │   ├── AI Agent (Qwen 3.6 Plus via OpenRouter)
  │   ├── ADB Bridge (conecta via túnel SSH)
  │   ├── Sensor Poller (12 métricas a cada 2s)
  │   ├── SkillRunner (19 diagnósticos compostos)
  │   └── Cmd Validator (100+ comandos whitelistados)
  ├── EasyPanel (porta 3000)
  └── SSH Tunnel Listener (porta 5037)

Browser (qualquer lugar)
  └── UI em http://31.97.83.152:3002
      ├── Token de autenticação (localStorage)
      ├── WebSocket (telemetria em tempo real)
      └── Chat com IA (ações sugeridas automaticamente)
```

---

## Arquivos Críticos

| Arquivo | Linhas | Função |
|---|---|---|
| server/index.js | ~820 | Servidor principal, rotas, WebSocket, auth |
| server/ai-agent.js | ~500 | Agente IA, prompt, parser, tool loop |
| server/skills.js | ~450 | 19 skills diagnósticos compostos |
| server/cmd-validator.js | ~180 | Whitelist de comandos ADB por risco |
| server/adb-bridge.js | ~477 | Comunicação ADB, device tracking |
| server/sensor-poller.js | ~227 | Telemetria (12 métricas) |
| server/store.js | ~146 | Persistência (sessões + audit log) |
| server/ai-executor.js | ~149 | Executor autônomo (opt-in) |
| web/index.html | ~1730 | Frontend completo |

---

## Deploy

```bash
# Na VPS:
cd /opt/aion-repair-os
docker compose down && docker compose up -d --build

# Bridge (no PC local):
node bridge/local-bridge.js

# Ou via SCP do local:
SSH_KEY="/home/bluecamp/.ssh/aion_bridge_ed25519"
scp -i $SSH_KEY server/*.js root@31.97.83.152:/opt/aion-repair-os/server/
ssh -i $SSH_KEY root@31.97.83.152 "cd /opt/aion-repair-os && docker compose down && docker compose up -d --build"
```

---

## Para a Próxima IA

1. O código está em `/home/bluecamp/aion-repair-os/`
2. Credenciais estão no `.env` local e no `CREDENCIAIS_LOCAIS.md`
3. O remote Git é `origin` → `github.com/crhomagnus/AION-Repair-OS2`
4. O deploy é via SCP + docker compose rebuild na VPS
5. A chave SSH para a VPS é `/home/bluecamp/.ssh/aion_bridge_ed25519`
6. O token de API do AION está no `.env` (API_TOKEN)
7. O modelo IA é `qwen/qwen3.6-plus` via OpenRouter
