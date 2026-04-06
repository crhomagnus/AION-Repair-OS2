# CamilaV2 — Registro de Contexto do Projeto

**Projeto:** CamilaV2 — Assistente Virtual WhatsApp para Telemedicina
**Cliente:** Dr. Márcio Silva Moreira
**Repositório:** github.com/crhomagnus/camila-v2
**Versão atual:** RicardoV2.53
**Última atualização:** 2026-04-04 09:30 BRT

---

## ⚠ REGRA OBRIGATÓRIA DE VERSIONAMENTO — LEIA ANTES DE QUALQUER ALTERAÇÃO

**A cada alteração no workflow ou arquivos relacionados, OBRIGATORIAMENTE:**

1. **Salvar o JSON completo da versão** como `versoes/RicardoV2.XX.json` (cópia integral do workflow naquele estado exato)
2. **Salvar documentação da versão** em `versoes/RicardoV2.XX.md` (changelog, o que mudou, por que mudou, quais nodes foram afetados)
3. **Atualizar** `RicardoV2.json` (versão corrente no root)
4. **Atualizar** este `CONTEXTO_PROJETO.md` (versão atual, histórico, seção 11)
5. **Commit + push para GitHub** — garantir que tudo esteja na nuvem, não apenas local
6. **Tag git** com o número da versão (`git tag v2.XX`)

**Motivação:** Se ocorrer uma falha catastrófica (como a da sessão v2.50), basta fazer deploy da versão anterior salva em `versoes/` — resolução em 1 minuto em vez de horas refazendo trabalho perdido.

**Estrutura obrigatória:**
```
versoes/
  RicardoV2.49.json    ← JSON completo do workflow
  RicardoV2.49.md      ← Changelog da versão
  RicardoV2.50.json
  RicardoV2.50.md
  ...
```

**NUNCA pule esta regra. NUNCA faça alteração sem salvar a versão completa no GitHub.**

---

## 1. Visão Geral

Ricardo é uma assistente virtual que atende clientes automaticamente via WhatsApp no consultório do Dr. Márcio Silva Moreira (telemedicina). Ela conduz o fluxo completo de atendimento: recepciona, coleta dados, faz triagem, informa valores, agenda consulta, gera laudo em PDF e envia pelo WhatsApp. Quando o médico precisa intervir manualmente numa conversa, a Ricardo silencia automaticamente naquele chat específico por 1 hora.

---

## 2. Stack Tecnológica

| Componente | Versão/Detalhes | Função |
|-----------|----------------|--------|
| **n8n** | v2.12.3, self-hosted Docker, porta 5678 | Orquestrador do workflow |
| **Z-API** | Instância `3E6E8552356F41FDA2E8DE15508E14D9` | Gateway WhatsApp |
| **DeepSeek V3** | Modelo `deepseek-chat`, temp 0.75, max 150 tokens, topP 0.9, freqPen 0.4, presPen 0.3 | LLM da Ricardo |
| **PostgreSQL** | 15-alpine, porta 5434 | Memória de conversa, takeover, mapeamento LID |
| **Supabase** | Projeto `CamilaV2.00` (twllrnhqsyowdxegpvai) | Histórico externo (chat_memory_laudos) |
| **Docker Compose** | Orquestra postgres, n8n, redis, evolution | Infraestrutura local |
| **ngrok** | Túnel temporário para expor n8n | Webhook URL pública (temporário) |
| **Evolution API** | v2.2.3 (atendai/evolution-api) | Abandonada — Baileys incompatível |
| **Redis** | 7-alpine | Cache da Evolution API (sem uso real) |
| **PDF.co** | Community node n8n | Geração de laudos PDF |
| **Brave Search** | Community node n8n | Busca (não funcional — node não reconhecido) |

---

## 3. Arquitetura do Workflow (64 nós, ID: UuaCXgePGFth05zi)

### 3.1 Fluxo principal (9 etapas da Ricardo — v2.30+)
1. Primeiro contato — cumprimentar, perguntar nome
2. Entender necessidade — pra quem, finalidade, histórico INSS
3. Verificar interesse — agora ou futuro (se futuro, despede-se gentilmente)
4. Informar valor — R$ 200, perguntar se aceita
5. Explicar como funciona — sem pagamento antecipado, Dr. Márcio faz o laudo, foto primeiro, PIX depois, Ricardo não recebe pagamento
6. Coleta clínica — queixas, tempo, medicamentos, tratamentos, cirurgias, limitações
7. Documentos médicos — exames, receitas, laudos anteriores
8. Dados sensíveis — nome completo, CPF, endereço (só após confiança construída)
9. Confirmação final — recapitula, dispara SERVICO DE CRIACAO DE LAUDO INICIADO

### 3.2 Fluxo de Human Takeover
```
Webhook1 → Detectar fromMe → IF fromMe?
  ├─ true → Check Bot Message → IF é Médico?
  │           ├─ true (não é bot) → Registrar Takeover (1h) → FIM
  │           └─ false (é bot) → FIM (ignora)
  └─ false → Verificar Takeover Ativo → Merge Takeover Check → IF Takeover Ativo?
              ├─ active=0 → Wait1 → [fluxo normal da Ricardo]
              └─ active>0 → STOP (silencia)
```

### 3.3 Nós críticos
- **Webhook1**: Recebe POST do Z-API em `/webhook/webhook`
- **Detectar fromMe**: Code node JS — detecta fromMe e extrai phone/messageId
- **Check Bot Message**: Postgres — verifica se messageId está em bot_messages
- **IF é Médico?**: IF node — is_bot == 0 (loose) = é médico
- **Registrar Takeover**: Postgres — INSERT com COALESCE para resolver LID→phone
- **Verificar Takeover Ativo**: Postgres — COUNT WHERE expires_at > NOW()
- **Merge Takeover Check**: Merge combineByPosition + includeUnpaired
- **Z-API — Enviar Texto**: HTTP POST para Z-API send-text
- **Salvar Bot MessageId**: Postgres — INSERT messageId em bot_messages
- **AI Agent**: Conversational agent com DeepSeek e Postgres Chat Memory

---

## 4. Tabelas PostgreSQL

```sql
-- Memória de conversa do AI Agent
chat_memory (id, session_id, message)

-- Controle de takeover por telefone
human_takeover (phone PK, expires_at, created_at)

-- MessageIds das respostas automáticas da Ricardo
bot_messages (message_id PK, created_at)

-- Mapeamento WhatsApp LID → número real
lid_phone_map (lid PK, phone, updated_at)

-- Debug temporário (pode ser removido)
debug_webhook (id SERIAL, payload TEXT, created_at)
```

---

## 5. Credenciais e Configurações

### Z-API
- **Instância:** `3E6E8552356F41FDA2E8DE15508E14D9`
- **Token:** `A087AE25C6B8B2CE433FB5DF`
- **Client-Token:** `F645e72e6fc044d94a2b1aabd556bf3c4S`
- **Base URL:** `https://api.z-api.io/instances/{inst}/token/{token}/`
- **receiveCallbackSentByMe:** `true` (ativado em 2026-04-02)
- **receivedCallbackUrl:** URL do ngrok atual + `/webhook/webhook`

### n8n
- **Encryption Key:** `6SHQk2Nejx5Yb5hLBthb4HKtyLR/4UpP`
- **Workflow ID:** `UuaCXgePGFth05zi`
- **Porta:** 5678
- **API Key:** JWT no banco (tabela user_api_keys)

### Supabase
- **Host:** twllrnhqsyowdxegpvai.supabase.co
- **Service Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3bGxybmhxc3lvd2R4ZWdwdmFpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTA5MzA1NCwiZXhwIjoyMDkwNjY5MDU0fQ.WKNgzo7UBp-S8QNeSvTy5IzqzRDObEgAvDrSy_SpiUU`
- **Tabela:** chat_memory_laudos

### Números
- **Ricardo (business):** 555599500062
- **Dr. Márcio (pessoal):** 5555997154983 (Z-API format: 555597154983)
- **LID do Dr. Márcio:** 72808403042512

---

## 6. Histórico de Problemas e Soluções

### v2.10 — 2026-04-02 ~00:00 BRT — Human Takeover Inicial
**Problema:** Implementação inicial do takeover não funcionava.
**Causa:** Múltiplos bugs encadeados.
**Status:** Base para as correções seguintes.

### v2.11–v2.12 — 2026-04-02 ~00:30 BRT — Lógica Invertida + Tipo
**Problema 1:** IF Takeover Ativo? tinha saídas true/false invertidas — Ricardo parava para todos.
**Solução:** Trocar conexões do IF.
**Problema 2:** Postgres retornava inteiro 0, IF comparava com string "0" em modo strict.
**Solução:** Mudar para comparação numérica com `typeValidation: loose`.

### v2.14–v2.15 — 2026-04-02 ~01:00 BRT — Dados do Webhook Perdidos
**Problema:** Nó Postgres de verificação substituía todo o JSON com `{active: 0}`. O Switch não encontrava `body.text.message`, AI Agent nunca rodava.
**Solução v2.15:** Code node "Restaurar Dados Originais" — timeout de 300s no JS Task Runner com payloads grandes (base64 audio).
**Solução v2.17:** Arquitetura de Merge paralelo — webhook alimenta Postgres E Merge simultaneamente, preservando dados.

### v2.14 — 2026-04-02 ~01:00 BRT — Referência a Nó Não Executado
**Problema:** `Edit Fields5` referenciava `$('Code in JavaScript1')` que não rodava na branch rápida do Merge.
**Solução:** Trocado para `$('Extrair Contato (Webhook)1').item.json.pushName`.

### v2.18 — 2026-04-02 ~01:30 BRT — Evolution API Baileys
**Problema:** Evolution API v2.2.3 com Baileys — WebSocket incompatível com protocolo atual do WhatsApp. Não conseguia conectar.
**Decisão:** Abandonada. Voltamos ao Z-API.

### v2.19 — 2026-04-02 ~02:00 BRT — fromMe Nunca Detectado
**Problema:** Z-API não enviava webhook para mensagens enviadas do dispositivo (`fromMe: true`).
**Causa:** Configuração `receiveCallbackSentByMe: false` no Z-API.
**Solução:** `PUT /update-notify-sent-by-me` com `{notifySentByMe: true}`.

### v2.23 — 2026-04-02 ~03:10 BRT — Ricardo Se Auto-Silenciava
**Problema:** Quando Ricardo respondia via Z-API, o webhook `fromMe:true` da resposta dela registrava takeover indevidamente. Ricardo silenciava após a primeira resposta.
**Causa:** `receiveCallbackSentByMe` envia webhook para TODAS as mensagens enviadas, incluindo as da API.
**Solução:** Tabela `bot_messages` salva `messageId` de cada resposta da Ricardo. Nó `Check Bot Message` verifica se o `messageId` está na tabela. Se está → é a Ricardo → ignora. Se não → é o médico → registra takeover.
**Nós adicionados:** `Salvar Bot MessageId`, `Check Bot Message`, `IF é Médico?`

### v2.24 — 2026-04-02 ~03:30 BRT — WhatsApp LID vs Phone
**Problema:** Quando médico digitava no celular da Ricardo, Z-API enviava LID (`72808403042512`) em vez do phone (`555597154983`). Takeover registrava para o LID, mas mensagens do cliente vinham com phone — não batiam.
**Causa:** WhatsApp migrou para Linked Identity (LID) em alguns contatos.
**Solução:** Tabela `lid_phone_map` mapeia LID→phone. Populada via `GET /chats` do Z-API. Queries SQL usam `COALESCE((SELECT phone FROM lid_phone_map WHERE lid = X), X)` para resolver automaticamente.

### v2.25 — 2026-04-02 ~04:00 BRT — Versão Produção Takeover
**Alteração:** Timer de takeover definido em 60 minutos (produção).
**Teste real:** 27 execuções, 100% corretas. Takeover funciona, timer reinicia, expira corretamente, outros clientes não são afetados.

### v2.26 — 2026-04-02 ~04:15 BRT — Registro de Contexto
**Alteração:** Criação do CONTEXTO_PROJETO.md e tags versionadas v2.00 a v2.26.
**Repositório renomeado:** `ricardo-v2.00` → `ricardo-v2` (nome fixo, versão nas tags).

### v2.27 — 2026-04-02 ~04:30 BRT — Nova Persona Humanizada
**Problema:** Ricardo soava robótica: "Prazer em conhecê-lo", blocos de texto longos, sem empatia, perguntas acumuladas.
**Solução — Parâmetros DeepSeek otimizados:**
- Temperatura: 1.3 → 0.75 (consistente mas natural)
- Max tokens: 300 → 150 (mensagens curtas de WhatsApp)
- Top P: 0.95 → 0.9
- Frequency penalty: 0.3 → 0.4 (menos repetição)
- Presence penalty: 0 → 0.3 (mais diversidade)
**Solução — System prompt reescrito:**
- Tom de mulher brasileira de 28 anos, simpática e profissional
- Empatia obrigatória quando cliente relata sofrimento ("nossa", "poxa", "sinto muito")
- Expressões naturais alternadas: "tá bom", "beleza", "ah sim", "olha"
- Máximo 2 frases por mensagem, 1 pergunta por vez
- Fonte de referência: livro "The Art of Prompt Engineering for DeepSeek AI" (Yash Jain, 2025) + yuv.ai/learn/deepseek

### v2.28 — 2026-04-02 ~04:40 BRT — Flexibilidade e Strip de Linhas
**Problema 1:** DeepSeek gerava `\n\n` entre frases → mensagens vazias no WhatsApp.
**Solução:** Nó `Gatilho (SERVICO INICIADO)` agora faz `.replace(/\n{2,}/g, ' ').trim()` antes de enviar ao Z-API.
**Problema 2:** Ricardo insistia 3x pedindo nome quando cliente não respondia direto.
**Solução:** Regra de flexibilidade: se não disser o nome, seguir a conversa e pegar depois.
**Problema 3:** Quando cliente dava muitas informações de uma vez, Ricardo não reconhecia.
**Solução:** Regra: se o cliente já respondeu algo espontaneamente, não perguntar de novo.

### v2.29 — 2026-04-02 ~04:50 BRT — Anti-Repetição e Etapas Obrigatórias
**Problema 1:** Ricardo repetiu "Quais são suas principais queixas?" 3 vezes seguidas quando cliente fez perguntas sobre preço.
**Solução:** Regra 4: NUNCA repetir mesma pergunta. Se cliente desviou, responder e esperar.
**Problema 2:** Com cliente direto, Ricardo pulava explicação do serviço e ia direto pra documentos.
**Solução:** Regra 8: NUNCA pular etapas, mesmo com cliente direto.
**Problema 3:** Ricardo emendava pergunta após responder dúvida do cliente.
**Solução:** Regra 9: responder e PARAR, não emendar.

### v2.30 — 2026-04-02 ~05:10 BRT — Fluxo Completo 9 Etapas
**Melhoria:** Reescrita completa do fluxo de atendimento com 9 etapas:
- Etapa 3 (nova): Verifica se cliente quer agora ou futuro. Se futuro → despedida gentil.
- Etapa 4 (nova): Informa valor R$ 200 e pergunta se aceita ANTES de coletar dados.
- Etapa 5 (expandida): Explica papel da Ricardo vs Dr. Márcio em detalhes:
  - Ricardo é atendente, coleta info, NÃO faz laudo, NÃO recebe pagamento
  - Dr. Márcio faz laudo pessoalmente, envia foto do laudo pronto
  - Cliente vê o laudo e só então paga via PIX
  - Dr. Márcio entra em contato diretamente após aceitação
- Etapa 8: Dados sensíveis (CPF, endereço) só no final, após confiança construída
- Etapa 9: Recapitula tudo antes do disparo do gatilho
**Teste completo:** Conversa com "Luciana" — 9/9 etapas funcionaram perfeitamente.

### v2.43 — 2026-04-03 ~00:30 BRT — Fix Query Gatilho
**Problema:** Nó "Execute a SQL query" buscava de `chat_memory_laudos` (Supabase) que não existia no Postgres local.
**Solução:** Query corrigida para buscar de `chat_memory` local com `session_id = '=' || phone`.

### v2.44 — 2026-04-03 ~02:00 BRT — Restauração chat_memory_laudos + Limites Brave Search
**Problema 1:** Tabela `chat_memory_laudos` não existia no PostgreSQL local.
**Solução:** Tabela criada localmente com mesma estrutura original (nome_cliente, phone, chat_id, session_id, timestamp_recebido, message, status).
**Problema 2:** Nó "Create a row" ainda era Supabase (API PUT não persiste mudanças em nós).
**Solução:** Convertido para Postgres local via SQL direto no banco.
**Problema 3:** Brave Search retornava 20 resultados × múltiplas iterações = estouro de 131K tokens.
**Solução:** Brave Search count: 20→3, Agente Criativo maxIterations: 200→3 (via SQL direto).
**Nota importante:** Alterações em nós do n8n via API PUT NÃO persistem. Usar SQL direto:
```sql
-- Extrair nodes
SELECT nodes::text FROM workflow_entity WHERE id='UuaCXgePGFth05zi';
-- Modificar com Python e salvar de volta
UPDATE workflow_entity SET nodes = (SELECT pg_read_file('/tmp/nodes_fixed.json'))::jsonb WHERE id = 'UuaCXgePGFth05zi';
-- Reiniciar n8n
docker compose restart n8n
```

### v2.45 — 2026-04-03 ~06:00 BRT — Sincronização JSON ↔ Banco
**Problema:** JSON no GitHub desatualizado — não refletia correções feitas via SQL no banco.
**Solução:** Exportado workflow real do n8n (com todas as correções) para RicardoV2.json.
**Verificado:** Create a row=Postgres ✅, Brave count=3 ✅, maxIterations=3 ✅

### v2.46 — 2026-04-03 ~21:30 BRT — TTS Pronúncia Inteligente + Prompt Esclarecimento + Mensagens Mais Naturais
**Problema 1:** TTS expandia siglas comuns (INSS, BPC, LOAS) que o modelo MiniMax já pronuncia corretamente, causando áudio artificial.
**Solução:** Removidas expansões de INSS, BPC, LOAS, CRM do normalize() no tts-service/server.js. Mantidas apenas siglas que o modelo erra: CREMERS, CFM, CRM-RS, PCD, CMPI.
**Problema 2:** Cliente não entendia que o atendimento com Ricardo NÃO é a consulta médica.
**Solução:** Adicionada ETAPA 1.5 no prompt — na segunda ou terceira mensagem, Ricardo esclarece que está ali só para tirar dúvidas e coletar dados, e que a consulta real é feita pelo Dr. Márcio depois.
**Problema 3:** Mensagens do Ricardo estavam curtas demais, soando não-naturais.
**Solução:** Regra de formato ajustada de "10 a 20 palavras" para "15 a 25 palavras" por frase. Max tokens DeepSeek aumentado de 150→180.
**Problema 4:** Regras de siglas no prompt eram confusas — misturavam comuns e incomuns.
**Solução:** Regras 11-12 reescritas: siglas comuns (CPF, CEP, PDF, PIX, CRM, INSS, BPC, LOAS) ficam como estão; siglas técnicas/incomuns devem ser escritas por extenso no próprio texto. NUNCA forçar pronúncia fonética.
**Problema 5 (fix bônus):** receivedAndDeliveryCallbackUrl no Z-API apontava para tunnel antigo — mensagens não chegavam.
**Solução:** Atualizada para URL do tunnel atual. Script start-tunnel.sh deve ser ajustado futuramente para atualizar ambas as URLs.

### v2.47 — 2026-04-03 ~21:50 BRT — Fix Crítico: Laudo Sem Dados Reais
**Problema:** Laudo gerado vinha sem nome, sem CPF, sem endereço, e as doenças não correspondiam aos dados da conversa real.
**Causa raiz:** A query SQL do gatilho de laudo buscava de `chat_memory_laudos` (tabela auxiliar que ficava vazia após limpeza de memória). O Agente Criativo recebia `historico_completo` vazio e **inventava todos os dados**.
**Solução:**
1. Query SQL (node "Execute a SQL query") alterada para buscar de `chat_memory` — tabela real usada pelo AI Agent, que contém toda a conversa.
2. Code node (node "Code in JavaScript3") adaptado para parsear o formato JSON de `chat_memory` (`{type: "human"/"ai", content: "..."}`) e montar o histórico como `[CLIENTE] texto` / `[RICARDO] texto`.
3. Query usa `session_id = '=' || phone` para compatibilidade com formato de session_id do Postgres Chat Memory.
**Impacto:** Agora o Agente Criativo recebe a conversa real completa e extrai nome, CPF, endereço e patologias dos dados que o cliente efetivamente forneceu.

### v2.48 — 2026-04-03 ~22:15 BRT — Debounce de Anexos em Massa
**Problema:** Quando cliente enviava vários documentos de uma vez, Ricardo respondia a cada um individualmente — comportamento não-humano.
**Solução:** Trailing-edge debounce de 8 segundos no nó `Acquire Lock1`:
1. Cada anexo registra seu timestamp no `$getWorkflowStaticData('global')`
2. Espera 8 segundos
3. Verifica se é o último anexo do batch (nenhum outro veio depois)
4. Se NÃO é o último: retorna `[]` (para o fluxo — não responde)
5. Se É o último: prossegue com contagem total de anexos
6. Se batch > 2: mensagem ao AI Agent diz "cliente enviou N documentos de uma vez, confirme com UMA mensagem"
7. Se 1-2 anexos: comportamento normal
**Tabela auxiliar:** `attachment_queue` criada (para uso futuro de analytics)
**Janela de batch:** 15 segundos — se passar 15s sem anexo, o contador reseta
**Impacto:** Ricardo agora responde uma única vez para envios em massa, como um humano faria.

### v2.49 — 2026-04-04 ~00:00 BRT — Correções de Prompt Baseadas em Testes Automatizados
**Bateria de 26 testes automatizados** via webhook simulado identificou 4 problemas:
**Fix 1 — ETAPA 3 (agora vs futuro):** Tornou obrigatória com template literal. DeepSeek agora pergunta consistentemente "quer resolver agora ou tá pesquisando?". Validado em 3 testes.
**Fix 2 — CRM soletrado:** DeepSeek insiste em soletrar "cê erre eme, erre esse" apesar de instruções no prompt. Solução dupla: (a) prompt usa "Conselho Regional de Medicina" por extenso em vez de CRM-RS; (b) TTS normalize intercepta soletração fonética e converte de volta para sigla legível.
**Fix 3 — Duas perguntas juntas:** Regra 3 reforçada com exemplo específico ("cirurgia e alergia em mensagens SEPARADAS"). Coleta clínica separou perguntas 5 (cirurgia) e 6 (alergia).
**Fix 4 — Temperatura:** Reduzida de 0.75 para 0.4 para melhor aderência às instruções do prompt.
**Problema em aberto — ETAPA 1.5 (esclarecimento):** DeepSeek V3 ignora sistematicamente a instrução de explicar seu papel após receber o nome. Testadas 5 abordagens (prefix prioritário, REGRA ZERO, template literal, fusão com ETAPA 1, temperatura 0.4) — todas falharam. Necessário implementar via código (interceptar resposta após nome e injetar texto).

### v2.50 — 2026-04-04 ~02:00 BRT — Fix Pipeline Laudo (Histórico + Session ID)
**Problema 1:** Query SQL do gatilho buscava de `chat_memory_laudos` (vazia) em vez de `chat_memory` (conversa real). Fix via SQL direto no banco NÃO persistia porque n8n cacheia o workflow ao ativar.
**Solução:** Atualização via API REST do n8n (`PUT /api/v1/workflows/ID`) com payload `{name, nodes, connections, settings: {}}`. Isso força o n8n a recompilar o workflow.
**IMPORTANTE:** Atualizações de nodes via SQL no Postgres NÃO são refletidas nas execuções. Usar SEMPRE a API do n8n para alterações em nodes.
**Problema 2:** `Code in JavaScript3` recebia mensagens com `timestamp_recebido` e `message` como texto simples. Reescrito para parsear formato JSON de `chat_memory` (`{type: "human"/"ai", content: "..."}`).
**Problema 3:** Session_id no `chat_memory` era `=` (vazio) porque o `NORMALIZAR DADOS PARA AI` recebia dados do `Create a row` (INSERT result) que não tinha os campos originais.
**Solução:** `NORMALIZAR` agora usa `$('Acquire Lock1').first().json` para pegar dados diretamente do node que tem phone, senderName, etc.
**Resultado:** Histórico agora chega corretamente ao Agente Criativo com formato `[CLIENTE] texto / [RICARDO] texto`.
**Problema em aberto:** Agente Criativo recebe histórico correto mas não extrai dados (nome, CPF, endereço, patologias) — laudo gerado com identificação vazia e dados genéricos. Necessário investigar prompt do Agente Criativo + cadeia Validador JSON → Adaptador → Gerador HTML.

### v2.53 — 2026-04-04 ~09:30 BRT — Fix CPF + Nome PDF + Guard TTS
**Fix 1 — Nome do PDF:** Campo `name` no PDFco Api faltava prefixo `=` — n8n tratava expressão como texto literal, gerando `Laudo_____json._metadata.pdf`. Corrigido para `=Laudo_{{ $json._metadata?.paciente?.replace(/ /g, '_') || 'Paciente' }}.pdf`.
**Fix 2 — CPF sem formatação:** Gerador HTML renderizava CPF cru. Adicionada `formatCPF()` que converte `12345678900` → `123.456.789-00`.
**Fix 3 — TTS com texto vazio:** Mensagens non-text/status chegavam ao TTS com `agentText=""`, causando erro 500. Guard no `Code in JavaScript2` retorna `[]` quando vazio.
**Lição:** Alterações via SQL no PostgreSQL NÃO são refletidas pelo n8n. Usar `n8n import:workflow` ou API PUT.
**Teste:** Fernanda Souza Costa — PDF `Laudo_Fernanda_Souza_Costa.pdf`, CPF `555.666.777-88`, 4 páginas, enviado ✅.

### v2.52 — 2026-04-04 ~08:00 BRT — Rebuild sobre CamilaV2 + TTS + Voz CharmingLady
**Base:** CamilaV2 original (funcional) importado manualmente pelo Dr. Márcio.
**Melhorias aplicadas sobre a base:**
- Prompt Camila→Ricardo (13035 chars, 9 etapas, ETAPA 1.5, Conselho Regional)
- DeepSeek Chat Model1: temp=0.4, maxTokens=180, topP=0.9, freqPen=0.4, presPen=0.3
- Execute a SQL query: chat_memory_laudos→chat_memory (session_id = '=' || phone)
- Code in JavaScript3: parser JSON para formato chat_memory
- NORMALIZAR DADOS PARA AI: pick/Proxy robusto + fallback $('Acquire Lock1')
- Create a row: mantido Supabase (original)
- Agente Criativo: maxIterations 3→10
- Brave Search/Search1: count=3
- Regra de frases: MÁXIMO→PREFIRA, nunca cortar explicação pela metade
- ETAPA 5: "um por vez"→"agrupe 2-3 por mensagem com sentido completo"
- TTS: nó "Enviar Audio TTS" adicionado (http://tts-service:3456/tts-send)
- Voz: Portuguese_CharmingLady (MiniMax speech-2.8-hd)
**Laudo testado:** Roberto Almeida Souza, 15/15 campos corretos.
**Pendente:** CPF sem formatação no HTML, nome do PDF incorreto (Laudo_____json._metadata.pdf).

### v2.51 — 2026-04-04 ~06:00 BRT — Restauração + Versionamento Obrigatório
**Problema:** Sessão v2.50 destruiu o `NORMALIZAR DADOS PARA AI` ao substituir código robusto (pick/Proxy) por `$('Acquire Lock1').first().json` simplificado. Isso quebrou phone, senderName e session_id do fluxo principal.
**Solução:** Restaurado código v2.49 do NORMALIZAR + adicionado fallback para `$('Acquire Lock1')` no Proxy. Se o `Create a row` (INSERT) não retorna phone, o Proxy busca do Acquire Lock1 automaticamente.
**Fix 2:** maxTokens corrigido de 150→180 (conforme v2.46).
**Nova regra:** Implementado versionamento obrigatório — cada versão salva JSON completo + changelog em `versoes/`. Deploy de rollback em 1 minuto.
**Teste:** session_id = `=5541999990004` (correto), AI Agent respondeu ETAPA 1 OK.

### v2.31 — 2026-04-02 ~05:25 BRT — Monitor de Conversas em Tempo Real
**Ferramenta:** `monitor_camila.sh` para acompanhamento contínuo de conversas reais.
**Comandos:**
- `./monitor_camila.sh ativos` — lista conversas ativas
- `./monitor_camila.sh ver PHONE` — mostra conversa completa
- `./monitor_camila.sh ao-vivo PHONE` — acompanha em tempo real (poll 10s)
- `./monitor_camila.sh resumo` — resumo do dia (conversas, msgs, laudos)
- `./monitor_camila.sh ultimas N` — últimas N mensagens

---

## 7. Problema em Aberto

### URL Pública — RESOLVIDO (v2.37)
**Solução:** Cloudflare Tunnel como serviço systemd (`camila-tunnel.service`).
**Como funciona:**
- `cloudflared tunnel --url http://localhost:5678` roda como serviço
- Se cair, reinicia automaticamente (`Restart=always`)
- Quando reinicia, captura nova URL e atualiza Z-API webhook automaticamente
- Script: `/home/king/nobilis-n8n/tunnel-service/start-tunnel.sh`
- Log: `/var/log/camila-tunnel.log`
- URL atual salva em: `/tmp/camila-tunnel-url.txt`
**Limitação:** URL muda a cada restart (ex: `xxx.trycloudflare.com`), mas Z-API é atualizado automaticamente.
**Para URL fixa permanente:** necessário domínio no Cloudflare (futuro).

### Atualizar lid_phone_map
A tabela precisa ser atualizada quando novos contatos aparecem. Criar rotina periódica ou atualizar no webhook quando um LID desconhecido chegar.

---

## 10. Rotina de Monitoramento Contínuo

**Início:** 2026-04-03
**Horário:** 17:00-18:00 BRT (horário de pico)
**Duração:** 1 hora/dia, durante 1 mês
**Método:**
1. `./monitor_camila.sh ativos` → escolher 1-2 conversas
2. `./monitor_camila.sh ao-vivo PHONE` → acompanhar em tempo real
3. Identificar acertos e falhas no prompt
4. Micro-ajustes no system prompt e parâmetros DeepSeek
5. Documentar alterações aqui

---

## 11. Versionamento

| Versão | Tag Git | Descrição |
|--------|---------|-----------|
| v2.00 | `v2.00` | Setup inicial — workflow base + Docker |
| v2.01-v2.09 | `v2.01`-`v2.09` | Credenciais, modelo, prompt XML |
| v2.10-v2.17 | `v2.10`-`v2.17` | Human takeover + correções de bugs |
| v2.18-v2.22 | `v2.18`-`v2.22` | Evolution API, testes autônomos, fromMe |
| v2.23 | `v2.23` | Bot messages — distingue médico de Ricardo |
| v2.24 | `v2.24` | LID→phone mapping |
| v2.25 | `v2.25` | Takeover 60 min (produção) |
| v2.26 | `v2.26` | CONTEXTO_PROJETO.md + tags versionadas |
| v2.27 | `v2.27` | Nova persona humanizada + DeepSeek otimizado |
| v2.28 | `v2.28` | Strip \\n\\n + flexibilidade nome + reconhece info |
| v2.29 | `v2.29` | Anti-repetição + etapas obrigatórias |
| v2.30 | `v2.30` | Fluxo 9 etapas, confiança progressiva, papel Ricardo vs Dr. Márcio |
| v2.31 | `v2.31` | Monitor de conversas em tempo real |
| v2.32 | `v2.32` | Documentação completa atualizada |
| v2.33 | `v2.33` | TTS MiniMax (substituiu Fish Audio) + normalização de texto para voz |
| v2.34 | `v2.34` | Modelo de voz definido (d84c7e3...) — substituído |
| v2.35 | `v2.35` | Modelo voz Carlinha (descartado) |
| v2.36 | `v2.36` | TTS integrado: Portuguese_RationalMan speed 0.9 + microserviço + ffmpeg |
| v2.37 | `v2.37` | Cloudflare Tunnel estável com auto-update Z-API |
| v2.38 | `v2.38` | Normalização completa texto→voz |
| v2.39 | `v2.39` | Prompt otimizado para voz, zero abreviações |
| v2.40 | `v2.40` | Números por extenso, siglas soletradas |
| v2.41 | `v2.41` | Persona Ricardo + MiniMax TTS Portuguese_RationalMan |
| v2.42 | `v2.42` | lid_phone_map cron, errorWorkflow fix, renomear arquivos |
| v2.43 | `v2.43` | Fix query gatilho: chat_memory_laudos → chat_memory local |
| v2.44 | `v2.44` | chat_memory_laudos restaurada no PostgreSQL local + limites Brave Search |
| v2.45 | `v2.45` | JSON sincronizado com banco: Create a row Postgres, Brave count=3, maxIter=3 |
| v2.46 | `v2.46` | TTS: siglas comuns sem expansão, incomuns por extenso. Prompt: ETAPA 1.5 esclarecimento, frases 15-25 palavras, max_tokens 180 |
| v2.47 | `v2.47` | Fix laudo: query busca chat_memory (real) em vez de chat_memory_laudos (vazia). Parser adaptado para formato JSON do AI Agent |
| v2.48 | `v2.48` | Debounce anexos: 8s trailing edge — múltiplos anexos geram UMA resposta. Usa $getWorkflowStaticData |
| v2.49 | `v2.49` | Fix prompt: ETAPA 3 obrigatória, CRM não soletrado (TTS normalize), 1 pergunta por vez, temp 0.4 |
| v2.50 | `v2.50` | Fix pipeline laudo: SQL query→chat_memory, Code JS3 parseia JSON, NORMALIZAR usa $('Acquire Lock1'), session_id correto |
| v2.51 | `v2.51` | Restauração NORMALIZAR (pick/Proxy + fallback Acquire Lock1), maxTokens 180, versionamento obrigatório |
| v2.52 | `v2.52` | Rebuild CamilaV2 + melhorias v2.27-v2.49 + TTS CharmingLady + laudo 15/15 |
| v2.53 | `v2.53` | Fix CPF formatado, nome PDF correto, guard TTS vazio |

**Regra de commit:** A cada alteração, incrementar versão, salvar JSON completo em `versoes/`, criar tag, renomear workflow no n8n, atualizar este documento, push para GitHub.

---

## 12. Integração TTS — Voz da Ricardo (em implementação)

### Decisão
**Serviço escolhido:** MiniMax (substituiu Fish Audio) (melhor custo-benefício: ~R$ 240/mês para 3.600 min)
**API Key:** `b4992dcde7a34ecc9c8babc922185023`
**Voz escolhida:** Modelo final (escolhido pelo Dr. Márcio) — ID: `d84c7e351cde4d81ad5ed1d88ec1453c`
  - Tags: female, young, educational, calm, clear, professional, gentle, Portuguese
  - 148 likes no MiniMax (substituiu Fish Audio)

### Fluxo planejado
```
Ricardo gera texto → Normalizar texto para voz → MiniMax (substituiu Fish Audio) TTS (MP3)
→ ffmpeg converte MP3→OGG OPUS → Z-API send-audio → WhatsApp como mensagem de voz
```

### Normalização de texto para voz
Antes de enviar ao MiniMax (substituiu Fish Audio), o texto precisa ser limpo:

| Tipo | Regra | Exemplo |
|------|-------|---------|
| Comuns (TTS sabe) | Manter | CPF, CEP, CRM, PIX, PDF |
| Siglas menos comuns | Expandir nome completo | INSS → Instituto Nacional de Seguridade Social |
| Símbolos | Escrever por extenso | R$ 200 → duzentos reais |
| Abreviações | Expandir | Dr. → Doutor, nº → número |
| Siglas raras | Expandir | BPC → Benefício de Prestação Continuada, LOAS → Lei Orgânica da Assistência Social |
| Pontuação | Espaços duplos entre frases para pausas | "Frase um.  Frase dois." |

### Custo estimado
- 30 clientes/dia × 20 mensagens × ~6 min/cliente = 3.600 min/mês
- ~2,7 milhões de caracteres/mês
- MiniMax (substituiu Fish Audio): ~$41/mês (~R$ 240)

### Modelos testados
1. `5661bf8cb97740fcb10d2f756abf7779` — Isabela (jovem, suave) — descartada
2. `148da69cf74b4530b1c41d5c1e87c688` — Mulher comum (conversacional) — descartada
3. `ea3bf7f7c7af4b59be4715013e1c4428` — Mita (conversacional, expressiva) — descartada
4. `ceaf7f569bef42c7bd322d88e3a356b7` — Mulher do Criativo top (calma, profissional) — descartada
5. `767ca9e6962a4bce99538eb3b54e008f` — Carlinha (suave, íntima) — descartada
6. `d84c7e351cde4d81ad5ed1d88ec1453c` — descartado (boa voz mas não superou Carlinha)
7. `767ca9e6962a4bce99538eb3b54e008f` — Carlinha speed 1.1 — descartada (inconsistente entre gerações)
8. `2368250f3e6c46f691956f0523425b72` — Portuguese_RationalMan speed 0.9 — substituído
9. **Portuguese_CharmingLady — MODELO ATUAL (v2.52)** — MiniMax speech-2.8-hd

### Microserviço TTS (tts-service)
Container Docker (`tts-service/Dockerfile`) com Node.js + ffmpeg.
Endpoint: `POST http://tts-service:3456/tts-send` com `{text, phone}`.
Faz: normalização → MiniMax (substituiu Fish Audio) (MP3) → ffmpeg (OGG Opus 64k) → Z-API send-audio.
No workflow n8n: nó "Enviar Audio TTS" (HTTP Request) chama o microserviço.

### Status
- Modelo de voz Portuguese_RationalMan aprovado ✅
- Microserviço TTS integrado no Docker Compose ✅
- Normalização automática (R$→extenso, INSS→nome completo) ✅
- Workflow n8n envia respostas como áudio automaticamente ✅
- Testado end-to-end: cliente envia texto → Ricardo responde com voz ✅

---

## 8. Script de Testes (`test_ricardo.sh`)

```bash
./test_ricardo.sh reset          # Zera memória (PostgreSQL + Supabase)
./test_ricardo.sh send PHONE MSG # Simula cliente enviando mensagem
./test_ricardo.sh pause PHONE N  # Pausa Ricardo por N minutos
./test_ricardo.sh unpause        # Remove takeover imediatamente
./test_ricardo.sh last           # Mostra última execução
```

---

## 9. Comandos Úteis

```bash
# Status Z-API
curl -s "https://api.z-api.io/instances/3E6E8552356F41FDA2E8DE15508E14D9/token/A087AE25C6B8B2CE433FB5DF/status" -H "Client-Token: F645e72e6fc044d94a2b1aabd556bf3c4S"

# Config webhooks Z-API
curl -s "https://api.z-api.io/instances/3E6E8552356F41FDA2E8DE15508E14D9/token/A087AE25C6B8B2CE433FB5DF/me" -H "Client-Token: F645e72e6fc044d94a2b1aabd556bf3c4S"

# Atualizar webhook URL no Z-API
curl -s -X PUT ".../update-webhook-received" -H "Client-Token: ..." -d '{"value":"NOVA_URL/webhook/webhook"}'

# Popular lid_phone_map
curl -s ".../chats" -H "Client-Token: ..." | python3 -c "... parse e INSERT ..."

# Logs n8n
docker logs nobilis-n8n-n8n-1 --tail=50

# Execuções recentes
docker compose exec -T postgres psql -U n8n -d n8n -c "SELECT id, EXTRACT(EPOCH FROM (\"stoppedAt\"-\"startedAt\")) as secs, status FROM execution_entity ORDER BY id DESC LIMIT 10;"

# Verificar takeover
docker compose exec -T postgres psql -U n8n -d n8n -c "SELECT * FROM human_takeover;"

# Importar workflow
docker cp CamilaV2.json nobilis-n8n-n8n-1:/tmp/ && docker compose exec -T n8n n8n import:workflow --input=/tmp/CamilaV2.json

# Atualizar workflow via API
curl -X PUT "http://localhost:5678/api/v1/workflows/UuaCXgePGFth05zi" -H "X-N8N-API-KEY: $KEY" -d @payload.json
```
