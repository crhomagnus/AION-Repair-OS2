# AION Repair OS - Runbook de Operacao

## 1. Setup do Zero (Workstation Local)

```bash
# 1. Clone o repositorio
git clone <repo-url> aion-repair-os
cd aion-repair-os

# 2. Instale as dependencias
npm install

# 3. Configure o ambiente
cp .env.example .env
# Edite .env com suas chaves de IA (o padrão atual é OpenRouter + qwen/qwen3.6-plus)

# 4. Conecte um celular Android via USB
adb devices -l   # deve mostrar o device

# 5. Inicie o server
npm start
# Acesse http://127.0.0.1:3001
```

## 2. Setup do Zero (VPS + Bridge)

### No VPS (Hostinger)

```bash
# 1. Copie o repositorio para o VPS
scp -r aion-repair-os/ root@srv907802.hstgr.cloud:/root/

# 2. No VPS, configure o ambiente
cd /root/aion-repair-os
cp .env.example .env
# Edite .env: AI_PROVIDER, chaves de IA, ADMIN_TOKEN

# 3. Suba o container
docker compose up -d --build

# 4. Verifique
curl http://127.0.0.1:3002/api/health
```

### Na Workstation (com o celular)

```bash
# 1. Configure o bridge
cp bridge/.env.example bridge/.env
# Edite bridge/.env com dados do VPS e caminho da chave SSH

# 2. Conecte o celular via USB
adb devices -l

# 3. Inicie o bridge
npm run bridge

# 4. (Opcional) Instale como servico systemd para auto-start
sudo cp bridge/aion-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable aion-bridge
sudo systemctl start aion-bridge
```

## 3. Deploy de Atualizacao no VPS

```bash
# Na workstation
git push origin main

# No VPS
cd /root/aion-repair-os
git pull origin main
docker compose up -d --build

# Verificar
curl http://31.97.83.152:3002/api/health
curl http://31.97.83.152:3002/api/status
```

## 4. Trocar Provider de IA

### De OpenRouter para DeepSeek

```bash
# Edite .env no VPS:
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=sua-chave-aqui
DEEPSEEK_MODEL=deepseek-reasoner

# Reinicie o container
docker compose restart
```

### De DeepSeek para OpenRouter

```bash
# Edite .env no VPS:
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-sua-chave
OPENROUTER_MODEL=qwen/qwen3.6-plus

# Reinicie o container
docker compose restart
```

### Trocar em runtime (sem restart)

```bash
curl -X POST http://127.0.0.1:3002/api/ai/key \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: seu-admin-token" \
  -d '{"key": "nova-chave", "model": "novo-modelo"}'
```

## 5. Habilitar HTTPS

```bash
# No VPS, instale Nginx e Certbot
apt install nginx certbot python3-certbot-nginx

# Copie a config do Nginx
cp nginx/aion.conf /etc/nginx/sites-available/aion
ln -s /etc/nginx/sites-available/aion /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default

# Edite /etc/nginx/sites-available/aion:
# - Substitua server_name _; por server_name seu-dominio.com;

# Obtenha o certificado
certbot --nginx -d seu-dominio.com

# Descomente as linhas de rate limiting no nginx.conf http block:
# limit_req_zone $binary_remote_addr zone=api:10m rate=30r/m;
# limit_req_zone $binary_remote_addr zone=chat:10m rate=10r/m;

# Teste e recarregue
nginx -t
systemctl reload nginx
```

## 6. Monitoramento

### Verificar saude do sistema

```bash
# Health check rapido
curl http://127.0.0.1:3002/api/health

# Status completo
curl http://127.0.0.1:3002/api/status

# Logs do container
docker compose logs -f --tail=50

# Logs do bridge (se usando systemd)
journalctl -u aion-bridge -f
```

### Monitorar uptime (cron simples)

```bash
# Adicione ao crontab do VPS:
*/5 * * * * curl -sf http://127.0.0.1:3002/api/health > /dev/null || echo "AION DOWN $(date)" >> /var/log/aion-health.log
```

## 7. Troubleshooting

### VPS nao ve o celular
1. Verifique se o bridge esta rodando: `systemctl status aion-bridge`
2. Verifique se o tunel SSH esta ativo: `ss -tlnp | grep 5037`
3. No VPS: `curl http://127.0.0.1:3002/api/devices`
4. Se vazio, reinicie o bridge na workstation

### IA nao responde
1. `curl http://127.0.0.1:3002/api/ai/status`
2. Se `configured: false`, verifique a chave de API no `.env`
3. Se o provider retorna erro, verifique os logs: `docker compose logs -f`
4. Teste a chave manualmente com curl no endpoint do provider

### Container nao inicia
1. `docker compose logs`
2. Verifique se a porta 3002 nao esta em uso: `ss -tlnp | grep 3002`
3. Verifique o `.env`: `docker compose config`

### Bridge desconecta frequentemente
1. Verifique a conexao SSH: `ssh -v -i ~/.ssh/aion_bridge_ed25519 root@srv907802.hstgr.cloud`
2. Aumente keepalive: `BRIDGE_KEEPALIVE_INTERVAL=10` no bridge/.env
3. Verifique logs: `journalctl -u aion-bridge --since "1 hour ago"`
