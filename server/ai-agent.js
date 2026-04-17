const https = require('https');
const SkillRunner = require('./skills');

const VALID_ACTION_TYPES = [
    'GET_PROPS', 'DUMPSYS_BATTERY', 'DUMPSYS_MEMINFO', 'DUMPSYS_WIFI',
    'LIST_PACKAGES', 'GET_CPU', 'GET_MEMORY', 'GET_TEMP',
    'GET_PROCESSES', 'GET_DISK', 'CAPTURE_SCREENSHOT', 'SHELL_SAFE',
    'RUN_SKILL',
    // Host-side commands
    'PULL_FILE', 'PUSH_FILE', 'BUGREPORT', 'BACKUP_DEVICE'
];

const DEFAULT_DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-reasoner';
const DEFAULT_OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'qwen/qwen3.6-plus';
const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-6';
const ANTHROPIC_API_VERSION = '2023-06-01';

class AiAgent {
    constructor(adb, validator, broadcast, store) {
        this.adb = adb;
        this.validator = validator;
        this.broadcast = broadcast || (() => {});
        this.store = store || null;
        this.provider = this._detectProvider();
        this._applyProviderConfig();
        this.histories = new Map();
        this.skills = new SkillRunner(this.adb, this.validator, this.broadcast);

        this.systemPrompt = `Voce e AION, tecnico de smartphones Android. Responda SEMPRE em portugues do Brasil.

<quem_voce_e>
Voce e um tecnico senior de smartphones. Profissional, competente, serio. Voce fala com educacao e clareza — como um engenheiro ou medico fala com um paciente. Nao usa girias, nao fala "mano", "beleza", "e ai", "meto a mao", "rolar", "detonar", "foda", "parada". Voce e um profissional adulto em ambiente de trabalho.

Tom correto: "Bom dia, prazer. Sou o AION, tecnico responsavel." / "Identifiquei o problema." / "Vou executar uma analise."
Tom ERRADO: "E ai, beleza!" / "Ja meto a mao na massa!" / "Achei coisa feia aqui" / "Bora resolver"

Voce e cordial mas formal. Fala portugues correto, frases bem construidas, vocabulario profissional. Pode ser humano e acessivel sem ser informal. Um tecnico de confianca que inspira credibilidade.

Voce tem acesso direto ao hardware via ADB: 33 ferramentas de diagnostico, 256 comandos. Seu trabalho e investigar, diagnosticar e resolver.

Voce tem personalidade mas ela se manifesta na competencia, na clareza das explicacoes e na seguranca com que conduz o trabalho — nao em girias ou informalidade.
</quem_voce_e>

<autonomia>
EXECUCAO TECNICA: 90% protocolo + 10% julgamento proprio.
As ferramentas e o mapeamento de sintomas sao seu guia principal, mas voce pode usar seu conhecimento tecnico pra decidir caminhos alternativos quando fizer sentido. Se voce acha que uma abordagem diferente vai ser mais eficiente, siga seu instinto tecnico.

CONVERSACAO: 70% protocolo + 30% personalidade.
Nas conversas sem comando tecnico (saudacoes, perguntas, explicacoes, comentarios), voce tem liberdade pra falar como voce. Varie suas frases. Nao repita a mesma estrutura. Reaja ao contexto. Se o cliente esta preocupado, tranquilize. Se esta irritado, seja direto e eficiente. Se esta curioso, explique com gosto.

NUNCA fale igual duas vezes. Cada resposta deve soar como se fosse a primeira vez que voce diz aquilo.
</autonomia>

<formato>
Toda resposta DEVE seguir este formato:
<think>Seu raciocinio interno (nunca mostrado ao cliente). O que voce observou, o que vai fazer, por que.</think>
<response>Texto para o cliente. Texto corrido. Sem markdown. Sem emoji. Maximo 4 frases. Natural, como se estivesse falando pessoalmente.</response>
<actions>[lista JSON de acoes ou []]</actions>
</formato>

<conhecimento_android>
CUIDADO COM df -h: As particoes /, /vendor, /product, /system SEMPRE mostram 100% porque sao READ-ONLY (imagens do sistema). Isso e NORMAL e NAO significa que o armazenamento do usuario esta cheio. O armazenamento real do usuario e a particao /data (geralmente em /dev/block/dm-XX montado em /data). Se a skill retorna "disco 100%", verifique se nao esta lendo uma particao de sistema. Use 'df -h /data' para ver o armazenamento real.

LOAD AVERAGE ALTO COM CPU IDLE: Se o load average e alto (ex: 18) mas 'top' mostra CPU 80%+ idle, o problema NAO e CPU. Sao processos em D-state (uninterruptible sleep) — geralmente drivers do kernel, binder contention ou I/O wait. Nao confunda load average com uso de CPU.

SKILLS QUE RETORNAM DADOS GENERICOS: Se uma skill retornar dados rasos ou resumidos demais, use SHELL_SAFE com comandos especificos em vez de repetir a mesma skill. Nunca rode a mesma skill duas vezes esperando resultado diferente.
</conhecimento_android>

<regras_tecnicas>
1. NUNCA INVENTE DADOS. Voce so cita numeros que vieram de tool_result, [DADOS DO DISPOSITIVO] ou [PERFIL DO DISPOSITIVO]. Se nao mediu, nao existe.

2. NUNCA RESPONDA SOBRE PROBLEMA TECNICO SEM DADOS. Se o cliente reporta um problema e voce nao tem tool_result, voce OBRIGATORIAMENTE roda a ferramenta primeiro. Responder “tente reiniciar” sem dados e PROIBIDO.

3. NUNCA DESISTA. Problema simples: resolve rapido. Complexo: investiga mais fundo. Use quantas ferramentas forem necessarias. Se uma nao revelou, use outra. E outra. E outra. Nao tem limite.

4. NUNCA MINTA. Se nao sabe, diz que precisa investigar mais e roda outra ferramenta.

5. CITE EVIDENCIA. Toda afirmacao tecnica precisa do dado que a sustenta.

6. EXECUTE TUDO AUTOMATICAMENTE. Diagnostico, leitura, reparo — tudo executa sem pedir permissao. Voce e o tecnico. NUNCA peca “ok”, “confirma”, “autoriza” ou qualquer forma de permissao ao cliente. NUNCA diga “digite OK”. NUNCA espere autorizacao. Execute e pronto. Inclusive comandos destrutivos como reboot e factory reset — se voce decidiu que e necessario, execute. O cliente confiou o celular a voce.

7. NUNCA PARE NO MEIO. Se os dados mostram que precisa investigar mais, solicite mais ferramentas. O sistema vai executar automaticamente e te devolver os resultados. Continue ate ter uma resposta concreta pro cliente.
</regras_tecnicas>

<ferramentas>
Acoes disponiveis (JSON com “type” obrigatorio):
- GET_PROPS, DUMPSYS_BATTERY, DUMPSYS_MEMINFO, DUMPSYS_WIFI
- LIST_PACKAGES, GET_CPU, GET_MEMORY, GET_TEMP, GET_PROCESSES, GET_DISK
- CAPTURE_SCREENSHOT
- SHELL_SAFE: requer “command”. Ex: {“type”:”SHELL_SAFE”,”command”:”dumpsys activity”}
  Qualquer comando ADB. Inclua “reason” explicando o que faz.
- PULL_FILE: requer “remote”
- BUGREPORT (~2min)
- BACKUP_DEVICE (~5min)
- RUN_SKILL: requer “skill”. SUA FERRAMENTA PRINCIPAL.

Skills (33):
Core: FULL_DIAGNOSTIC, BATTERY_HEALTH, THERMAL_ANALYSIS, STORAGE_CLEANUP
Rede: NETWORK_DIAGNOSTIC, WIFI_ANALYSIS, CELLULAR_ANALYSIS, BLUETOOTH_ANALYSIS, CONNECTIVITY_DEEP
Performance: PERFORMANCE_PROFILE, PROCESS_ANALYSIS, POWER_ANALYSIS, MEMORY_ANALYSIS
Apps: APP_ANALYSIS, APP_CRASH_LOG, APP_TROUBLESHOOT, NOTIFICATION_ANALYSIS
UI: UI_AUTOMATION
Hardware: HARDWARE_PROFILE, DEVICE_IDENTITY, DISPLAY_ANALYSIS, AUDIO_ANALYSIS, SENSOR_ANALYSIS
Seguranca: SECURITY_CHECK
Baseband: BASEBAND_ANALYSIS, MODEM_DIAGNOSTICS, AT_COMMAND_PROBE, RADIO_DEEP_ANALYSIS
Firmware: FIRMWARE_PROBE
Forense: LOG_COLLECTION, FORENSIC_SNAPSHOT, FORENSIC_ARTIFACTS, FORENSIC_CHAIN
</ferramentas>

<eventos_do_sistema>
“[SESSAO_INICIADA]” = Novo cliente conectou o celular pela primeira vez.
Se apresente de forma profissional e cordial. Diga que e o tecnico responsavel, que ja esta conectado ao aparelho, pergunte o nome. DEPOIS de saber o nome, OBRIGATORIAMENTE pergunte:
“O senhor e o proprietario do aparelho ou e um tecnico que esta trazendo o celular de um cliente?”
Essa pergunta e OBRIGATORIA antes de qualquer diagnostico. A resposta define como voce fala pelo resto da sessao:

- CLIENTE FINAL (proprietario, pessoa leiga): Use linguagem simples e acessivel, mas FORMAL e profissional. Explique tudo como se a pessoa nao entendesse de tecnologia. Nada de termos tecnicos sem explicacao. Seja educado, cordial e paciente — como um medico explica um diagnostico a um paciente.
- TECNICO: Mantenha o tom formal mas use terminologia avancada: load average, page faults, swap thrashing, OOM killer, wakelock, I/O wait, ANR traces, dumpsys, logcat verbose. Mostre conhecimento profundo. Fale como colega de profissao com respeito — direto, tecnico, sem simplificar. O tecnico quer dados brutos e analise, nao explicacao basica.

Guarde na memoria da sessao quem e o interlocutor. Se for tecnico, cada resposta deve ter dados tecnicos detalhados. Se for leigo, cada resposta deve ser simples e educada.

“[DISPOSITIVO_RECONECTADO]” = O MESMO aparelho foi desconectado e reconectado durante a sessao.
NAO se apresente de novo. NAO repita a saudacao. NAO pergunte de novo se e tecnico ou cliente. Reconheca a reconexao de forma breve e profissional e mantenha o tom que ja estava usando.

REGRA DE OURO: NUNCA repita a mesma mensagem que ja disse antes nesta sessao. Leia o historico e fale algo NOVO.
</eventos_do_sistema>

<fluxo>
Quando o cliente descreve um problema:
1. Identifique o sintoma e rode a skill correta (veja mapeamento abaixo)
2. Quando receber os resultados, analise TODOS os dados
3. Se precisa de mais dados, rode mais ferramentas (sem limite)
4. Quando tiver certeza, apresente o diagnostico com evidencia
5. Proponha e execute a solucao

REGRA CRITICA DE COMUNICACAO — TRANSPARENCIA TOTAL:
O cliente ve o terminal com os comandos executados em tempo real. Voce DEVE narrar o que esta fazendo de forma transparente. Isso passa seriedade e credibilidade. Cada resposta sua DEVE:

- Dizer O QUE VOCE VIU DE NOVO nos dados que acabou de receber (dado especifico, numero, evidencia)
- Dizer O NOME EXATO DO PROXIMO COMANDO ou SKILL que voce vai executar, POR EXTENSO. Exemplos:
  "Vou executar o comando 'dumpsys cpuinfo' pra puxar o consumo de CPU por processo."
  "Rodando a skill THERMAL_ANALYSIS pra medir a temperatura dos sensores internos."
  "Vou usar o comando 'pm clear com.whatsapp' pra limpar o cache do WhatsApp."
  "Executando 'top -n 1 -b' pra ver em tempo real quais processos estao pesando."
- Dizer POR QUE esta executando esse comando (o que espera descobrir ou resolver)
- NUNCA repetir uma conclusao que voce ja deu. Se o armazenamento ja estava 100% e voce ja disse isso, NAO diga de novo. Avance pro proximo passo.
- Cada mensagem deve ser um PROGRESSO REAL na investigacao, nao uma repeticao do que ja sabe.

ESTA REGRA E INQUEBRAVEL: sempre diga o nome exato do comando/skill antes de executar. Isso vale pra TODAS as situacoes — diagnostico, reparo, limpeza, tudo. O cliente precisa ver que voce sabe o que esta fazendo.

Exemplo de progressao correta:
Turno 1: "Marcio, o load average ta em 18 — processador sobrecarregado. Vou rodar PROCESS_ANALYSIS pra ver qual processo ta causando isso."
Turno 2: "Achei: o com.miui.home ta usando 16% de CPU sozinho e tem 701 tarefas ativas. Vou executar 'dumpsys meminfo com.miui.home' pra ver o consumo de memoria dele."
Turno 3: "Confirmado, o launcher ta com 380MB de RAM — muito acima do normal. Vou limpar o cache dele com 'pm clear com.miui.home' e ver se normaliza."

Exemplo do que NUNCA fazer:
Turno 1: "O armazenamento ta 100% lotado, isso causa travamento."
Turno 2: "Confirmado: armazenamento 100% ocupado, o celular trava por causa disso."  ← ERRADO, repetiu
Turno 3: "O disco ta cheio, isso explica o travamento." ← ERRADO, repetiu de novo

REGRA ABSOLUTA: SE VOCE DIZ QUE VAI RODAR ALGO, INCLUA A ACAO.
Se sua resposta contem "vou rodar", "vou executar", "vou analisar", "vou verificar", "vou puxar" ou qualquer variacao, a lista de <actions> DEVE conter a acao correspondente. Falar que vai fazer e nao incluir a acao e PROIBIDO — e uma promessa vazia que trava o sistema. Se voce mencionou, inclua. Se nao vai incluir, nao mencione.

REGRA DE CONTINUIDADE: Enquanto o problema nao estiver RESOLVIDO (acao concreta executada que corrige o problema), voce DEVE incluir pelo menos 1 acao em <actions>. Actions vazio so e permitido quando:
- O problema foi resolvido e voce esta dando o resultado final
- Voce esta respondendo uma saudacao ou conversa casual
- Voce esta pedindo informacao ao cliente que so ele pode dar

Mapeamento de sintomas:
Bateria: BATTERY_HEALTH | Aquecimento: THERMAL_ANALYSIS | Travamento: PERFORMANCE_PROFILE
Crash/fecha: APP_CRASH_LOG | Armazenamento: STORAGE_CLEANUP | WiFi: WIFI_ANALYSIS
Sinal: CELLULAR_ANALYSIS | Bluetooth: BLUETOOTH_ANALYSIS | Tela: DISPLAY_ANALYSIS
Audio: AUDIO_ANALYSIS | Seguranca: SECURITY_CHECK | Apps: APP_ANALYSIS + APP_TROUBLESHOOT
Hardware: HARDWARE_PROFILE | IMEI/serial: DEVICE_IDENTITY | Geral: FULL_DIAGNOSTIC
Rede: NETWORK_DIAGNOSTIC | Processos: PROCESS_ANALYSIS | Logs: LOG_COLLECTION
Forense: FORENSIC_ARTIFACTS | Modem: BASEBAND_ANALYSIS | Firmware: FIRMWARE_PROBE
Energia: POWER_ANALYSIS | Memoria: MEMORY_ANALYSIS | Notificacoes: NOTIFICATION_ANALYSIS
Sensores: SENSOR_ANALYSIS

Nao sabe qual usar? FULL_DIAGNOSTIC. Multiplos sintomas? Ate 3 skills simultaneas.
Problema persistente? Escale: skill primaria → skills cruzadas → logs → forense → bugreport.
Sem limite de profundidade. Va ate resolver.
</fluxo>

<proibicoes>
- Inventar numeros ou diagnosticos sem dados
- Dar conselho generico sem ter medido (“tente reiniciar”, “limpe o cache”)
- Dizer “nao consigo” — sempre pode investigar mais
- Pedir autorizacao, confirmacao ou permissao ao cliente
- Repetir mensagens anteriores
- Falar como robo (mesmas frases, mesma estrutura, tom mecanico)
- Usar markdown, listas, emojis
- Parar de investigar antes de ter resposta concreta
</proibicoes>

Lembre-se: voce e um tecnico humano. Fale como gente. Pense como gente. Trabalhe como gente.`;
    }

    _getHistory(sessionId) {
        const sid = sessionId || '_default';
        if (!this.histories.has(sid)) this.histories.set(sid, []);
        return this.histories.get(sid);
    }

    async _loadHistoryFromStore(sessionId) {
        if (!this.store || !sessionId) return;
        const sid = sessionId;
        if (this.histories.has(sid) && this.histories.get(sid).length > 0) return;
        try {
            const messages = await this.store.getChatHistory(sid, 80);
            if (messages && messages.length > 0) {
                const history = messages.map(m => ({ role: m.role, content: m.content }));
                this.histories.set(sid, history);
                console.log(`[AI] Loaded ${history.length} messages from Supabase for session ${sid}`);
            }
        } catch (err) {
            console.error('[AI] Failed to load history from store:', err.message);
        }
    }

    async _saveMessage(sessionId, role, content) {
        if (!this.store || !sessionId) return;
        this.store.saveChatMessage(sessionId, role, content).catch(err => {
            console.error('[AI] Failed to save message:', err.message);
        });
    }

    _parseAIResponse(rawText) {
        const thinkMatch = rawText.match(/<think>([\s\S]*?)<\/think>/);
        const responseMatch = rawText.match(/<response>([\s\S]*?)<\/response>/);
        const actionsMatch = rawText.match(/<actions>([\s\S]*?)<\/actions>/);

        let response = responseMatch ? responseMatch[1].trim() : rawText.trim();
        let actions = [];
        let reasoning = thinkMatch ? thinkMatch[1].trim() : null;

        // Remove tags from response if fallback (no <response> tags but has other tags)
        if (!responseMatch) {
            response = response
                .replace(/<think>[\s\S]*?<\/think>/g, '')
                .replace(/<actions>[\s\S]*?<\/actions>/g, '')
                .trim();
        }

        if (actionsMatch) {
            try {
                const parsed = JSON.parse(actionsMatch[1].trim());
                if (Array.isArray(parsed)) {
                    actions = this._validateActions(parsed);
                }
            } catch {
                console.log('[AI] Failed to parse actions JSON, ignoring');
            }
        }

        if (reasoning) {
            console.log(`[AI] Reasoning: ${reasoning.substring(0, 200)}`);
        }

        return { response, actions, reasoning };
    }

    _validateActions(actions) {
        return actions.filter(action => {
            if (!action || !action.type) return false;
            if (!VALID_ACTION_TYPES.includes(action.type)) {
                console.log(`[AI] Filtered invalid action type: ${action.type}`);
                return false;
            }
            if (action.type === 'SHELL_SAFE') {
                if (!action.command) return false;
                const validation = this.validator.validateWithRisk(action.command);
                if (!validation.allowed) {
                    console.log(`[AI] Filtered blocked SHELL_SAFE command: ${action.command}`);
                    return false;
                }
                // Tag the action with its risk level for frontend handling
                action.risk = validation.risk;
                action.riskReason = validation.reason;
            }
            return true;
        }).slice(0, 5); // Max 5 actions per turn (increased for deeper investigation)
    }

    // Hook: detect if message describes a technical problem and return required skill
    _detectRequiredSkill(message) {
        const m = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const map = [
            { patterns: ['bateria', 'carrega', 'descarrega', 'drena', 'porcentagem', 'nao liga'], skill: 'BATTERY_HEALTH' },
            { patterns: ['esquent', 'quente', 'superaquec', 'temperatura', 'calor'], skill: 'THERMAL_ANALYSIS' },
            { patterns: ['trava', 'congela', 'lento', 'lag', 'demora', 'lerdo'], skill: 'PERFORMANCE_PROFILE' },
            { patterns: ['fecha sozinho', 'reinicia', 'crash', 'desliga', 'tela preta', 'nao abre'], skill: 'APP_CRASH_LOG' },
            { patterns: ['espaco', 'armazenamento', 'cheio', 'memoria cheia', 'nao instala'], skill: 'STORAGE_CLEANUP' },
            { patterns: ['wifi', 'wi-fi', 'internet lenta', 'nao conecta'], skill: 'WIFI_ANALYSIS' },
            { patterns: ['sinal', '4g', '5g', 'sem rede', 'sem servico', 'ligacao', 'celular nao'], skill: 'CELLULAR_ANALYSIS' },
            { patterns: ['bluetooth', 'pareamento', 'fone bluetooth'], skill: 'BLUETOOTH_ANALYSIS' },
            { patterns: ['tela', 'display', 'brilho', 'touch', 'resolucao'], skill: 'DISPLAY_ANALYSIS' },
            { patterns: ['som', 'volume', 'alto-falante', 'microfone', 'audio'], skill: 'AUDIO_ANALYSIS' },
            { patterns: ['virus', 'hackeado', 'invasao', 'seguranca', 'root', 'malware'], skill: 'SECURITY_CHECK' },
            { patterns: ['diagnostico', 'analisa tudo', 'verifica tudo', 'check completo'], skill: 'FULL_DIAGNOSTIC' },
            { patterns: ['baseband', 'modem', 'imei', 'firmware radio', 'ril'], skill: 'BASEBAND_ANALYSIS' },
            { patterns: ['firmware', 'versao build', 'bootloader', 'kernel', 'particao'], skill: 'FIRMWARE_PROBE' },
            { patterns: ['consumo energia', 'wakelock', 'doze', 'gasta bateria', 'app gasta'], skill: 'POWER_ANALYSIS' },
            { patterns: ['notifica', 'barra de status', 'popup', 'alerta'], skill: 'NOTIFICATION_ANALYSIS' },
            { patterns: ['gps', 'acelerometro', 'giroscopio', 'proximidade', 'sensor'], skill: 'SENSOR_ANALYSIS' },
            { patterns: ['forense', 'pericia', 'investigacao', 'artefato'], skill: 'FORENSIC_ARTIFACTS' },
        ];
        for (const entry of map) {
            if (entry.patterns.some(p => m.includes(p))) return entry.skill;
        }
        return null;
    }

    _actionToCommand(action) {
        const map = {
            'GET_PROPS': 'getprop',
            'DUMPSYS_BATTERY': 'dumpsys battery',
            'DUMPSYS_MEMINFO': 'dumpsys meminfo',
            'DUMPSYS_WIFI': 'dumpsys wifi',
            'LIST_PACKAGES': 'pm list packages',
            'GET_CPU': 'cat /proc/stat',
            'GET_MEMORY': 'cat /proc/meminfo',
            'GET_TEMP': 'cat /sys/class/thermal/thermal_zone*/temp',
            'GET_PROCESSES': 'ps -A',
            'GET_DISK': 'df -h',
            'CAPTURE_SCREENSHOT': 'screencap -p /sdcard/aion_screen.png'
        };
        if (action.type === 'SHELL_SAFE') return action.command;
        return map[action.type] || null;
    }

    _truncateToolResult(actionType, result) {
        if (!result) return '(sem saida)';
        const max = 2000;
        if (actionType === 'GET_PROCESSES' && result.length > max) {
            const lines = result.split('\n');
            return lines.slice(0, 21).join('\n') + `\n... (${lines.length} processos total)`;
        }
        if (actionType === 'LIST_PACKAGES' && result.length > max) {
            const lines = result.split('\n');
            return `Total: ${lines.length} pacotes\n` + lines.slice(0, 30).join('\n') + '\n...';
        }
        if (result.length > max) return result.substring(0, max) + '\n... (truncado)';
        return result;
    }

    async _executeToolActions(actions) {
        const results = [];
        for (const action of actions) {
            if (action.type === 'RUN_SKILL') {
                try {
                    const skillResult = await this.skills.execute(action.skill);
                    results.push({ type: 'RUN_SKILL', skill: action.skill, result: skillResult.summary, error: !skillResult.success });
                } catch (err) {
                    results.push({ type: 'RUN_SKILL', skill: action.skill, result: `Erro na skill: ${err.message}`, error: true });
                }
                continue;
            }
            // Host-side commands — execute directly
            if (['PULL_FILE', 'PUSH_FILE', 'BUGREPORT', 'BACKUP_DEVICE'].includes(action.type)) {
                // These are handled by the typed action dispatcher in index.js
                // Skip here — they'll be routed through the normal action execution
            }
            const cmd = this._actionToCommand(action);
            if (!cmd) continue;
            const validation = this.validator.validateWithRisk(cmd);
            if (!validation.allowed) {
                console.log(`[AI] BLOCKED command: "${cmd}" → ${validation.risk}: ${validation.reason}`);
                results.push({ type: action.type, result: `Comando bloqueado: ${validation.reason}`, error: true });
                continue;
            }
            // All commands execute automatically — agent is fully autonomous
            this.broadcast({ type: 'cmd_start', command: cmd });
            try {
                const output = await this.adb.execute(cmd);
                const truncated = this._truncateToolResult(action.type, output);
                this.broadcast({ type: 'cmd_result', command: cmd, result: truncated.substring(0, 300) });
                results.push({ type: action.type, result: truncated, error: false });
            } catch (err) {
                this.broadcast({ type: 'cmd_result', command: cmd, result: `ERRO: ${err.message}`, isError: true });
                results.push({ type: action.type, result: `Erro: ${err.message}`, error: true });
            }
        }
        return results;
    }

    _buildToolResultsContext(results) {
        const parts = ['[RESULTADOS DAS ACOES EXECUTADAS]'];
        for (const r of results) {
            if (r.pendingFrontend) continue;
            if (r.error) {
                parts.push(`<tool_error type="${r.type}">${r.result}</tool_error>`);
            } else {
                parts.push(`<tool_result type="${r.type}">${r.result}</tool_result>`);
            }
        }
        parts.push('[/RESULTADOS]');
        parts.push('Analise os dados acima e responda ao cliente. Use o formato <think><response><actions>. Se precisa investigar mais, inclua as acoes. Se tem resposta concreta, apresente o diagnostico com evidencia. Fale naturalmente, sem repetir o que ja disse.');
        return parts.join('\n');
    }

    async chat(message, sensorData, context = {}) {
        const sessionId = context.sessionId || null;

        // Load history from Supabase on first call for this session
        await this._loadHistoryFromStore(sessionId);
        const history = this._getHistory(sessionId);

        // Manter no máximo 80 mensagens no histórico (40 turnos)
        if (history.length > 80) {
            history.splice(0, history.length - 80);
        }

        history.push({ role: 'user', content: message });
        await this._saveMessage(sessionId, 'user', message);

        if (!this.apiKey) {
            throw new Error('AI provider not configured');
        }

        try {
            // STEP 1: Call AI — it responds telling the client what it will do
            const rawResponse = await this._callAIProvider(message, sensorData, context, history);
            const parsed = this._parseAIResponse(rawResponse);

            history.push({ role: 'assistant', content: parsed.response });
            await this._saveMessage(sessionId, 'assistant', parsed.response);

            // STEP 2: If AI didn't request actions for a technical problem, force the skill
            if (parsed.actions.length === 0 && this.adb.isConnected()) {
                const requiredSkill = this._detectRequiredSkill(message);
                if (requiredSkill) {
                    console.log(`[AI] HOOK: No actions for technical problem. Adding skill: ${requiredSkill}`);
                    parsed.actions.push({ type: 'RUN_SKILL', skill: requiredSkill });
                }
            }

            // STEP 3: All actions auto-execute — agent is fully autonomous
            const autoActions = parsed.actions;

            // STEP 4: Execute all actions in background (terminal shows them in real-time)
            // The response is returned FIRST so the client sees the explanation immediately
            const executeInBackground = async () => {
                if (autoActions.length === 0 || !this.adb.isConnected()) return;

                this.broadcast({ type: 'phase', phase: 'diagnostic' });
                console.log(`[AI] Executing ${autoActions.length} action(s) in background...`);
                const toolResults = await this._executeToolActions(autoActions);
                const hasResults = toolResults.some(r => !r.pendingFrontend && r.result);

                if (hasResults) {
                    // Autonomous loop: keep investigating until no more actions
                    let currentResults = toolResults;
                    let depth = 1;
                    let safeguardNudges = 0; // prevent infinite safeguard loops
                    const executedSkills = new Set(); // track already-run skills
                    while (true) {
                        const ctx = this._buildToolResultsContext(currentResults);
                        // Add tool results to history so AI sees full conversation including data
                        history.push({ role: 'user', content: ctx });
                        const loopHistory = [...history.slice(-30)];

                        this.broadcast({ type: 'phase', phase: depth === 1 ? 'diagnostic' : 'repair' });
                        const raw = await this._callAIProvider(ctx, sensorData, context, loopHistory);
                        const parsed = this._parseAIResponse(raw);

                        history.push({ role: 'assistant', content: parsed.response });
                        await this._saveMessage(sessionId, 'assistant', parsed.response);

                        console.log(`[AI] Depth ${depth}: broadcasting response (${parsed.response.length} chars, ${parsed.actions.length} actions)`);
                        this.broadcast({
                            type: 'chat_response',
                            response: parsed.response,
                            actions: [],
                            model: this.model
                        });

                        // Check if investigation should continue
                        if (!parsed.actions.length) {
                            const problemSolved = /(pronto|resolvido|normaliz|corrigid|problema.*(era|foi|estava)|conclu[ií]|resultado final|fechado|encerr)/i.test(parsed.response);
                            const askingUser = /(me (diz|fala|conta)|o que (ta|está|voce)|qual (o|seu)|quer que eu|por favor|o senhor)/i.test(parsed.response);

                            if (!problemSolved && !askingUser && safeguardNudges < 2 && depth < 15 && this.adb.isConnected()) {
                                // AI stopped without solving — nudge it to include actions (never force a skill)
                                safeguardNudges++;
                                console.log(`[AI] SAFEGUARD: Investigation incomplete at depth ${depth}, nudging (${safeguardNudges}/2)`);
                                history.push({ role: 'user', content: '[SISTEMA] Voce mencionou que ia executar algo mas nao incluiu a acao. Inclua o comando ou skill EXATO que voce quer rodar em <actions>. Se precisa de um comando shell especifico, use {"type":"SHELL_SAFE","command":"seu comando aqui"}. Se precisa de uma skill, use {"type":"RUN_SKILL","skill":"NOME"}. NAO repita skills que ja rodou — use comandos shell diretos se precisar de dados mais especificos.' });
                                continue;
                            } else {
                                // Agent is genuinely done (solved, asking user, or safeguard exhausted)
                                break;
                            }
                        }
                        if (!this.adb.isConnected()) break;

                        depth++;
                        // Track executed skills to prevent loops
                        for (const a of parsed.actions) {
                            if (a.type === 'RUN_SKILL' && a.skill) executedSkills.add(a.skill);
                        }
                        console.log(`[AI] Depth ${depth}: executing ${parsed.actions.length} action(s)... (skills used: ${[...executedSkills].join(', ')})`);
                        this.broadcast({ type: 'phase', phase: 'diagnostic' });
                        currentResults = await this._executeToolActions(parsed.actions);
                        const hasData = currentResults.some(r => !r.pendingFrontend && r.result);
                        if (!hasData) break;
                    }
                    console.log(`[AI] Investigation complete after ${depth} depth(s)`);
                }

                this.broadcast({ type: 'phase', phase: 'idle' });
            };

            // Fire and forget — actions run after response is sent
            executeInBackground().catch(err => {
                console.error('[AI] Background execution error:', err.message);
            });

            return {
                success: true,
                response: parsed.response,
                actions: [], // All actions execute server-side — nothing pending for frontend
                model: this.model
            };
        } catch (err) {
            const errorMsg = err.message || 'Unknown error';
            console.error(`[AI] ${this.providerLabel} API error:`, errorMsg);

            // Return a structured error instead of crashing
            if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
                throw new Error('O provedor de IA demorou demais para responder. Tente novamente em alguns segundos.');
            }
            if (errorMsg.includes('429') || errorMsg.includes('rate limit')) {
                throw new Error('Limite de requisições atingido no provedor de IA. Aguarde um momento.');
            }
            if (errorMsg.includes('401') || errorMsg.includes('403')) {
                throw new Error('Chave de API inválida ou sem permissão. Verifique a configuração.');
            }
            if (errorMsg.includes('500') || errorMsg.includes('502') || errorMsg.includes('503')) {
                throw new Error('O provedor de IA está temporariamente indisponível. Tente novamente.');
            }
            throw err;
        }
    }

    _detectProvider() {
        const explicit = (process.env.AI_PROVIDER || '').trim().toLowerCase();
        if (['deepseek', 'openrouter', 'anthropic'].includes(explicit)) {
            return explicit;
        }

        if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_MODEL) {
            return 'anthropic';
        }

        if (process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_MODEL) {
            return 'openrouter';
        }

        if (process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_MODEL) {
            return 'deepseek';
        }

        return 'anthropic';
    }

    _applyProviderConfig() {
        const p = this.provider;
        if (p === 'anthropic') {
            this.apiKey = process.env.ANTHROPIC_API_KEY || '';
            this.model = process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
            this.apiBaseUrl = process.env.ANTHROPIC_API_BASE_URL || 'https://api.anthropic.com';
            this.providerLabel = 'Anthropic';
            this.extraHeaders = {};
        } else if (p === 'deepseek') {
            this.apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENROUTER_API_KEY || '';
            this.model = DEFAULT_DEEPSEEK_MODEL;
            this.apiBaseUrl = process.env.DEEPSEEK_API_BASE_URL || 'https://api.deepseek.com';
            this.providerLabel = 'DeepSeek';
            this.extraHeaders = {};
        } else {
            this.apiKey = process.env.OPENROUTER_API_KEY || process.env.DEEPSEEK_API_KEY || '';
            this.model = DEFAULT_OPENROUTER_MODEL;
            this.apiBaseUrl = process.env.OPENROUTER_API_BASE_URL || 'https://openrouter.ai/api/v1';
            this.providerLabel = 'OpenRouter';
            this.extraHeaders = {
                'HTTP-Referer': process.env.OPENROUTER_REFERER || 'http://localhost:3001',
                'X-Title': process.env.OPENROUTER_APP_NAME || 'AION Repair OS'
            };
        }
    }

    _inferProviderFromConfig(key, model) {
        const normalizedKey = (key || '').trim();
        const normalizedModel = (model || '').trim().toLowerCase();

        if (normalizedKey.startsWith('sk-ant-')) {
            return 'anthropic';
        }

        if (normalizedKey.startsWith('sk-or-')) {
            return 'openrouter';
        }

        if (normalizedModel.includes('claude') || normalizedModel.includes('opus') || normalizedModel.includes('sonnet') || normalizedModel.includes('haiku')) {
            return 'anthropic';
        }

        if (normalizedModel.includes('/') || normalizedModel.includes('openrouter') || normalizedModel.includes('openai/')) {
            return 'openrouter';
        }

        if (normalizedModel.includes('deepseek')) {
            return 'deepseek';
        }

        return this.provider || this._detectProvider();
    }

    _buildSystemContent(message, sensorData, context, history) {
        let systemContent = this.systemPrompt;
        const vocabularyLevel = this._inferVocabularyLevel(message, context, history);
        systemContent += this._vocabularyContext(vocabularyLevel);

        if (context.device) {
            systemContent += this._deviceProfileContext(context.device);
        }

        const hasSensorData = sensorData && (sensorData.cpu > 0 || sensorData.ram > 0 || sensorData.battery.level > 0);
        const hasDevice = hasSensorData || !!context.device || this.adb.isConnected();

        if (hasSensorData) {
            systemContent += this._sensorContext(sensorData);
        } else if (hasDevice) {
            systemContent += `\n\n[DISPOSITIVO CONECTADO — TELEMETRIA AINDA CARREGANDO]\nO dispositivo está conectado via ADB mas os sensores ainda não retornaram dados. O aparelho está acessível para comandos.`;
        } else {
            systemContent += `\n\n[SEM DISPOSITIVO CONECTADO]\nNão há dispositivo Android conectado. Responda de forma curta e indique o próximo passo.`;
        }

        if (context.session) {
            systemContent += `\n\n[MODO DA SESSÃO]\n${context.mode || 'diagnostic'}`;
        }

        return systemContent;
    }

    async _callAIProvider(message, sensorData, context = {}, history = []) {
        const systemContent = this._buildSystemContent(message, sensorData, context, history);

        if (this.provider === 'anthropic') {
            return this._callAnthropic(systemContent, history);
        }

        return this._callOpenAICompatible(systemContent, history);
    }

    async _callAnthropic(systemContent, history) {
        const messages = history.slice(-40).map(m => ({
            role: m.role,
            content: m.content
        }));

        const body = {
            model: this.model,
            max_tokens: 2048,
            system: systemContent,
            messages
        };

        return new Promise((resolve, reject) => {
            const data = JSON.stringify(body);
            const baseUrl = new URL(this.apiBaseUrl);

            const options = {
                hostname: baseUrl.hostname,
                port: baseUrl.port ? parseInt(baseUrl.port, 10) : 443,
                path: '/v1/messages',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey,
                    'anthropic-version': ANTHROPIC_API_VERSION,
                    'Content-Length': Buffer.byteLength(data)
                }
            };

            console.log(`[AI] Calling ${this.providerLabel} (${this.model})...`);

            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', c => body += c);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            const json = JSON.parse(body);
                            // Anthropic Messages API: content is an array of blocks
                            const textBlocks = json.content.filter(b => b.type === 'text');
                            const content = textBlocks.map(b => b.text).join('');

                            if (json.usage) {
                                console.log(`[AI] Tokens — input: ${json.usage.input_tokens}, output: ${json.usage.output_tokens}`);
                            }

                            resolve(content);
                        } catch (e) {
                            reject(new Error('Parse error: ' + body.substring(0, 200)));
                        }
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${body.substring(0, 300)}`));
                    }
                });
            });

            req.on('error', reject);
            req.setTimeout(300000, () => { req.destroy(); reject(new Error('API timeout (>5min) - resposta demorou demais')); });
            req.write(data);
            req.end();
        });
    }

    async _callOpenAICompatible(systemContent, history) {
        const messages = [
            { role: 'system', content: systemContent },
            ...history.slice(-40)
        ];

        const isNewOpenAI = this.model.includes('gpt-5') || this.model.includes('gpt-4.1') || this.model.includes('o3') || this.model.includes('o4');
        const body = {
            model: this.model,
            messages,
            ...(isNewOpenAI ? { max_completion_tokens: 2048 } : { max_tokens: 2048 }),
            temperature: 0.3
        };

        return new Promise((resolve, reject) => {
            const data = JSON.stringify(body);
            const baseUrl = new URL(this.apiBaseUrl);
            const path = `${baseUrl.pathname.replace(/\/$/, '')}/chat/completions`;

            const options = {
                hostname: baseUrl.hostname,
                port: baseUrl.port ? parseInt(baseUrl.port, 10) : 443,
                path,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Length': Buffer.byteLength(data),
                    ...this.extraHeaders
                }
            };

            console.log(`[AI] Calling ${this.providerLabel} (${this.model})...`);

            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', c => body += c);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            const json = JSON.parse(body);
                            let content = json.choices[0].message.content;

                            const reasoning = json.choices[0].message.reasoning_content;
                            if (reasoning && reasoning.length > 0) {
                                console.log('[AI] Reasoning tokens used:', reasoning.length);
                            }

                            resolve(content);
                        } catch (e) {
                            reject(new Error('Parse error: ' + body.substring(0, 200)));
                        }
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${body.substring(0, 300)}`));
                    }
                });
            });

            req.on('error', reject);
            req.setTimeout(300000, () => { req.destroy(); reject(new Error('API timeout (>5min) - resposta demorou demais')); });
            req.write(data);
            req.end();
        });
    }

    _deviceProfileContext(d) {
        if (!d || !d.model) return '';
        const parts = [`\n\n[PERFIL DO DISPOSITIVO - DADOS REAIS]`];
        if (d.brand) parts.push(`Marca: ${d.brand}`);
        if (d.model) parts.push(`Modelo: ${d.model}`);
        if (d.displayName) parts.push(`Nome: ${d.displayName}`);
        if (d.chipset) parts.push(`Chipset: ${d.chipset}`);
        if (d.android) parts.push(`Android: ${d.android}`);
        if (d.androidSdk) parts.push(`API: ${d.androidSdk}`);
        if (d.ramDisplay) parts.push(`RAM: ${d.ramDisplay}`);
        if (d.storageDisplay) parts.push(`Armazenamento: ${d.storageDisplay}`);
        if (d.securityPatch) parts.push(`Patch de segurança: ${d.securityPatch}`);
        if (d.buildId) parts.push(`Build: ${d.buildId}`);
        parts.push(`Estes são os únicos dados confirmados do aparelho. Não invente outros.`);
        return parts.join('\n');
    }

    _sensorContext(s) {
        return `\n\n[DADOS DO DISPOSITIVO EM TEMPO REAL]
CPU: ${s.cpu}% | RAM: ${s.ram}% | GPU: ${s.gpu}%
Temperatura: ${s.temperature}°C
Bateria: ${s.battery.level}% ${s.battery.charging ? '(Carregando)' : '(Descarregando)'}
Armazenamento: ${s.disk}% usado | Memória Flash: ${s.memory}%
Sinal Celular: ${s.signal} dBm
Wi-Fi: ${s.wifi ? 'Conectado' : 'Desconectado'} | Bluetooth: ${s.bluetooth ? 'Ativo' : 'Inativo'} | Câmera: ${s.camera ? 'Disponível' : 'Indisponível'}`;
    }

    _inferVocabularyLevel(message, context = {}, history = []) {
        // Check all user messages for explicit self-identification
        const allUserText = history
            .filter((entry) => entry.role === 'user')
            .map((entry) => entry.content || '')
            .join(' ')
            .toLowerCase();

        const fullText = `${message || ''} ${allUserText}`.toLowerCase();

        // Explicit self-identification (highest priority)
        if (/sou\s*(um\s*)?t[eé]cnico|trabalho\s*com\s*(celular|reparo|assist[eê]ncia)|sou\s*da\s*assist[eê]ncia|colega\s*de\s*profiss/i.test(fullText)) {
            return 'tecnico';
        }
        if (/sou\s*o\s*dono|[eé]\s*meu\s*celular|cliente\s*final|dono\s*do\s*(celular|aparelho)|meu\s*pr[oó]prio/i.test(fullText)) {
            return 'leigo';
        }

        // Technical vocabulary detection
        const technicalMarkers = [
            'adb', 'fastboot', 'bootloader', 'recovery', 'root', 'magisk', 'twrp',
            'logcat', 'dumpsys', 'kernel', 'firmware', 'rom', 'ram', 'chipset',
            'imei', 'serial', 'build', 'selinux', 'apk', 'package', 'telemetria',
            'stack trace', 'dump', 'partição', 'wakelock', 'load average'
        ];
        const layMarkers = [
            'meu celular', 'meu telefone', 'tá', 'esta', 'está', 'travando',
            'esquentando', 'desligando', 'não liga', 'nao liga', 'não carrega',
            'nao carrega', 'tela preta', 'ficou lento', 'parou', 'bugou', 'quebrou'
        ];

        const techHits = technicalMarkers.filter((term) => fullText.includes(term)).length;
        const layHits = layMarkers.filter((term) => fullText.includes(term)).length;

        if (techHits >= 2) return 'tecnico';
        if (layHits >= 2 && techHits === 0) return 'leigo';
        return 'misto';
    }

    _vocabularyContext(level) {
        if (level === 'tecnico') {
            return `\n\n[PERFIL DO INTERLOCUTOR: TECNICO]\nO interlocutor e um tecnico. Fale como colega de profissao com respeito. Use terminologia avancada: load average, page faults, swap thrashing, OOM killer, wakelock, I/O wait, ANR traces, dumpsys, logcat, thermal throttling, ZRAM ratio, LMK thresholds. Mostre dados brutos, numeros exatos, nomes de processos. Seja direto, tecnico e profissional. Mesmo com tecnico, mantenha tom formal e respeitoso — nao use girias.`;
        }

        if (level === 'leigo') {
            return `\n\n[PERFIL DO INTERLOCUTOR: CLIENTE FINAL]\nO interlocutor e o dono do celular, pessoa leiga. Use linguagem simples mas FORMAL e profissional. Explique tudo como se a pessoa nao entendesse de tecnologia. Se citar um termo tecnico, explique em seguida. Seja educado, cordial e paciente — como um medico explica um diagnostico.`;
        }

        return `\n\n[PERFIL DO INTERLOCUTOR: NAO IDENTIFICADO]\nAinda nao sabe se e tecnico ou cliente final. Se ja perguntou e ainda nao obteve resposta, continue com linguagem intermediaria. Se ainda nao perguntou, pergunte.`;
    }

    _quickDiagnosis(s) {
        const issues = [];
        if (s.cpu > 80) issues.push(`CPU alta: ${s.cpu}%`);
        if (s.ram > 85) issues.push(`RAM alta: ${s.ram}%`);
        if (s.temperature > 45) issues.push(`Temperatura alta: ${s.temperature}°C`);
        if (s.battery.level < 20) issues.push(`Bateria baixa: ${s.battery.level}%`);
        if (s.disk > 90) issues.push(`Armazenamento quase cheio: ${s.disk}%`);
        if (s.signal < -100) issues.push(`Sinal fraco: ${s.signal} dBm`);

        if (issues.length === 0) {
            return `Tudo parece normal: CPU ${s.cpu}%, RAM ${s.ram}%, temperatura ${s.temperature}°C, bateria ${s.battery.level}% e armazenamento ${s.disk}%.`;
        }

        return `Problemas detectados: ${issues.join(' · ')}.`;
    }

    setApiKey(key, model = null) {
        this.provider = this._inferProviderFromConfig(key, model || this.model);
        this.apiKey = key;
        if (model) {
            this.model = model;
        } else if (!this.model || this.model === DEFAULT_DEEPSEEK_MODEL || this.model === DEFAULT_OPENROUTER_MODEL || this.model === DEFAULT_ANTHROPIC_MODEL) {
            if (this.provider === 'anthropic') this.model = DEFAULT_ANTHROPIC_MODEL;
            else if (this.provider === 'deepseek') this.model = DEFAULT_DEEPSEEK_MODEL;
            else this.model = DEFAULT_OPENROUTER_MODEL;
        }
        this._applyProviderUrls();
        console.log(`[AI] API key configured for ${this.providerLabel}`);
    }

    setModel(model) {
        if (!model) return;
        this.model = model;
        this.provider = this._inferProviderFromConfig(this.apiKey || '', model);
        this._applyProviderUrls();
    }

    _applyProviderUrls() {
        if (this.provider === 'anthropic') {
            this.apiBaseUrl = process.env.ANTHROPIC_API_BASE_URL || 'https://api.anthropic.com';
            this.providerLabel = 'Anthropic';
            this.extraHeaders = {};
        } else if (this.provider === 'deepseek') {
            this.apiBaseUrl = process.env.DEEPSEEK_API_BASE_URL || 'https://api.deepseek.com';
            this.providerLabel = 'DeepSeek';
            this.extraHeaders = {};
        } else {
            this.apiBaseUrl = process.env.OPENROUTER_API_BASE_URL || 'https://openrouter.ai/api/v1';
            this.providerLabel = 'OpenRouter';
            this.extraHeaders = {
                'HTTP-Referer': process.env.OPENROUTER_REFERER || 'http://localhost:3001',
                'X-Title': process.env.OPENROUTER_APP_NAME || 'AION Repair OS'
            };
        }
    }
    clearSessionHistory(sessionId) {
        if (sessionId) this.histories.delete(sessionId);
    }

    clearHistory() { this.histories.clear(); }
}

module.exports = AiAgent;
