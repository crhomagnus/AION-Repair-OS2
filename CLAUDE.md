# AION Repair OS — V7.1.0

## Credenciais

Antes de trabalhar neste projeto, consulte o arquivo centralizado de credenciais:

```
/home/bluecamp/.credentials/KEYS.md
```

Esse arquivo contem todas as API keys, tokens e senhas de infraestrutura necessarias.
Nao duplique credenciais — sempre consulte o arquivo central.

---

## Visao Geral

AION Repair OS e um sistema autonomo de diagnostico e reparo de smartphones Android via ADB.
Um agente de IA (Claude Opus 4.6) conversa com o cliente, investiga o aparelho usando 33 skills e 256 comandos ADB, diagnostica o problema e executa a correcao — tudo sem intervencao humana.

### Stack
- **Backend**: Node.js + Express + WebSocket
- **Frontend**: Single HTML (web/index.html) com CSS/JS inline
- **IA**: Claude Opus 4.6 via Anthropic API (provider configuravel: Anthropic/OpenRouter/DeepSeek)
- **ADB**: @devicefarmer/adbkit para comunicacao com dispositivos Android
- **Persistencia**: Supabase (sessoes, chat, audit) + fallback JSON local (data/)
- **Porta padrao**: 3001 (configuravel via PORT no .env)

### Arquitetura

```
main.js                    → Entry point
server/
  index.js                 → Express + WebSocket server, rotas REST, broadcast
  ai-agent.js              → Agente IA: system prompt, loop autonomo, providers
  ai-executor.js           → Executor autonomo (opt-in)
  adb-bridge.js            → Ponte ADB: connect, execute, tracking de devices
  cmd-validator.js         → Validador de comandos (allow/deny list + risk levels)
  device-profile.js        → Perfil detalhado do dispositivo (model, chipset, RAM, etc)
  sensor-poller.js         → Polling de telemetria (CPU, RAM, temp, bateria, etc)
  skills.js                → 33 skills de diagnostico (FULL_DIAGNOSTIC, BATTERY_HEALTH, etc)
  store.js                 → Persistencia: Supabase + fallback JSON
  logger.js                → Logger estruturado
web/
  index.html               → Dashboard completo: chat, terminal, telemetria, sensores
data/
  sessions.json             → Sessoes locais (fallback)
  audit.jsonl               → Log de auditoria local
  supabase-schema.sql       → Schema do banco
```

---

## Modelo de IA e Prompt

### Provider: Anthropic (obrigatorio)
- Modelo: `claude-opus-4-6`
- API: Anthropic Messages API
- max_tokens: 2048
- O .env DEVE ter `AI_PROVIDER=anthropic` e `ANTHROPIC_API_KEY` configurado

### System Prompt (ai-agent.js)
O agente AION segue estas regras:

1. **Identidade**: Tecnico senior de smartphones. Profissional, formal, competente.
2. **Linguagem**: Portugues BR, formal e cordial. SEM girias, SEM informalidade. Tom de medico/engenheiro.
3. **Autonomia**: 90% protocolo + 10% julgamento proprio (execucao), 70% protocolo + 30% personalidade (conversa).
4. **Formato de resposta**: `<think>` (raciocinio interno) + `<response>` (texto ao cliente) + `<actions>` (JSON de acoes).
5. **Execucao total**: Tudo executa automaticamente. NUNCA pede autorizacao ao cliente. Inclusive comandos destrutivos.
6. **Transparencia**: Sempre diz o nome exato do comando/skill que vai executar e por que.
7. **Profundidade ilimitada**: Investiga ate resolver. Sem limite de camadas.
8. **Adaptacao de perfil**: Pergunta se e tecnico ou cliente final. Tecnico recebe terminologia avancada, leigo recebe linguagem simples.

### Conhecimento Android embutido no prompt
- Particoes `/`, `/vendor`, `/product` sao read-only e SEMPRE 100% — nao confundir com armazenamento do usuario
- Load average alto + CPU idle = D-state (drivers/binder), nao sobrecarga de CPU
- Skills genericas nao devem ser repetidas — usar SHELL_SAFE para precisao

---

## Loop Autonomo de Investigacao (ai-agent.js)

### Fluxo
1. Cliente descreve problema → IA identifica sintoma → solicita skills/comandos
2. Skills executam no dispositivo via ADB → resultados voltam como `tool_result`
3. IA analisa, responde ao cliente, solicita mais dados se necessario
4. Loop continua ate: problema resolvido OU IA pergunta algo ao cliente OU safeguard esgotado

### Safeguard (anti-loop)
- Maximo 2 nudges por investigacao
- NUNCA forca skills — apenas pede para a IA incluir as acoes que ela mesma mencionou
- Tracking de skills executadas (Set) para evitar repeticao
- Se a IA parou sem resolver e sem perguntar ao cliente, injeta mensagem pedindo proximo passo
- Mensagem de nudge orienta a usar SHELL_SAFE para comandos especificos

### Historico no loop
- Tool results sao adicionados ao historico como mensagens `user`
- A IA recebe as ultimas 30 mensagens (history.slice(-30))
- Isso garante que a IA ve suas respostas anteriores e nao repete conclusoes

---

## Frontend (web/index.html)

### Paineis
1. **Telemetria** (esquerda): 12 sensores em tempo real (CPU, RAM, temp, bateria, etc)
2. **Chat** (centro): Conversa entre cliente e AION
3. **Terminal** (direita): Comandos ADB executados pelo agente em tempo real

### Sessoes e Reconexao
- `state.knownDevices` (Set): rastreia dispositivos ja conectados
- `state.previousSessionId`: preservado no disconnect para reutilizacao
- Reconexao do mesmo device: reutiliza o mesmo session ID (preserva memoria da IA)
- Envia `[DISPOSITIVO_RECONECTADO]` em vez de `[SESSAO_INICIADA]` para devices ja conhecidos
- `bootstrapLock`: previne race condition entre WebSocket e polling

### Status do Terminal
- "investigando..." (cursor piscando): agente trabalhando
- "executando reparo..." (cursor amarelo): agente aplicando correcao
- "pronto" (cursor fixo): agente ocioso

### Execucao Autonoma
- TODAS as acoes executam automaticamente no frontend — sem gate de HIGH risk
- `executeAction()` nao tem mais pending state
- `state.pendingAction` nao e mais usado

---

## Broadcast e WebSocket

- HTTP POST `/api/chat` retorna resposta ao cliente mas NAO faz broadcast (evita duplicacao)
- O loop autonomo em `executeInBackground()` faz broadcast via WebSocket para cada turno
- `broadcast()` loga quantos clientes receberam cada `chat_response`
- Phase updates (`diagnostic`/`repair`/`idle`) sao broadcasted durante o loop

---

## Problemas Conhecidos

### Supabase: Foreign Key Constraint
- `setSession` falha com "Could not find the 'consent' column"
- `saveChatMessage` falha com "violates foreign key constraint"
- **Causa**: Schema do Supabase esta desatualizado (falta coluna `consent` em `aion_sessions`)
- **Impacto**: Sessoes e mensagens nao persistem no Supabase, mas o fallback JSON local funciona
- **Fix pendente**: Rodar migration no Supabase para adicionar a coluna `consent`

### Diretorio `public/` nao existe
- O frontend esta em `web/`, nao em `public/`
- Express serve static de `path.join(__dirname, '../web')`
- Isso e correto — nao criar diretorio `public/`

---

## Como Rodar

```bash
cd /home/bluecamp/aion-repair-os
PORT=3001 node main.js
# Acessar: http://localhost:3001
```

## Como Testar

```bash
npm test                    # Todos os testes
npm run test:unit           # Testes unitarios
npm run test:integration    # Testes de integracao
```

---

## Changelog V7.1.0 (2026-04-16/17)

### Agente IA — Prompt Reescrito
- Prompt completamente reescrito para humanizacao e profissionalismo
- Tom formal e cordial (medico/engenheiro), sem girias
- Pergunta obrigatoria: "tecnico ou cliente final?" antes de qualquer diagnostico
- Perfil tecnico: terminologia avancada (load average, page faults, swap thrashing, etc)
- Perfil leigo: linguagem simples mas formal
- Transparencia total: sempre cita nome exato do comando/skill antes de executar
- Exemplos rigidos removidos — Opus 4.6 tem liberdade para variar respostas
- Suporte a `[DISPOSITIVO_RECONECTADO]` — nao repete saudacao

### Agente IA — Loop Autonomo
- Profundidade ilimitada (while true) — investiga ate resolver
- Historico completo no loop (tool results adicionados ao history)
- Safeguard reformulado: nunca forca skills, apenas nudge (max 2)
- Tracking de skills executadas para evitar repeticao
- max_tokens aumentado de 1024 para 2048
- Compatibilidade com OpenAI (max_completion_tokens para modelos GPT-5.x)

### Agente IA — Conhecimento Android
- Particoes read-only (/, /vendor, /product) documentadas no prompt
- Load average vs CPU idle explicado (D-state)
- Orientacao para usar SHELL_SAFE quando skills retornam dados genericos

### Execucao — Zero Autorizacao
- TODAS as travas de autorizacao removidas (server + frontend)
- Agente executa tudo automaticamente: diagnostico, reparo, destrutivos
- Sem pending state, sem confirmation gate, sem "digite OK"
- Actions do servidor retornam sempre [] (tudo executa server-side)

### Frontend — Deduplicacao e Reconexao
- Removido broadcast de chat_response do endpoint HTTP (evita mensagem duplicada)
- Reconexao reutiliza mesmo session ID (preserva memoria da IA)
- state.previousSessionId e state.knownDevices para tracking
- Terminal status: "pronto" em vez de "aguardando..."
- Logging de broadcast: quantos clientes receberam cada mensagem

### Deteccao de Dispositivo
- Corrigido: agente dizia "sem dispositivo" quando sensores estavam em zero
- Agora verifica 3 sinais: sensor data, context.device, adb.isConnected()
- Estado intermediario: "dispositivo conectado, telemetria carregando"

### Servidor
- Broadcast logging: conta clientes por chat_response
- Compatibilidade OpenAI: max_completion_tokens para GPT-5.x+
