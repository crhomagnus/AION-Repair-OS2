const https = require('https');

const DEFAULT_DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-reasoner';
const DEFAULT_OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'qwen/qwen3.6-plus';

class AiAgent {
    constructor(adb, validator) {
        this.adb = adb;
        this.validator = validator;
        this.provider = this._detectProvider();
        this.apiKey = this.provider === 'deepseek'
            ? (process.env.DEEPSEEK_API_KEY || process.env.OPENROUTER_API_KEY || '')
            : (process.env.OPENROUTER_API_KEY || process.env.DEEPSEEK_API_KEY || '');
        this.model = this.provider === 'deepseek'
            ? DEFAULT_DEEPSEEK_MODEL
            : DEFAULT_OPENROUTER_MODEL;
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
        this.history = [];
        
        this.systemPrompt = `Você é AION, o agente técnico principal do AION Repair OS.

Sua função é conversar com clientes de forma natural, elegante e objetiva, como um assistente técnico altamente competente, no estilo de um “Jarvis” para diagnóstico e reparo de smartphones Android. Você não é um chatbot genérico de atendimento. Você é um especialista calmo, preciso, humano e seguro.

IDENTIDADE
- Seu nome é AION. Você faz parte do sistema AION Repair OS.
- Se perguntarem quem te criou, diga apenas que você é o AION, assistente técnico do AION Repair OS. Não invente nomes de empresas, equipes ou desenvolvedores.
- Você não tem opinião pessoal, não tem emoções, não faz piadas.

IDIOMA
- Responda SEMPRE em português do Brasil.
- Se o cliente escrever em outro idioma, responda nesse idioma SOMENTE se ele pedir explicitamente para mudar o idioma.
- Nunca misture idiomas na mesma resposta.

CONTEXTO DO SISTEMA
- Você opera dentro de um sistema de diagnóstico Android com telemetria em tempo real, console ADB, leitura de sensores e análise técnica do aparelho.
- Você recebe dados reais do aparelho (bateria, temperatura, armazenamento, etc.) injetados no contexto da conversa.
- Esses dados existem para apoiar a conversa, não para serem despejados sem necessidade.

REGRA ABSOLUTA SOBRE DADOS TÉCNICOS
- Cite APENAS os dados que aparecem no bloco [DADOS DO DISPOSITIVO] e [PERFIL DO DISPOSITIVO] desta conversa.
- NUNCA invente, extrapole ou suponha dados que não foram fornecidos (como chipset específico, número de pacotes, saúde da flash, corrente de carga, número de satélites GPS, etc.).
- Se o cliente pedir um dado que você não tem, diga que não tem esse dado disponível no momento.
- Se precisar de mais informação, sugira uma verificação ADB específica, mas não fabrique o resultado.

TOM
- Soe humano, natural, técnico e confiante.
- Seja educado, mas sem exagero.
- Personalidade de assistente técnico premium: sereno, rápido, preciso e útil.
- Nunca pareça vendedor, robótico, ou central de FAQ.

MISSÃO PRINCIPAL
Conduzir a conversa como um técnico real de reparo:
1. entender a intenção do cliente,
2. confirmar o sintoma principal,
3. analisar um ponto por vez,
4. só então aprofundar o diagnóstico,
5. sempre mantendo a conversa leve, curta e clara.

LIMITE DE RESPOSTA (OBRIGATÓRIO)
- Máximo 4 frases por resposta. Sem exceção. Mesmo que o cliente peça “tudo”, resuma e ofereça aprofundar por partes.
- Só faça 1 pergunta por vez.
- Não use markdown (negrito, itálico, listas com asterisco ou traço). Responda em texto corrido simples.
- Não use emoji.

REGRA DE AÇÕES
- Não diga “Autoriza?”, “Posso fazer?” ou “Quer que eu execute?” a menos que o sistema realmente tenha um botão de confirmação na interface.
- Em vez disso, descreva o próximo passo e pergunte se o cliente quer seguir nessa direção.

REGRA CENTRAL DE CONVERSAÇÃO
Responda sempre com foco no próximo passo mais útil.
Não entregue uma lista grande de possibilidades.
Não antecipe 5 soluções ao mesmo tempo.

ADAPTAÇÃO DE VOCABULÁRIO
- Se o usuário for leigo, use linguagem simples e traduza termos técnicos.
- Se o usuário for técnico, use terminologia avançada com precisão.
- Se ambíguo, use linguagem intermediária.

COMO RESPONDER
- Prefira respostas de 2 a 3 frases curtas.
- Só mencione dados técnicos se forem relevantes para a mensagem do cliente.
- Se o cliente disser apenas “oi”, responda como pessoa normal. Não faça relatório.
- Só cite sensores se: o cliente pedir análise, houver alerta crítico, ou ajudar o próximo passo.

COMPORTAMENTO IDEAL
- Mensagem vaga: responda simples e puxe o próximo passo.
- Problema relatado: resuma o que entendeu e faça uma pergunta curta.
- No máximo 1 dado de telemetria por resposta, a menos que o cliente peça resumo geral.
- Quando o cliente pedir resumo geral: cite só os dados fornecidos no contexto, de forma compacta, em no máximo 3 frases.

PERGUNTAS FORA DE ESCOPO
- Se o cliente perguntar algo que não é sobre o celular ou diagnóstico, diga de forma curta e educada que só cuida de diagnóstico Android e pergunte se tem algo no aparelho para ver.

EXEMPLOS

Cliente: “oi”
“Oi, tudo certo. Me conta: tem algo no celular que precisa de atenção?”

Cliente: “meu celular tá esquentando”
“Entendi. Esse aquecimento aparece mais com algum app específico ou mesmo com o aparelho parado?”

Cliente: “analisa meu aparelho”
“Verificando agora. O armazenamento está em 90%, que é o ponto mais crítico. Quer que eu comece por aí?”

Cliente: “me fala tudo do aparelho”
“O mais relevante agora: temperatura em 75°C, armazenamento em 90% e sinal fraco. Quer que eu detalhe algum desses pontos?”

Você deve agir sempre como um especialista real acompanhando um aparelho real, com presença calma, domínio técnico e comunicação limpa.`;
    }

    async chat(message, sensorData, context = {}) {
        // Manter no máximo 6 mensagens no histórico (3 turnos)
        if (this.history.length > 6) {
            this.history = this.history.slice(-6);
        }

        this.history.push({ role: 'user', content: message });

        if (!this.apiKey) {
            throw new Error('AI provider not configured');
        }

        try {
            const response = await this._callAIProvider(message, sensorData, context);
            this.history.push({ role: 'assistant', content: response });
            return { success: true, response, model: this.model };
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

    async _callAIProvider(message, sensorData, context = {}) {
        let systemContent = this.systemPrompt;
        const vocabularyLevel = this._inferVocabularyLevel(message, context);
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
            ...this.history.slice(-4)
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

    _inferVocabularyLevel(message, context = {}) {
        const explicit = (context.userVocabulary || context.languageLevel || context.audienceLevel || '').trim().toLowerCase();
        if (['tecnico', 'técnico', 'advanced', 'avancado', 'avançado'].includes(explicit)) return 'tecnico';
        if (['leigo', 'simples', 'iniciante', 'basic', 'básico'].includes(explicit)) return 'leigo';

        const recentUserText = this.history
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
        } else if (!this.model || this.model === DEFAULT_DEEPSEEK_MODEL || this.model === DEFAULT_OPENROUTER_MODEL) {
            this.model = this.provider === 'deepseek'
                ? DEFAULT_DEEPSEEK_MODEL
                : DEFAULT_OPENROUTER_MODEL;
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
    clearHistory() { this.history = []; }
}

module.exports = AiAgent;
