const https = require('https');
const SkillRunner = require('./skills');

const VALID_ACTION_TYPES = [
    'GET_PROPS', 'DUMPSYS_BATTERY', 'DUMPSYS_MEMINFO', 'DUMPSYS_WIFI',
    'LIST_PACKAGES', 'GET_CPU', 'GET_MEMORY', 'GET_TEMP',
    'GET_PROCESSES', 'GET_DISK', 'CAPTURE_SCREENSHOT', 'SHELL_SAFE',
    'RUN_SKILL'
];

class AiAgent {
    constructor(adb, validator) {
        this.adb = adb;
        this.validator = validator;
        this.provider = this._detectProvider();
        this.apiKey = this.provider === 'deepseek'
            ? (process.env.DEEPSEEK_API_KEY || process.env.OPENROUTER_API_KEY || '')
            : (process.env.OPENROUTER_API_KEY || process.env.DEEPSEEK_API_KEY || '');
        this.model = this.provider === 'deepseek'
            ? (process.env.DEEPSEEK_MODEL || 'deepseek-reasoner')
            : (process.env.OPENROUTER_MODEL || 'openai/gpt-oss-120b:free');
        this.apiBaseUrl = this.provider === 'deepseek'
            ? (process.env.DEEPSEEK_API_BASE_URL || 'https://api.deepseek.com')
            : (process.env.OPENROUTER_API_BASE_URL || 'https://openrouter.ai/api/v1');
        this.providerLabel = this.provider === 'deepseek' ? 'DeepSeek' : 'OpenRouter';
        this.extraHeaders = this.provider === 'deepseek'
            ? {}
            : {
                'HTTP-Referer': process.env.OPENROUTER_REFERER || 'http://localhost:3001',
                'X-Title': process.env.OPENROUTER_APP_NAME || 'AION Repair OS'
            };
        this.histories = new Map();
        this.skills = new SkillRunner(this.adb, this.validator);

        this.systemPrompt = `Voce e AION, agente tecnico do AION Repair OS. Especialista calmo, preciso e objetivo em diagnostico e reparo de smartphones Android. Responda SEMPRE em portugues do Brasil.

<formato>
Toda resposta DEVE seguir este formato exato:
<think>Seu raciocinio interno (nunca mostrado ao cliente)</think>
<response>Texto para o cliente (max 4 frases, texto corrido, sem markdown, sem emoji, 1 pergunta por vez)</response>
<actions>[lista de acoes JSON ou vazio []]</actions>
</formato>

<ferramentas>
Voce pode solicitar acoes do sistema. Cada acao e um objeto JSON com “type” obrigatorio.
Acoes disponiveis:
- GET_PROPS: propriedades do sistema (getprop)
- DUMPSYS_BATTERY: status detalhado da bateria
- DUMPSYS_MEMINFO: uso de memoria detalhado
- DUMPSYS_WIFI: detalhes da conexao Wi-Fi
- LIST_PACKAGES: lista de apps instalados
- GET_CPU: uso de CPU (/proc/stat)
- GET_MEMORY: memoria do sistema (/proc/meminfo)
- GET_TEMP: temperaturas das zonas termicas
- GET_PROCESSES: processos em execucao com uso de recursos
- GET_DISK: uso de armazenamento
- CAPTURE_SCREENSHOT: captura de tela (risco MEDIO, requer confirmacao)
- SHELL_SAFE: comando shell customizado. Requer campo “command”. Ex: {“type”:”SHELL_SAFE”,”command”:”dumpsys activity”}
- RUN_SKILL: executa diagnostico composto. Requer campo “skill”. Skills: FULL_DIAGNOSTIC, BATTERY_HEALTH, THERMAL_ANALYSIS, STORAGE_CLEANUP, NETWORK_DIAGNOSTIC, PERFORMANCE_PROFILE, APP_ANALYSIS, SECURITY_CHECK
</ferramentas>

<decisao>
Quando usar ferramentas:
- Cliente relata problema -> use a ferramenta relevante para investigar
- Cliente pede analise geral -> use RUN_SKILL com FULL_DIAGNOSTIC
- Cliente pede dado especifico -> use a ferramenta correspondente
- Saudacao simples (“oi”) -> NAO use ferramentas
- Ja tem dados suficientes no contexto -> NAO use ferramentas desnecessariamente
- Prefira RUN_SKILL sobre multiplas acoes individuais quando precisa de varios dados
- Maximo 3 acoes por resposta
</decisao>

<regras>
- NUNCA invente dados. Cite APENAS o que aparece em [DADOS DO DISPOSITIVO] ou [PERFIL DO DISPOSITIVO].
- Se nao tem um dado, diga que nao tem e solicite a ferramenta para obte-lo.
- Maximo 4 frases em <response>. Sem excecao.
- 1 pergunta por vez. Sem listas. Texto corrido simples.
- Foco no proximo passo mais util, nao em 5 solucoes de uma vez.
- Adapte vocabulario: leigo = linguagem simples; tecnico = termos precisos.
- Fora de escopo: diga educadamente que so cuida de diagnostico Android.
</regras>

<exemplos>
Cliente: “oi”
<think>Saudacao simples. Sem acao tecnica necessaria.</think>
<response>Oi, tudo certo. Me conta: tem algo no celular que precisa de atencao?</response>
<actions>[]</actions>

Cliente: “meu celular ta esquentando”
<think>Aquecimento reportado. Temperatura atual nos sensores: 48C (alto). Preciso verificar processos consumindo CPU e zonas termicas para identificar a causa.</think>
<response>A temperatura esta em 48C, acima do normal. Vou verificar quais processos estao forcando o processador pra identificar a causa.</response>
<actions>[{“type”:”GET_PROCESSES”},{“type”:”GET_TEMP”}]</actions>

Cliente: “faz um diagnostico completo”
<think>Cliente quer visao geral. Melhor usar o skill FULL_DIAGNOSTIC que executa 7 verificacoes de uma vez.</think>
<response>Vou rodar um diagnostico completo agora. Isso verifica bateria, memoria, CPU, armazenamento, temperatura e conectividade de uma vez.</response>
<actions>[{“type”:”RUN_SKILL”,”skill”:”FULL_DIAGNOSTIC”}]</actions>

Cliente: “verifica a bateria”
<think>Pedido especifico de bateria. Telemetria mostra 45% descarregando. Preciso dados detalhados do dumpsys.</think>
<response>Sua bateria esta em 45% e descarregando. Vou puxar os dados detalhados de saude pra te dar um panorama completo.</response>
<actions>[{“type”:”DUMPSYS_BATTERY”}]</actions>
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
            const cmd = this._actionToCommand(action);
            if (!cmd) continue;
            const validation = this.validator.validateWithRisk(cmd);
            if (!validation.allowed) {
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
            const rawResponse = await this._callAIProvider(message, sensorData, context, history);
            const parsed = this._parseAIResponse(rawResponse);

            // Tool execution loop: if AI requested LOW risk actions, execute and re-call
            const lowRiskActions = parsed.actions.filter(a => {
                if (a.type === 'RUN_SKILL') return true;
                const cmd = this._actionToCommand(a);
                if (!cmd) return false;
                const v = this.validator.validateWithRisk(cmd);
                return v.allowed && v.risk === 'LOW';
            });
            const nonLowActions = parsed.actions.filter(a => !lowRiskActions.includes(a));

            if (lowRiskActions.length > 0 && this.adb.isConnected()) {
                console.log(`[AI] Executing ${lowRiskActions.length} tool action(s)...`);
                const toolResults = await this._executeToolActions(lowRiskActions);
                const hasResults = toolResults.some(r => !r.pendingFrontend && r.result);

                if (hasResults) {
                    // Inject tool results and call AI again for informed response
                    const toolContext = this._buildToolResultsContext(toolResults);
                    history.push({ role: 'assistant', content: parsed.response });
                    history.push({ role: 'user', content: toolContext });

                    const followupRaw = await this._callAIProvider(toolContext, sensorData, context, history);
                    const followup = this._parseAIResponse(followupRaw);

                    // Remove the injected messages from visible history
                    history.splice(-2, 2);
                    history.push({ role: 'assistant', content: followup.response });

                    return {
                        success: true,
                        response: followup.response,
                        actions: [...nonLowActions, ...followup.actions],
                        executedActions: toolResults,
                        model: this.model
                    };
                }
            }

            history.push({ role: 'assistant', content: parsed.response });
            return { success: true, response: parsed.response, actions: parsed.actions, model: this.model };
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
        if (explicit === 'deepseek' || explicit === 'openrouter') {
            return explicit;
        }

        if (process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_MODEL) {
            return 'openrouter';
        }

        if (process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_MODEL) {
            return 'deepseek';
        }

        return 'openrouter';
    }

    _inferProviderFromConfig(key, model) {
        const normalizedKey = (key || '').trim();
        const normalizedModel = (model || '').trim().toLowerCase();

        if (normalizedKey.startsWith('sk-or-')) {
            return 'openrouter';
        }

        if (normalizedModel.includes('/') || normalizedModel.includes('openrouter') || normalizedModel.includes('openai/')) {
            return 'openrouter';
        }

        if (normalizedModel.includes('deepseek')) {
            return 'deepseek';
        }

        return this.provider || this._detectProvider();
    }

    async _callAIProvider(message, sensorData, context = {}, history = []) {
        let systemContent = this.systemPrompt;
        const vocabularyLevel = this._inferVocabularyLevel(message, context, history);
        systemContent += this._vocabularyContext(vocabularyLevel);

        // Injeta perfil real do dispositivo se disponível
        if (context.device) {
            systemContent += this._deviceProfileContext(context.device);
        }

        // Verifica se há dispositivo conectado com dados reais
        const hasDevice = sensorData && (sensorData.cpu > 0 || sensorData.ram > 0 || sensorData.battery.level > 0);

        if (hasDevice) {
            systemContent += this._sensorContext(sensorData);
        } else {
            systemContent += `\n\n[SEM DISPOSITIVO CONECTADO]\nNão há dispositivo Android conectado. Responda de forma curta e indique o próximo passo.`;
        }

        if (context.session) {
            systemContent += `\n\n[MODO DA SESSÃO]\n${context.mode || 'diagnostic'}`;
        }

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
                            
                            // Algumas APIs podem incluir reasoning_content
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
            req.setTimeout(300000, () => { req.destroy(); reject(new Error('API timeout (>5min) - resposta demorou demais')) });
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
        } else if (!this.model || this.model === 'deepseek-reasoner' || this.model === 'openai/gpt-oss-120b:free') {
            this.model = this.provider === 'deepseek'
                ? (process.env.DEEPSEEK_MODEL || 'deepseek-reasoner')
                : (process.env.OPENROUTER_MODEL || 'openai/gpt-oss-120b:free');
        }
        this.apiBaseUrl = this.provider === 'deepseek'
            ? (process.env.DEEPSEEK_API_BASE_URL || 'https://api.deepseek.com')
            : (process.env.OPENROUTER_API_BASE_URL || 'https://openrouter.ai/api/v1');
        this.providerLabel = this.provider === 'deepseek' ? 'DeepSeek' : 'OpenRouter';
        this.extraHeaders = this.provider === 'deepseek'
            ? {}
            : {
                'HTTP-Referer': process.env.OPENROUTER_REFERER || 'http://localhost:3001',
                'X-Title': process.env.OPENROUTER_APP_NAME || 'AION Repair OS'
            };
        console.log(`[AI] API key configured for ${this.providerLabel}`);
    }

    setModel(model) {
        if (!model) return;

        this.model = model;
        this.provider = this._inferProviderFromConfig(this.apiKey || '', model);
        this.apiBaseUrl = this.provider === 'deepseek'
            ? (process.env.DEEPSEEK_API_BASE_URL || 'https://api.deepseek.com')
            : (process.env.OPENROUTER_API_BASE_URL || 'https://openrouter.ai/api/v1');
        this.providerLabel = this.provider === 'deepseek' ? 'DeepSeek' : 'OpenRouter';
        this.extraHeaders = this.provider === 'deepseek'
            ? {}
            : {
                'HTTP-Referer': process.env.OPENROUTER_REFERER || 'http://localhost:3001',
                'X-Title': process.env.OPENROUTER_APP_NAME || 'AION Repair OS'
            };
    }
    clearSessionHistory(sessionId) {
        if (sessionId) this.histories.delete(sessionId);
    }

    clearHistory() { this.histories.clear(); }
}

module.exports = AiAgent;
