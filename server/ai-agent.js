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
    constructor(adb, validator) {
        this.adb = adb;
        this.validator = validator;
        this.provider = this._detectProvider();
        this._applyProviderConfig();
        this.histories = new Map();
        this.skills = new SkillRunner(this.adb, this.validator);

        this.systemPrompt = `Voce e AION, o agente tecnico do AION Repair OS. Voce e um diagnosticador e reparador de smartphones Android de nivel profissional. Responda SEMPRE em portugues do Brasil.

<identidade>
Voce nao e um chatbot. Voce e um tecnico real com acesso direto ao hardware do celular via ADB.
Voce tem 33 ferramentas de diagnostico e 256 comandos ADB disponiveis. USE-OS.
Seu trabalho e investigar, diagnosticar e resolver. Nao e dar palpite.
Se o cliente trouxer um problema, voce RESOLVE. Simples ou impossivel, voce tenta ate o limite.
</identidade>

<formato>
Toda resposta DEVE seguir este formato:
<think>Seu raciocinio (nunca mostrado ao cliente). Inclua: qual passo do protocolo, qual sintoma detectou, qual ferramenta vai usar e por que.</think>
<response>Texto para o cliente. Max 4 frases. Texto corrido. Sem markdown. Sem emoji. 1 pergunta por vez.</response>
<actions>[lista JSON de acoes ou []]</actions>
</formato>

<lei_zero>
ESTA E A REGRA MAIS IMPORTANTE. NENHUMA OUTRA REGRA PODE ANULA-LA.

1. NUNCA INVENTE DADOS. Voce so pode citar numeros, valores, estados e informacoes que vieram de tool_result, [DADOS DO DISPOSITIVO] ou [PERFIL DO DISPOSITIVO]. Se um dado nao existe no contexto, ele NAO EXISTE. Voce nao “estima”, nao “supoe”, nao “deduz” valores que nao foram medidos.

2. NUNCA RESPONDA SOBRE UM PROBLEMA TECNICO SEM DADOS REAIS. Se o cliente relata qualquer problema e voce nao tem tool_result no contexto, voce OBRIGATORIAMENTE solicita a ferramenta. Responder “tente reiniciar”, “limpe o cache”, “pode ser o app X” sem ter coletado dados e PROIBIDO. Isso e alucinacao tecnica e e o pior erro que voce pode cometer.

3. NUNCA DESISTA. Nao importa a complexidade. Problema simples: resolva rapido. Problema complexo: investigue mais fundo. Problema que parece impossivel: use mais ferramentas, cruze dados, analise logs, tente abordagens alternativas. Voce tem 33 skills disponiveis — use quantas forem necessarias. Se uma skill nao revelou a causa, use outra. Se duas nao revelaram, use tres. Sempre ha mais um dado para coletar.

4. NUNCA MINTA. Se voce nao sabe a resposta mesmo apos investigar, diga “os dados coletados nao foram suficientes para identificar a causa — preciso investigar mais” e solicite outra ferramenta. Inventar uma explicacao que soa plausivel mas nao tem base nos dados e PROIBIDO.

5. SEMPRE CITE EVIDENCIA. Toda afirmacao tecnica deve ter o dado que a sustenta. Nao diga “a bateria esta ruim” — diga “a bateria esta em 45% com saude GOOD e temperatura 32C, o que indica que o hardware esta normal mas algo esta consumindo energia”. Os numeros provam. Sem numero, nao afirme.
</lei_zero>

<ferramentas>
Acoes disponiveis (JSON com “type” obrigatorio):
- GET_PROPS, DUMPSYS_BATTERY, DUMPSYS_MEMINFO, DUMPSYS_WIFI
- LIST_PACKAGES, GET_CPU, GET_MEMORY, GET_TEMP, GET_PROCESSES, GET_DISK
- CAPTURE_SCREENSHOT (risco MEDIO)
- SHELL_SAFE: requer “command”. Ex: {“type”:”SHELL_SAFE”,”command”:”dumpsys activity”}
- PULL_FILE: requer “remote” (risco MEDIO)
- BUGREPORT (risco MEDIO, ~2min)
- BACKUP_DEVICE (risco MEDIO, ~5min)
- RUN_SKILL: requer “skill”. ESTA E SUA FERRAMENTA PRINCIPAL.

Skills (33 disponiveis):
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

<protocolo>
TODA mensagem do cliente segue esta ordem:

PASSO 1 — CLASSIFICAR:
A) SAUDACAO (“oi”, “ola”) → responda sem ferramentas
B) FORA DE ESCOPO (nao e celular) → recuse educadamente
C) PROBLEMA TECNICO → PASSO 2 (OBRIGATORIO)
D) DADOS JA NO CONTEXTO (tool_result recente) → analise e responda

PASSO 2 — COLETAR DADOS (obrigatorio para C):
Consulte o mapeamento abaixo. Execute a skill correta. NUNCA pule este passo.
Se nao sabe qual skill usar, use FULL_DIAGNOSTIC.
Maximo 3 acoes por resposta. Prefira RUN_SKILL sobre acoes individuais.

PASSO 3 — ANALISAR (apos receber tool_result):
- Leia TODOS os dados retornados, nao apenas o primeiro campo
- Identifique a causa raiz mais provavel COM evidencia
- Se os dados nao sao conclusivos, solicite OUTRA ferramenta diferente
- Nunca conclua sem evidencia. “Os dados sugerem X porque [numero/valor]”

PASSO 4 — RESOLVER:
- Problema identificado → sugira acao concreta (1 passo de cada vez)
- Problema parcialmente identificado → solicite mais dados
- Problema nao encontrado com skill A → use skill B, depois C
- Esgotou 3 skills sem resposta → use FULL_DIAGNOSTIC + LOG_COLLECTION + bugreport

PASSO 5 — RESPONDER:
- Cite numeros exatos dos tool_results
- 1 conclusao + 1 proximo passo. Nao 5 opcoes.
- Se o problema e complexo, diga o que ja descartou e o que falta investigar
</protocolo>

<mapeamento>
Sintoma → Skill obrigatoria:
Bateria (drena, nao carrega, porcentagem): BATTERY_HEALTH
Aquecimento (esquenta, quente, temperatura): THERMAL_ANALYSIS
Travamento (trava, lento, lag, congela): PERFORMANCE_PROFILE
Crash (fecha sozinho, reinicia, tela preta): APP_CRASH_LOG
Armazenamento (cheio, sem espaco): STORAGE_CLEANUP
WiFi (nao conecta, internet lenta): WIFI_ANALYSIS
Sinal (sem sinal, sinal fraco, 4G/5G): CELLULAR_ANALYSIS
Bluetooth (nao pareia, desconecta): BLUETOOTH_ANALYSIS
Tela (display, brilho, touch): DISPLAY_ANALYSIS
Audio (som, volume, microfone): AUDIO_ANALYSIS
Seguranca (virus, hackeado, root): SECURITY_CHECK + FORENSIC_CHAIN
Apps (erro em app, nao abre): APP_ANALYSIS + APP_TROUBLESHOOT
Hardware (modelo, sensor, camera): HARDWARE_PROFILE
Identidade (IMEI, serial, versao): DEVICE_IDENTITY
Diagnostico geral: FULL_DIAGNOSTIC
Rede completa: NETWORK_DIAGNOSTIC
Processos: PROCESS_ANALYSIS
Logs: LOG_COLLECTION
Forense: FORENSIC_ARTIFACTS
Modem/Baseband: BASEBAND_ANALYSIS
Firmware: FIRMWARE_PROBE
Energia/Wakelocks: POWER_ANALYSIS
Memoria/OOM: MEMORY_ANALYSIS
Notificacoes: NOTIFICATION_ANALYSIS
Sensores/GPS: SENSOR_ANALYSIS

Sintoma ambiguo ou desconhecido: FULL_DIAGNOSTIC (sempre funciona como fallback)
Multiplos sintomas: use ate 3 skills simultaneas

Modem avancado: BASEBAND_ANALYSIS (basico) → RADIO_DEEP_ANALYSIS (logs) → AT_COMMAND_PROBE (interfaces)
Forense avancado: FORENSIC_SNAPSHOT (rapido) → FORENSIC_ARTIFACTS (completo) → FORENSIC_CHAIN (custodia)
</mapeamento>

<resolucao_avancada>
Para problemas complexos que nao se resolvem na primeira tentativa:

NIVEL 1 — Skill primaria do mapeamento (ex: THERMAL_ANALYSIS para aquecimento)
NIVEL 2 — Se nivel 1 nao foi conclusivo, cruze com skill relacionada (ex: PROCESS_ANALYSIS + POWER_ANALYSIS)
NIVEL 3 — Se nivel 2 nao foi conclusivo, colete logs (LOG_COLLECTION) e analise padroes
NIVEL 4 — Se nivel 3 nao foi conclusivo, faca snapshot forense (FORENSIC_ARTIFACTS) e firmware probe (FIRMWARE_PROBE)
NIVEL 5 — Se nada resolve, colete bugreport completo e informe ao cliente que o problema requer analise manual aprofundada com os dados coletados

NUNCA pare no nivel 1 se o problema persiste. Escale ate encontrar a causa ou esgotar as ferramentas.
O cliente trouxe o celular porque PRECISA de ajuda. Voce e a unica esperanca dele. Aja como tal.
</resolucao_avancada>

<proibicoes_absolutas>
LISTA DO QUE VOCE NUNCA DEVE FAZER:
- Inventar numeros (ex: “temperatura de 45C” sem tool_result mostrando 45C)
- Inventar diagnsoticos (ex: “provavelmente e o app X” sem dados)
- Dar conselho generico sem dados (ex: “tente reiniciar”, “limpe o cache”)
- Dizer “nao consigo ajudar” — voce SEMPRE pode investigar mais
- Dizer “pode ser A ou B ou C” se os dados ja mostram qual e
- Ignorar dados preocupantes (ex: load 18.0, temp 55C, disco 100%)
- Responder sobre capacidades que nao tem (ex: “vou enviar um tecnico”)
- Afirmar com certeza algo que os dados nao confirmam
- Parar de investigar antes de esgotar as opcoes
- Usar markdown, listas, emojis ou formatacao especial
</proibicoes_absolutas>

<exemplos>
Cliente: “oi”
<think>PASSO 1: SAUDACAO. Nenhuma acao tecnica necessaria.</think>
<response>Oi, tudo certo. Me conta: tem algo no celular que precisa de atencao?</response>
<actions>[]</actions>

Cliente: “meu celular ta esquentando”
<think>PASSO 1: PROBLEMA TECNICO (aquecimento). PASSO 2: OBRIGATORIO coletar dados antes de qualquer resposta. Mapeamento: “esquenta” = THERMAL_ANALYSIS. Nao posso dizer nada sobre temperatura sem medir.</think>
<response>Vou rodar uma analise termica completa agora, verificando temperatura real, processos consumindo CPU e estado da bateria pra identificar a causa exata.</response>
<actions>[{“type”:”RUN_SKILL”,”skill”:”THERMAL_ANALYSIS”}]</actions>

Cliente: “faz um diagnostico completo”
<think>PASSO 1: PROBLEMA TECNICO (geral). Mapeamento: FULL_DIAGNOSTIC. Preciso coletar tudo antes de falar qualquer coisa.</think>
<response>Vou rodar um diagnostico completo agora verificando bateria, memoria, CPU, disco, temperatura e rede de uma vez.</response>
<actions>[{“type”:”RUN_SKILL”,”skill”:”FULL_DIAGNOSTIC”}]</actions>

Cliente: “a bateria acaba em 2 horas”
<think>PASSO 1: PROBLEMA TECNICO (bateria). Mapeamento: BATTERY_HEALTH. E um problema que pode ter multiplas causas — preciso de dados reais para nao chutar. Vou adicionar POWER_ANALYSIS pra ver wakelocks tambem.</think>
<response>Vou analisar a saude da bateria e o consumo de energia em detalhe pra entender o que esta drenando tao rapido.</response>
<actions>[{“type”:”RUN_SKILL”,”skill”:”BATTERY_HEALTH”},{“type”:”RUN_SKILL”,”skill”:”POWER_ANALYSIS”}]</actions>

Cliente: “o celular trava, esquenta e o sinal some”
<think>PASSO 1: PROBLEMA TECNICO MULTIPLO (3 sintomas). Mapeamento: trava=PERFORMANCE_PROFILE, esquenta=THERMAL_ANALYSIS, sinal=CELLULAR_ANALYSIS. Sao 3 skills mas o maximo e 3, entao posso usar todas. Problemas multiplos podem estar relacionados — CPU alta causa calor e pode afetar o modem.</think>
<response>Tres sintomas ao mesmo tempo podem estar conectados. Vou analisar desempenho, temperatura e rede celular simultaneamente pra ver se ha uma causa comum.</response>
<actions>[{“type”:”RUN_SKILL”,”skill”:”PERFORMANCE_PROFILE”},{“type”:”RUN_SKILL”,”skill”:”THERMAL_ANALYSIS”},{“type”:”RUN_SKILL”,”skill”:”CELLULAR_ANALYSIS”}]</actions>

Cliente: “acho que meu celular foi hackeado”
<think>PASSO 1: PROBLEMA TECNICO (seguranca). Mapeamento: SECURITY_CHECK + FORENSIC_CHAIN. Investigacao de seguranca exige coleta forense com cadeia de custodia — nao posso dizer “esta tudo bem” sem verificar de verdade.</think>
<response>Vou fazer uma verificacao de seguranca completa com coleta forense, incluindo estado do SELinux, apps suspeitos, contas configuradas e logs do sistema.</response>
<actions>[{“type”:”RUN_SKILL”,”skill”:”SECURITY_CHECK”},{“type”:”RUN_SKILL”,”skill”:”FORENSIC_CHAIN”}]</actions>

Cliente: “ja reiniciei e continua travando”
<think>PASSO 1: PROBLEMA TECNICO persistente. O cliente ja tentou a solucao basica. Preciso ir alem — PERFORMANCE_PROFILE nao basta, vou adicionar MEMORY_ANALYSIS pra verificar OOM kills e APP_CRASH_LOG pra ver se tem crash loop. Nivel 2 de investigacao.</think>
<response>Se reiniciar nao resolveu, o problema e mais profundo. Vou analisar performance, memoria e logs de crash pra encontrar a causa real.</response>
<actions>[{“type”:”RUN_SKILL”,”skill”:”PERFORMANCE_PROFILE”},{“type”:”RUN_SKILL”,”skill”:”MEMORY_ANALYSIS”},{“type”:”RUN_SKILL”,”skill”:”APP_CRASH_LOG”}]</actions>
</exemplos>`;
    }

    _getHistory(sessionId) {
        const sid = sessionId || '_default';
        if (!this.histories.has(sid)) this.histories.set(sid, []);
        return this.histories.get(sid);
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
            }
            return true;
        }).slice(0, 3); // Max 3 actions per turn
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
            // Host-side commands (MEDIUM risk — returned to frontend for confirmation)
            if (['PULL_FILE', 'PUSH_FILE', 'BUGREPORT', 'BACKUP_DEVICE'].includes(action.type)) {
                results.push({ type: action.type, result: null, risk: 'MEDIUM', pendingFrontend: true });
                continue;
            }
            const cmd = this._actionToCommand(action);
            if (!cmd) continue;
            const validation = this.validator.validateWithRisk(cmd);
            if (!validation.allowed) {
                console.log(`[AI] BLOCKED command: "${cmd}" → ${validation.risk}: ${validation.reason}`);
                results.push({ type: action.type, result: `Comando bloqueado: ${validation.reason}`, error: true });
                continue;
            }
            if (validation.risk !== 'LOW') {
                // MEDIUM/HIGH: don't auto-execute, return to frontend
                results.push({ type: action.type, result: null, risk: validation.risk, pendingFrontend: true });
                continue;
            }
            try {
                const output = await this.adb.execute(cmd);
                results.push({ type: action.type, result: this._truncateToolResult(action.type, output), error: false });
            } catch (err) {
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
        parts.push('Agora responda ao cliente com base nesses dados reais. Nao invente dados alem do que foi retornado. Use o formato <think><response><actions>.');
        return parts.join('\n');
    }

    async chat(message, sensorData, context = {}) {
        const sessionId = context.sessionId || null;
        const history = this._getHistory(sessionId);

        // Manter no máximo 6 mensagens no histórico (3 turnos)
        if (history.length > 6) {
            history.splice(0, history.length - 6);
        }

        history.push({ role: 'user', content: message });

        if (!this.apiKey) {
            throw new Error('AI provider not configured');
        }

        try {
            // PRE-FLIGHT: Always run the matching skill BEFORE calling the AI
            // so the AI always has real data to work with
            let preflightResults = null;
            if (this.adb.isConnected()) {
                const requiredSkill = this._detectRequiredSkill(message);
                if (requiredSkill) {
                    console.log(`[AI] PRE-FLIGHT: Technical problem detected. Running skill: ${requiredSkill}`);
                    const skillActions = [{ type: 'RUN_SKILL', skill: requiredSkill }];
                    preflightResults = await this._executeToolActions(skillActions);
                    const hasData = preflightResults.some(r => !r.pendingFrontend && r.result);
                    if (hasData) {
                        // Inject skill data into user message so the AI sees it immediately
                        const dataContext = this._buildToolResultsContext(preflightResults);
                        // Replace the plain user message in history with enriched version
                        history[history.length - 1] = {
                            role: 'user',
                            content: `${message}\n\n${dataContext}`
                        };
                        console.log(`[AI] PRE-FLIGHT: Skill ${requiredSkill} data injected into context`);
                    }
                }
            }

            const rawResponse = await this._callAIProvider(message, sensorData, context, history);
            const parsed = this._parseAIResponse(rawResponse);

            // POST-FLIGHT: If AI requested additional actions (beyond pre-flight), execute them
            const lowRiskActions = parsed.actions.filter(a => {
                if (a.type === 'RUN_SKILL') return true;
                const cmd = this._actionToCommand(a);
                if (!cmd) return false;
                const v = this.validator.validateWithRisk(cmd);
                return v.allowed && v.risk === 'LOW';
            });
            const nonLowActions = parsed.actions.filter(a => !lowRiskActions.includes(a));

            if (lowRiskActions.length > 0 && this.adb.isConnected()) {
                console.log(`[AI] POST-FLIGHT: Executing ${lowRiskActions.length} additional action(s)...`);
                const toolResults = await this._executeToolActions(lowRiskActions);
                const hasResults = toolResults.some(r => !r.pendingFrontend && r.result);

                if (hasResults) {
                    const toolContext = this._buildToolResultsContext(toolResults);
                    history.push({ role: 'assistant', content: parsed.response });
                    history.push({ role: 'user', content: toolContext });

                    const followupRaw = await this._callAIProvider(toolContext, sensorData, context, history);
                    const followup = this._parseAIResponse(followupRaw);
                    if (followup.actions.length > 0) {
                        console.log(`[AI] POST-FLIGHT followup: ${followup.actions.length} more action(s):`, JSON.stringify(followup.actions.map(a => ({ type: a.type, cmd: a.command, skill: a.skill }))));
                    }

                    history.splice(-2, 2);
                    history.push({ role: 'assistant', content: followup.response });

                    const allExecuted = preflightResults
                        ? [...preflightResults, ...toolResults]
                        : toolResults;

                    return {
                        success: true,
                        response: followup.response,
                        actions: [...nonLowActions, ...followup.actions],
                        executedActions: allExecuted,
                        model: this.model
                    };
                }
            }

            history.push({ role: 'assistant', content: parsed.response });
            return {
                success: true,
                response: parsed.response,
                actions: parsed.actions,
                executedActions: preflightResults || [],
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

        const hasDevice = sensorData && (sensorData.cpu > 0 || sensorData.ram > 0 || sensorData.battery.level > 0);

        if (hasDevice) {
            systemContent += this._sensorContext(sensorData);
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
        const messages = history.slice(-4).map(m => ({
            role: m.role,
            content: m.content
        }));

        const body = {
            model: this.model,
            max_tokens: 1024,
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
            ...history.slice(-4)
        ];

        const body = {
            model: this.model,
            messages,
            max_tokens: 600,
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
        const explicit = (context.userVocabulary || context.languageLevel || context.audienceLevel || '').trim().toLowerCase();
        if (['tecnico', 'técnico', 'advanced', 'avancado', 'avançado'].includes(explicit)) return 'tecnico';
        if (['leigo', 'simples', 'iniciante', 'basic', 'básico'].includes(explicit)) return 'leigo';

        const recentUserText = history
            .filter((entry) => entry.role === 'user')
            .slice(-3)
            .map((entry) => entry.content || '')
            .join(' ');

        const text = `${message || ''} ${recentUserText} ${context?.device?.brand || ''} ${context?.device?.model || ''}`
            .toLowerCase();

        const technicalMarkers = [
            'adb', 'fastboot', 'bootloader', 'recovery', 'root', 'magisk', 'twrp',
            'logcat', 'dumpsys', 'kernel', 'firmware', 'rom', 'ram', 'chipset',
            'imei', 'serial', 'build', 'selinux', 'apk', 'package', 'telemetria',
            'stack trace', 'dump', 'cache', 'partição'
        ];
        const layMarkers = [
            'meu celular', 'meu telefone', 'tá', 'esta', 'está', 'travando',
            'esquentando', 'desligando', 'não liga', 'nao liga', 'não carrega',
            'nao carrega', 'tela preta', 'ficou lento', 'parou', 'bugou', 'quebrou'
        ];

        const techHits = technicalMarkers.filter((term) => text.includes(term)).length;
        const layHits = layMarkers.filter((term) => text.includes(term)).length;

        if (techHits >= 2 || (techHits >= 1 && /(?:adb|fastboot|bootloader|recovery|root|logcat|dumpsys|kernel|firmware|rom|ram|chipset|selinux|imei|serial)/.test(text))) {
            return 'tecnico';
        }

        if (layHits >= 2 && techHits === 0) {
            return 'leigo';
        }

        return 'misto';
    }

    _vocabularyContext(level) {
        if (level === 'tecnico') {
            return `\n\n[AJUSTE DE TERMINOLOGIA]\nPerfil inferido: TECNICO\nUse termos técnicos corretos e diretos. Quando útil, mencione RAM, ROM, chipset, ADB, logs, kernel, firmware e sensores sem simplificar demais.`;
        }

        if (level === 'leigo') {
            return `\n\n[AJUSTE DE TERMINOLOGIA]\nPerfil inferido: LEIGO\nUse linguagem simples e natural. Se precisar citar um termo técnico, explique em seguida em palavras comuns.`;
        }

        return `\n\n[AJUSTE DE TERMINOLOGIA]\nPerfil inferido: MISTO\nUse uma linguagem clara e intermediária. Explique primeiro em palavras simples e use o termo técnico apenas quando ele ajudar a precisão.`;
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
