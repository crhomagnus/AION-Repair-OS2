# AION Repair OS V7.0 - Mestre Executor

Sistema de diagnóstico e reparo autonomous para dispositivos Android.

## Instalação

```bash
npm install
```

## Execução

```bash
npm start
# Servidor disponível em http://localhost:3001
```

## Conectar Dispositivo Android

1. Habilite USB Debugging no dispositivo Android
2. Conecte via USB
3. Clique no ícone de engrenagem para selecionar dispositivo
4. O sistema começará a monitorar automaticamente

## API Endpoints

- `GET /api/status` - Status do servidor
- `GET /api/devices` - Lista dispositivos conectados
- `POST /api/connect` - Conectar a um dispositivo
- `POST /api/execute` - Executar comando ADB
- `GET /api/sensors` - Estado atual dos sensores

## WebSocket

Conecte-se em `ws://localhost:3001` para streaming de telemetria em tempo real.

### Mensagens:

**Enviar:**
```json
{ "type": "connect", "deviceId": "device_id" }
{ "type": "execute", "command": "am force-stop com.android.systemui" }
{ "type": "ai_command", "order": "optimize" }
```

**Receber:**
```json
{ "type": "telemetry", "data": { "cpu": 45, "ram": 62, ... } }
{ "type": "executive_order", "action": "am force-stop ..." }
{ "type": "alert", "severity": "WARNING", "message": "..." }
```

## 12 Sensores

1. CPU - Carga do processador
2. RAM - Uso de memória
3. Temperature - Temperatura do SoC
4. Battery - Nível e status de carga
5. Disk I/O - Uso do armazenamento
6. Signal - Intensidade do sinal celular
7. Latency - Latência do kernel
8. GPU - Carga da GPU
9. Bluetooth - Status
10. Wi-Fi - Status
11. Camera - Status
12. Memory - Uso de memória do sistema

## Segurança

- Validação de comandos via whitelist
- Padrões bloqueados (rm -rf, dd, etc)
- Fail-safe: Desconexão se TEMP > 52°C ou VOLTAGE < 3.2V

## Estrutura do Projeto

```
aion-repair-os/
├── server/
│   ├── index.js         # Servidor principal
│   ├── adb-bridge.js    # Comunicação ADB
│   ├── sensor-poller.js # Pipeline de sensores
│   ├── cmd-validator.js # Camada de segurança
│   └── ai-executor.js   # Lógica autônoma
├── web/
│   └── index.html       # Dashboard V7.0
├── main.js              # Entry point
└── package.json
```

## Requisitos

- Node.js 18+
- Android SDK (adb)
- Dispositivo Android com USB Debugging