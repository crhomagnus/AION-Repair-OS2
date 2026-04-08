# AION Repair OS V7.0 - Documentação Técnica Completa

## Visão Geral

**AION Repair OS** é um sistema autônomo de diagnóstico e reparo para dispositivos Android. Desenvolvido em Node.js com frontend web em TailwindCSS, oferece telemetria em tempo real, chat com IA, console ADB interativo e captura forense.

---

## Stack Tecnológica

### Backend
- **Runtime**: Node.js 20.20.2
- **Framework**: Express 5.2.1
- **WebSocket**: ws 8.20.0
- **ADB Bridge**: adbkit 2.11.1
- **Config**: dotenv 17.4.1

### Frontend
- **Framework CSS**: TailwindCSS (CDN)
- **Fontes**: Inter, JetBrains Mono, Space Grotesk
- **Ícones**: Material Symbols Outlined

### Infraestrutura
- **Sistema Operacional**: Kali Linux (Host)
- **Depuração**: Android SDK / ADB (USB)

---

## Configurações de Segurança

### Keys e Tokens

| Serviço | Key/Token | Status |
|---------|-----------|--------|
| OpenRouter API | `***OPENROUTER_KEY_REDACTED***` | ✅ Ativa |

### Modelo AI
- **Provider**: OpenRouter
- **Modelo Padrão**: `openai/gpt-oss-120b:free`
- **Temperatura**: 0.7
- **Max Tokens**: 600

### Validação de Comandos ADB
- Whitelist de comandos permitidos
- Padrões bloqueados (rm -rf, dd, mkfs, etc)
- Limite de 1000 caracteres por comando

---

## Arquitetura do Projeto

```
aion-repair-os/
├── main.js                    # Entry point
├── server/
│   ├── index.js               # Servidor Express + WebSocket
│   ├── adb-bridge.js         # Comunicação ADB via adbkit
│   ├── sensor-poller.js       # Pipeline de 12 sensores
│   ├── cmd-validator.js      # Camada de segurança
│   ├── ai-agent.js           # Chat AI + fallback offline
│   └── ai-executor.js        # Executor autônomo (Mestre Executor)
├── web/
│   └── index.html             # Dashboard Silicon Onyx
├── .env                       # Configurações locais (NÃO COMMITAR)
├── .env.example               # Template de configuração
├── package.json
├── README.md
├── DESIGN.md                  # Sistema de design
└── PROGRESS.md                # Histórico de desenvolvimento
```

---

## APIs e Endpoints

### Servidor Principal
```
Porta: 3001 (configurável via PORT env)
```

### Endpoints REST

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/status` | Status do servidor e device |
| GET | `/api/devices` | Lista dispositivos conectados |
| POST | `/api/connect` | Conectar a dispositivo |
| POST | `/api/execute` | Executar comando ADB |
| GET | `/api/sensors` | Estado atual dos 12 sensores |
| POST | `/api/chat` | Chat com IA |
| GET | `/api/ai/status` | Status da IA (online/offline) |
| POST | `/api/ai/key` | Definir API key |
| GET | `/api/executor/status` | Status do executor autônomo |
| POST | `/api/capture/forensic` | Iniciar captura forense |
| GET | `/api/capture/forensic/:jobId` | Status da captura |

### WebSocket
```
URL: ws://localhost:3001
```

**Mensagens de entrada:**
```json
{ "type": "chat", "message": "texto" }
{ "type": "connect", "deviceId": "id" }
{ "type": "set_api_key", "key": "sk-or-...", "model": "modelo" }
{ "type": "ping" }
```

**Mensagens de saída:**
```json
{ "type": "telemetry", "data": { ... } }
{ "type": "device_connected", "device": { ... } }
{ "type": "chat_response", "response": "..." }
{ "type": "adb_log", "command": "...", "result": "..." }
{ "type": "executor_action", "cycle": 1, "actions": [...] }
```

---

## Os 12 Sensores

| # | Sensor | Fonte ADB | Unidade |
|---|--------|------------|---------|
| 1 | CPU | `cat /proc/stat` | % |
| 2 | RAM | `cat /proc/meminfo` | % |
| 3 | GPU | `cat /sys/class/kgsl/kgsl-3d0/gpu_busy_percentage` | % |
| 4 | Temperature | `cat /sys/class/thermal/thermal_zone*/temp` | °C |
| 5 | Battery | `dumpsys battery` | % + status |
| 6 | Disk | `df -h /data` | % |
| 7 | Signal | `dumpsys telephony registry` | dBm |
| 8 | Latency | `cat /proc/sched_debug` | ms |
| 9 | Bluetooth | `dumpsys bluetooth_manager` | bool |
| 10 | Wi-Fi | `dumpsys wifi` | bool |
| 11 | Camera | `dumpsys media.camera` | bool |
| 12 | Memory | `cat /proc/meminfo` | % |

---

## Modo de Execução

### Manual (Padrão)
- Sistema monitora sensores
- Usuário executa comandos via console ou chat

### Executor Autônomo (Mestre Executor)
- Toggle via sidebar
- Ciclo a cada 10 segundos
- Condições de ação:

| Condição | Ação Automática |
|----------|-----------------|
| CPU > 90% + Temp > 45°C | Force-stop processos |
| RAM > 85% + Latency > 20 | dumpsys meminfo |
| Disk > 90% | pm clear downloads |
| Battery < 20% | dumpsys battery |
| Signal < -100 dBm | Toggle Wi-Fi |

---

## Fail-Safe (Proteções)

O sistema NÃO executa comandos bloqueados:

### Padrões Bloqueados
```
rm -rf /      # Não apagar root
dd            # Não escrever disco direto
mkfs          # Não formatar
reboot -f     # Não forçar reboot
shutdown      # Não desligar
; rm          # Não injetar rm
$(...)        # Não command injection
| sh          # Não pipe to shell
```

### Limites
- Comandos: máx 1000 caracteres
- Ciclo executor: 10 segundos
- Timeout API AI: 30 segundos

---

## Dificuldades e Problemas Resolvidos

### 1. Porta 8081 em Uso
**Problema**: O processo `node server.js` estava ocupando a porta 8081.

**Solução**: Alterada porta para 3001, mais baixa e disponível.

### 2. WebSocket Desconectado na UI
**Problema**: UI não recebia telemetria em tempo real.

**Solução**: Implementado `handleWSMessage()` para processar mensagens WebSocket e atualizar DOM dinamicamente.

### 3. Design Não Integrado
**Problema**: `code.html` tinha design premium mas não estava conectado ao backend.

**Solução**: Migrado todo o design "Silicon Onyx" para `web/index.html` com integração completa.

### 4. Dispositivo Não Detectado
**Problema**: `adb devices` mostrava lista vazia.

**Solução**: Verificar:
- USB Debugging habilitado no Android
- Cabo USB com transferência de dados (não só carga)
- `adb kill-server && adb start-server`

### 5. API Key Inválida
**Problema**: AI ficava em modo offline.

**Solução**: A key válida está configurada no `.env`. Para nova key, obter em https://openrouter.ai/keys

---

## Variáveis de Ambiente

Criar arquivo `.env` na raiz do projeto:

```bash
# API Key OpenRouter
OPENROUTER_API_KEY=***OPENROUTER_KEY_REDACTED***

# Modelo AI (opcional)
OPENROUTER_MODEL=openai/gpt-oss-120b:free

# Porta do servidor (opcional, padrão 3001)
PORT=3001
```

---

## Comandos de Manutenção

### Iniciar Servidor
```bash
cd /home/bluecamp/aion-repair-os
npm start
# ou
PORT=3001 node main.js
```

### Verificar Processos
```bash
lsof -i :3001
ps aux | grep node
```

### Reiniciar ADB
```bash
adb kill-server
adb start-server
adb devices
```

### Logs
```bash
# Ver logs do servidor
tail -f /tmp/aion.log

# Ver output em tempo real
node main.js
```

---

## Melhorias Futuras (TODO)

- [ ] Testes unitários com Jest
- [ ] Documentação API com Swagger/OpenAPI
- [ ] Modo offline aprimorado com NLP local
- [ ] Dashboard para múltiplos dispositivos
- [ ] Histórico de comandos e resultados
- [ ] Exportação de relatórios em PDF
- [ ] Sistema de alertas via Telegram/Discord
- [ ] Machine Learning para predição de falhas

---

## Créditos

- **Desenvolvedor**: AION Team
- **Design**: Sistema "Silicon Onyx" (precision engineering aesthetic)
- **AI**: OpenRouter API (GPT-OSS 120B)
- **ADB**: Android SDK Platform Tools

---

*Última atualização: 2026-04-08*
*Versão: 7.0.0*
