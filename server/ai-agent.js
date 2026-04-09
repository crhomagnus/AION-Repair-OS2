const https = require('https');

class AiAgent {
    constructor(adb, validator) {
        this.adb = adb;
        this.validator = validator;
        this.apiKey = process.env.DEEPSEEK_API_KEY || '';
        this.model = 'deepseek-reasoner'; // DeepSeek R1
        this.offline = !this.apiKey;
        this.history = [];
        
        this.systemPrompt = `Você é o AION Repair OS, um assistente de diagnóstico Android especializado.

PERSONALIDADE:
- Seja NATURAL e conversacional, como um amigo técnico que sabe das coisas.
- Varie suas respostas - não repita sempre a mesma estrutura.
- Faça perguntas específicas, não genéricas.
- Quando não tiver dados, seja honesto e puxe assunto.

REGRAS:
- SEM dispositivo conectado: Converse naturalmente, pergunte sobre o problema, ofereça ajuda geral.
- COM dispositivo conectado: Use os dados reais para diagnóstico preciso.
- Responda em português (exceto se pedir em outro idioma).
- Seja direto - sem burocracia.`;
    }

    async chat(message, sensorData, context = {}) {
        this.history.push({ role: 'user', content: message });

        if (this.offline) {
            const response = this._offlineReply(message, sensorData);
            this.history.push({ role: 'assistant', content: response });
            return { success: true, response, offline: true };
        }

        try {
            const response = await this._callDeepSeekAPI(message, sensorData, context);
            this.history.push({ role: 'assistant', content: response });
            return { success: true, response, offline: false, model: this.model };
        } catch (err) {
            console.error('[AI] DeepSeek API error:', err.message);
            const response = this._offlineReply(message, sensorData);
            this.history.push({ role: 'assistant', content: response });
            return { success: true, response, offline: true, fallbackReason: err.message, model: this.model };
        }
    }

    async _callDeepSeekAPI(message, sensorData, context = {}) {
        let systemContent = this.systemPrompt;
        
        // Verifica se há dispositivo conectado com dados reais
        const hasDevice = sensorData && (sensorData.cpu > 0 || sensorData.ram > 0 || sensorData.battery.level > 0);
        
        if (hasDevice) {
            systemContent += this._sensorContext(sensorData);
        } else {
            systemContent += `\n\n[SEM DISPOSITIVO CONECTADO]
O usuário ainda não conectou um dispositivo Android. Seja acolhedor e ajude a começar.
NÃO mencionei "bateria 0%" repetidamente - isso é redundante e chato.`;
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
            max_tokens: 4096,
            temperature: 0.7
        };

        return new Promise((resolve, reject) => {
            const data = JSON.stringify(body);
            
            const options = {
                hostname: 'api.deepseek.com',
                port: 443,
                path: '/chat/completions',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Length': Buffer.byteLength(data)
                }
            };

            console.log('[AI] Calling DeepSeek R1...');

            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', c => body += c);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            const json = JSON.parse(body);
                            let content = json.choices[0].message.content;
                            
                            // DeepSeek R1 pode incluir reasoning_content
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
            req.setTimeout(300000, () => { req.destroy(); reject(new Error('API timeout (>5min) - R1 pode demorar mais')) });
            req.write(data);
            req.end();
        });
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

    _offlineReply(msg, s) {
        const lower = msg.toLowerCase();
        const ctx = s ? this._sensorContext(s) : '';

        // Greeting
        if (/^(oi|olá|ola|hello|hey|bom dia|boa tarde|boa noite|eai|e ai)/i.test(lower)) {
            return 'Olá! Sou o AION Repair OS, seu assistente de diagnóstico Android.' + (ctx ? '\n\nVejo que temos um dispositivo conectado. ' + this._quickDiagnosis(s) : ' Conecte um dispositivo Android via USB para começarmos o diagnóstico.');
        }

        // CPU
        if (lower.includes('cpu') || lower.includes('processador') || lower.includes('lento') || lower.includes('travando')) {
            if (!s) return 'Para diagnosticar a CPU, preciso de um dispositivo conectado. Conecte via USB com depuração ativada.';
            if (s.cpu > 80) return `⚠️ CPU em ${s.cpu}% - Isso está alto!\n\nPossíveis causas:\n1. App em segundo plano consumindo recursos\n2. Thermal throttling\n3. Processo em loop\n\nAções recomendadas:\n- Force-stop em apps pesados\n- Verifique temperatura\n- Reinicie o dispositivo`;
            return `✅ CPU em ${s.cpu}% - Dentro do normal. Se o dispositivo parece lento, pode ser outro fator (RAM, armazenamento cheio, etc). Quer que eu verifique algo mais?`;
        }

        // RAM
        if (lower.includes('ram') || lower.includes('memória') || lower.includes('memoria')) {
            if (!s) return 'Preciso de um dispositivo conectado para verificar a memória RAM.';
            if (s.ram > 85) return `⚠️ RAM em ${s.ram}% - Uso muito alto!\n\nIsso causa travamentos e lentidão.\n\nAções:\n- Feche apps em segundo plano\n- Limpe cache\n- Considere reiniciar`;
            return `✅ RAM em ${s.ram}% - Uso normal. Se há travamentos, pode ser problema de CPU, armazenamento ou app específico.`;
        }

        // Battery
        if (lower.includes('bateria') || lower.includes('battery') || lower.includes('carregando') || lower.includes('drenagem')) {
            if (!s) return 'Conecte o dispositivo para verificar a bateria.';
            if (s.battery.level < 20) return `⚠️ Bateria em ${s.battery.level}% - Crítico! Conecte ao carregador imediatamente.`;
            return `Bateria em ${s.battery.level}% ${s.battery.charging ? '(Carregando)' : '(Descarregando)'}. ${s.battery.level > 80 ? 'Nível bom.' : 'Considere carregar em breve.'}`;
        }

        // Temperature
        if (lower.includes('temperatura') || lower.includes('esquentando') || lower.includes('quente') || lower.includes('aquecendo')) {
            if (!s) return 'Conecte o dispositivo para verificar temperatura.';
            if (s.temperature > 45) return `⚠️ Temperatura: ${s.temperature}°C - Elevada!\n\nRiscos:\n- Thermal throttling (redução de performance)\n- Degradação da bateria\n- Desligamento automático\n\nAções:\n- Remova capa protetora\n- Feche apps pesados\n- Deixe em local ventilado`;
            return `Temperatura: ${s.temperature}°C - Dentro do normal (ideal: abaixo de 40°C).`;
        }

        // Storage
        if (lower.includes('armazenamento') || lower.includes('storage') || lower.includes('disco') || lower.includes('espaço') || lower.includes('espaco')) {
            if (!s) return 'Conecte o dispositivo para verificar armazenamento.';
            if (s.disk > 90) return `⚠️ Armazenamento em ${s.disk}% - Quase cheio!\n\nIsso causa:\n- Lentidão extrema\n- Apps crashando\n- Impossibilidade de atualizar\n\nAções:\n- Delete fotos/vídeos desnecessários\n- Limpe cache de apps\n- Desinstale apps não usados`;
            return `Armazenamento: ${s.disk}% usado - ${s.disk < 50 ? 'Bastante espaço livre.' : 'Começando a ficar cheio, considere limpar.'}`;
        }

        // WiFi/Network
        if (lower.includes('wifi') || lower.includes('wi-fi') || lower.includes('internet') || lower.includes('rede') || lower.includes('sinal')) {
            if (!s) return 'Conecte o dispositivo para verificar rede.';
            return `Wi-Fi: ${s.wifi ? 'Conectado' : 'Desconectado'}\nSinal: ${s.signal} dBm\nBluetooth: ${s.bluetooth ? 'Ativo' : 'Inativo'}\n\n${!s.wifi && s.signal < -90 ? 'Sinal fraco detectado. Tente alternar Wi-Fi.' : s.wifi ? 'Conexão de rede parece OK.' : 'Wi-Fi desconectado.'}`;
        }

        // General diagnosis
        if (lower.includes('diagnóstico') || lower.includes('diagnostico') || lower.includes('verificar') || lower.includes('como está') || lower.includes('como esta')) {
            if (!s) return 'Nenhum dispositivo conectado. Conecte um Android via USB com depuração ativada.';
            return this._quickDiagnosis(s);
        }

        // Help
        if (lower.includes('ajuda') || lower.includes('help') || lower.includes('o que você faz') || lower.includes('o que vc faz')) {
            return 'Posso ajudar com:\n\n• Diagnóstico de CPU, RAM, bateria, temperatura\n• Verificação de armazenamento e rede\n• Identificação de apps problemáticos\n• Sugestões de otimização\n• Execução de comandos ADB de reparo\n\nBasta descrever o problema ou perguntar sobre um sensor específico.';
        }

        // Default
        return 'Entendi. Para dar uma resposta mais precisa, me conte mais detalhes sobre o problema. Posso verificar CPU, RAM, bateria, temperatura, armazenamento, rede e muito mais. O que está acontecendo com o dispositivo?';
    }

    _quickDiagnosis(s) {
        const issues = [];
        if (s.cpu > 80) issues.push(`⚠️ CPU alta: ${s.cpu}%`);
        if (s.ram > 85) issues.push(`⚠️ RAM alta: ${s.ram}%`);
        if (s.temperature > 45) issues.push(`⚠️ Temperatura alta: ${s.temperature}°C`);
        if (s.battery.level < 20) issues.push(`⚠️ Bateria baixa: ${s.battery.level}%`);
        if (s.disk > 90) issues.push(`⚠️ Armazenamento quase cheio: ${s.disk}%`);
        if (s.signal < -100) issues.push(`⚠️ Sinal fraco: ${s.signal} dBm`);

        if (issues.length === 0) {
            return `✅ Diagnóstico geral - Tudo parece normal:\n• CPU: ${s.cpu}%\n• RAM: ${s.ram}%\n• Temp: ${s.temperature}°C\n• Bateria: ${s.battery.level}%\n• Armazenamento: ${s.disk}%\n• Wi-Fi: ${s.wifi ? 'OK' : 'Off'}\n\nO dispositivo está em boas condições. Se há algum problema específico, me descreva.`;
        }

        return `⚠️ Problemas detectados:\n${issues.join('\n')}\n\nDados completos:\n• CPU: ${s.cpu}%\n• RAM: ${s.ram}%\n• Temp: ${s.temperature}°C\n• Bateria: ${s.battery.level}%\n• Armazenamento: ${s.disk}%\n\nQuer que eu detalhe algum problema específico?`;
    }

    setApiKey(key) { 
        this.apiKey = key; 
        this.offline = false;
        console.log('[AI] API key configured for DeepSeek R1');
    }
    setOffline() { this.offline = true; }
    clearHistory() { this.history = []; }
}

module.exports = AiAgent;
