# Guia Completo: MCPs, Skills e Ferramentas para Diagnóstico e Reparo de Android via Terminal

> Compilação de alta qualidade para profissionais de reparo Android usando terminal PC.

---

## Índice

1. [Visão Geral](#visão-geral)
2. [MCPs Recomendados](#mcps-recomendados)
3. [Skills para Claude Code](#skills-para-claude-code)
4. [Ferramentas de Diagnóstico](#ferramentas-de-diagnóstico)
5. [Comandos ADB Essenciais](#comandos-adb-essenciais)
6. [Guias de Instalação](#guias-de-instalação)
7. [Recursos Adicionais](#recursos-adicionais)

---

## Visão Geral

| Categoria | Melhor Opção | Estrelas |
|-----------|--------------|----------|
| **Mais Completo** | DeepADB | 2★ (novo) |
| **Mais Popular** | DroidMind | 196★ |
| **UI Automation** | Android-MCP (CursorTouch) | 487★ |
| **Desenvolvimento** | replicant-mcp | 6★ |
| **Forense** | DroidForensics-Suite | 4★ |

---

## MCPs Recomendados

### 1. DeepADB — O Mais Completo (147 Ferramentas)

**Repo:** `github.com/fullread/DeepADB`  
**Licença:** MIT  
**Idioma:** TypeScript  
**Runtime:** Node.js ≥22

#### Funcionalidades Principais

| Categoria | Ferramentas |
|-----------|-------------|
| **Diagnóstico Baseband** | `adb_baseband_info`, `adb_signal_detail`, `adb_cell_identity`, `adb_neighboring_cells`, `adb_carrier_config`, `adb_modem_logs` |
| **Análise Firmware** | `adb_firmware_probe`, `adb_firmware_diff`, `adb_firmware_history` |
| **AT Commands** | `adb_at_detect`, `adb_at_batch`, `adb_at_probe` |
| **Logs** | logcat com watchers, ANR, crash, battery |
| **Device** | health check, devices, reboot, settings |
| **UI** | screenshots, tap, swipe, text input |
| **Pacotes** | list, install, uninstall, clear |
| **Arquivos** | push, pull, ls, cat |

#### Instalação

```bash
# Clone e build
git clone https://github.com/fullread/DeepADB.git
cd DeepADB
npm install
npm run build

# Configuração MCP (Claude Desktop)
# Arquivo: ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "deepadb": {
      "command": "node",
      "args": ["/path/to/DeepADB/build/index.js"]
    }
  }
}
```

#### Uso via Claude

```
"Liste todos os dispositivos conectados"
"Mostre as informações de baseband do dispositivo"
"Execute o comando shell dumpsys battery"
"Faça um screenshot do dispositivo"
"Instalar o APK /path/to/app.apk"
```

---

### 2. DroidMind — Alternativa Popular

**Repo:** `github.com/hyperb1iss/droidmind`  
**Licença:** Apache 2.0  
**Idioma:** Python  
**Runtime:** Python 3.10+

#### Funcionalidades

| Categoria | Ferramentas |
|-----------|-------------|
| **Device Management** | list, connect, disconnect, reboot, properties |
| **Análise Sistema** | logs (logcat, ANR, crash, battery), bugreport, heap dump |
| **Arquivos** | browse, read, write, push, pull, delete |
| **Apps** | install, uninstall, start, stop, clear |
| **UI Automation** | tap, swipe, text input, key press |
| **Shell** | executar comandos ADB shell |

#### Instalação

```bash
# Via pip
pip install droidmind

# Ou direto do GitHub
pip install git+https://github.com/hyperb1iss/droidmind.git

# Iniciar servidor
droidmind serve --host 0.0.0.0 --port 8080

# Configuração MCP
{
  "mcpServers": {
    "droidmind": {
      "command": "droidmind",
      "args": ["serve", "--port", "8080"]
    }
  }
}
```

#### Uso

```
"Conecte ao dispositivo via TCP/IP"
"Capture o logcat filtrado por erros do app X"
"Crie um backup completo do dispositivo"
"Execute o comando shell getprop"
```

---

### 3. replicant-mcp — Foco em Desenvolvimento

**Repo:** `github.com/thecombatwombat/replicant-mcp`  
**Licença:** MIT  
**Idioma:** TypeScript  
**Runtime:** Node.js 18+

#### Funcionalidades

| Categoria | Capabilidades |
|-----------|---------------|
| **Build & Test** | Build APKs/bundles, run unit/instrumented tests |
| **Emulator** | Create, start, stop, wipe, snapshots |
| **Device Control** | List, select, query properties |
| **App Management** | Install, uninstall, launch, stop, clear data |
| **Log Analysis** | Filter logcat por package, tag, level |
| **UI Automation** | Accessibility-first: tap, text input |
| **Diagnostics** | Environment health checks (`replicant doctor`) |

#### Instalação

```bash
# Instalação global
npm install -g replicant-mcp

# Configuração MCP
{
  "mcpServers": {
    "replicant": {
      "command": "npx",
      "args": ["-y", "replicant-mcp"]
    }
  }
}
```

#### Uso

```
"Build e rode o app no emulator"
"Execute testes instrumentados"
"Crie um snapshot do emulator"
"Faça logcat filtrado pelo pacote X"
"Liste todas as activities do app"
```

---

### 4. Android-MCP (CursorTouch) — UI Automation

**Repo:** `github.com/CursorTouch/Android-MCP`  
**Licença:** MIT  
**Idioma:** Python  
**Runtime:** Python 3.10+

#### Funcionalidades (22 Ferramentas)

| Categoria | Ferramentas |
|-----------|-------------|
| **App Management** | install, uninstall, list, launch, stop |
| **Screen Control** | tap, swipe, drag, text input, key events |
| **Screen Capture** | screenshot, screenshot_to_clipboard |
| **Device Info** | battery, memory, storage, device state |
| **Shell** | execute_command |

#### Instalação

```bash
# Pré-requisitos
# - Python 3.10+
# - ADB instalado e no PATH
# - Android 10+

git clone https://github.com/CursorTouch/Android-MCP.git
cd Android-MCP
uv sync

# Configuração MCP
{
  "mcpServers": {
    "android-mcp": {
      "command": "uv",
      "args": ["--directory", "/path/to/Android-MCP", "run", "server.py"]
    }
  }
}
```

---

### 5. landicefu/android-adb-mcp-server

**Repo:** `github.com/landicefu/android-adb-mcp-server`  
**Licença:** ISC  
**Idioma:** JavaScript  
**Runtime:** Node.js 16+

#### Funcionalidades

- `adb_devices` — Lista dispositivos conectados
- `adb_shell` — Executa comandos shell
- `adb_install` — Instala APKs
- `adb_uninstall` — Desinstala apps
- `adb_list_packages` — Lista pacotes
- `adb_pull/push` — Transferência de arquivos
- `launch_app` — Lança apps
- `take_screenshot` — Screenshots

#### Instalação

```bash
# Via npm
npm install -g @landicefu/android-adb-mcp-server

# Configuração MCP
{
  "mcpServers": {
    "android-adb": {
      "command": "npx",
      "args": ["-y", "@landicefu/android-adb-mcp-server"]
    }
  }
}
```

---

### 6. Phone Control (Android ADB)

**Repo:** `github.com/hao-cyber/phone-control-android-adb`  
**Licença:** Apache 2.0  
**Idioma:** Python

#### Funcionalidades (21 Ferramentas)

- `call_number` — Faz ligações
- `send_text_message` — Envia SMS
- `receive_text_messages` — Recebe SMS
- `get_contacts` — Lista contatos
- `check_device_connection` — Verifica conexão
- Screenshots, app management, shell commands

#### Instalação

```bash
uvx phone-mcp

# Configuração MCP
{
  "mcpServers": {
    "phone-mcp": {
      "command": "uvx",
      "args": ["phone-mcp"]
    }
  }
}
```

---

### 7. DroidForensics-Suite — Forense

**Repo:** `github.com/0x-Professor/DroidForensics-Suite`  
**Licença:** MIT  
**Idioma:** Python

#### Funcionalidades

| Ferramenta | Descrição |
|------------|-----------|
| `check_adb_status` | Verifica instalação ADB |
| `adb_devices` | Lista dispositivos |
| `adb_connect_device` | Conecta ao dispositivo |
| `adb_shell_command` | Executa comandos shell |
| `get_device_info` | Documenta dispositivo |
| `list_installed_packages` | Lista apps |
| `adb_backup_device` | Backup completo (.ab) |
| `adb_pull_data` | Extrai arquivos |
| `extract_backup_to_tar` | Converte .ab → TAR |
| `collect_forensic_artifacts` | Coleta automática |

#### Instalação

```bash
git clone https://github.com/0x-Professor/DroidForensics-Suite.git
cd DroidForensics-Suite
uv sync

# Configuração MCP
{
  "mcpServers": {
    "android-forensics": {
      "command": "uv",
      "args": ["--directory", "/path/to/DroidForensics-Suite", "run", "main.py"]
    }
  }
}
```

#### Aviso Legal
> Esta ferramenta é para investigações forenses legítimas com consentimento e autorização. Uso não autorizado é ilegal e antiético.

---

## Skills para Claude Code

### 1. adb-android-control

**Repo:** `github.com/hah23255/adb-android-control`  
**Estrelas:** 81★  
**Arquivo:** SKILL.md

#### Funcionalidades

| Categoria | Comandos |
|-----------|----------|
| **Conexão** | Connect, disconnect, status |
| **Device Info** | Model, Android version, battery, memory |
| **Pacotes** | List, install, uninstall, clear |
| **Logs** | Logcat, dumpsys |
| **Input** | Tap, swipe, text, key events |
| **Arquivos** | Push, pull |
| **Automação** | Scripts batch |

#### Instalação

```bash
# Via Claude Code
# Colocar em ~/.claude/skills/adb-android-control/

git clone https://github.com/hah23255/adb-android-control.git
# O arquivo SKILL.md deve estar em ~/.claude/skills/adb-android-control/SKILL.md

# Estrutura necessária:
# ~/.claude/skills/adb-android-control/
# ├── SKILL.md
# └── termux/ (scripts opcionais)
```

#### Uso no Claude

```
# Activate skill
@adb-android-control

# Comandos disponíveis
"Liste todos os pacotes instalados"
"Execute getprop para ver as propriedades"
"Mostre o battery status"
"Mostre o logcat filtrado"
"Instalar APK /path/to/file.apk"
```

---

## Ferramentas de Diagnóstico

### 1. QCSuper — Captura Radio Frames

**Repo:** `github.com/P1sec/QCSuper`  
**Licença:** GPLv3  
**Idioma:** Python

#### Funcionalidades

- Captura frames 2G/3G/4G (e 5G em alguns modelos)
- Gera arquivos PCAP para análise Wireshark
- Requer root ou porta DIAG exposta

#### Instalação

```bash
# Dependências
# - Python
# - pySerial
# - libusb (Linux)

git clone https://github.com/P1sec/QCSuper.git
cd QCSuper
pip install pyserial

# Uso com ADB (设备 enraizado)
sudo python qcsuper --adb --wireshark-live

# Uso com USB modem
sudo python qcsuper --usb-modem /dev/ttyUSB0 --wireshark-live
```

---

### 2. qc_debug_monitor — Debug Modem Qualcomm

**Repo:** `github.com/Cr4sh/qc_debug_monitor`  
**Licença:** —  
**Idioma:** Python

#### Funcionalidades

- Monitora mensagens de debug de modems Qualcomm
- Acesso via porta DIAG serial
- Útil para reverse engineering de firmware

#### Instalação

```bash
pip install pyserial

git clone https://github.com/Cr4sh/qc_debug_monitor.git
cd qc_debug_monitor

# Uso
sudo python qc_debug_monitor.py -d /dev/ttyUSB0 -a hash_db.txt
```

---

### 3. ADB Command Line Tools

**Origem:** Android SDK Platform Tools  
**Website:** https://developer.android.com/studio/command-line/adb

#### Instalação

```bash
# Linux
sudo apt install adb

# ou manual
# Baixar de https://developer.android.com/studio/releases/platform-tools
unzip platform-tools-latest-linux.zip
export PATH=$PATH:/path/to/platform-tools

# Verificar instalação
adb version
```

---

## Comandos ADB Essenciais

### Conexão

```bash
# Listar dispositivos
adb devices

# Conectar via USB
adb usb

# Conectar via WiFi
adb connect 192.168.1.100:5555

# Desconectar
adb disconnect 192.168.1.100:5555

# Reiniciar servidor ADB
adb kill-server
adb start-server

# Encaminhamento de porta
adb forward tcp:8080 tcp:9000
```

### Device Info

```bash
# Informações completas do dispositivo
adb shell getprop

# Propriedades específicas
adb shell getprop ro.build.version.release
adb shell getprop ro.product.model
adb shell getprop ro.product.manufacturer
adb shell getprop ro.serialno

# Bateria
adb shell dumpsys battery

# Memória
adb shell dumpsys meminfo
adb shell dumpsys procstats --hours 3

# Armazenamento
adb shell df -h

# Rede
adb shell dumpsys wifi

# CPU
adb shell dumpsys cpuinfo
```

### Pacotes (Package Manager)

```bash
# Listar todos os pacotes
adb shell pm list packages

# Listar apps de usuário (não-sistema)
adb shell pm list packages -3

# Listar apps do sistema
adb shell pm list packages -s

# Encontrar pacote por nome
adb shell pm list packages | grep nome

# Informações do pacote
adb shell dumpsys package <package_name>

# Instalar APK
adb install app.apk
adb install -r app.apk  # reinstall

# Desinstalar
adb uninstall com.package.name
adb shell pm uninstall --user 0 com.package.name

# Limpar dados
adb shell pm clear com.package.name

# Conceder permissão
adb shell pm grant com.package.name android.permission.CAMERA

# Revogar permissão
adb shell pm revoke com.package.name android.permission.CAMERA
```

### Activity Manager

```bash
# Iniciar activity
adb shell am start -n com.package.name/.MainActivity

# Iniciar com URI
adb shell am start -n com.package.name/.MainActivity -d content://path

# Parar app
adb shell am force-stop com.package.name

# Enviar broadcast
adb shell am broadcast -a "android.intent.action.ACTION"

# Dump heap
adb shell am dumpheap com.package.name /sdcard/dump.hprof
```

### Logcat

```bash
# Ver logs em tempo real
adb logcat

# Limpar logs
adb logcat -c

# Salvar em arquivo
adb logcat -d > log.txt

# Filtrar por nível
adb logcat *:E        # Only errors
adb logcat *:W        # Warnings
adb logcat *:I        # Info
adb logcat *:D        # Debug
adb logcat *:V        # Verbose

# Filtrar por tag
adb logcat -s MyTag:V

# Filtrar por pacote
adb logcat --pid=$(adb shell pidof com.package.name)

# Formato
adb logcat -v time        # timestamps
adb logcat -v threadtime  # data + hora + thread
adb logcat -v brief       # padrão

# Buffers
adb logcat -b main        # principal
adb logcat -b system      # sistema
adb logcat -b radio       # rádio
adb logcat -b events      # eventos
```

### Dumpsys

```bash
# Listar serviços disponíveis
adb shell dumpsys -l

# Service específico
adb shell dumpsys battery
adb shell dumpsys memory
adb shell dumpsys activity
adb shell dumpsys package
adb shell dumpsys window
adb shell dumpsys wifi
adb shell dumpsys notification
adb shell dumpsys alarm

# Com pacote específico
adb shell dumpsys activity activities
adb shell dumpsys meminfo com.package.name
adb shell dumpsys package com.package.name
```

### Arquivos

```bash
# Push (PC → Android)
adb push local.txt /sdcard/

# Pull (Android → PC)
adb pull /sdcard/screenshot.png .

# Shell interactivo
adb shell

# Comandos shell
adb shell ls -la /sdcard/
adb shell cat /etc/system-build.prop
adb shell rm /sdcard/file.txt
adb shell mkdir /sdcard/folder
```

### Input

```bash
# Tap
adb shell input tap x y

# Swipe
adb shell input swipe x1 y1 x2 y2 duration

# Texto
adb shell input text "Hello World"

# Key events
adb shell input keyevent 3    # Home
adb shell input keyevent 4    # Back
adb shell input keyevent 24   # Volume Up
adb shell input keyevent 25   # Volume Down
adb shell input keyevent 26   # Power
adb shell input keyevent 82   # Menu
```

### Screenshots e Vídeo

```bash
# Screenshot
adb shell screencap /sdcard/screen.png
adb pull /sdcard/screen.png

# Screenrecord
adb shell screenrecord /sdcard/video.mp4
# Para após 3 min por padrão
adb shell screenrecord --time-limit 60 /sdcard/video.mp4
```

### Reboot

```bash
# Reboot normal
adb reboot

# Reboot recovery
adb reboot recovery

# Reboot bootloader
adb reboot bootloader

# Reboot fastboot
adb reboot fastboot

# Reboot EDL ( Qualcomm )
adb reboot edl

#Shutdown
adb shell reboot -p
```

### Backup e Restore

```bash
# Backup completo
adb backup -all -f backup.ab

# Backup específico
adb backup -apk -shared -all -f backup.ab

# Restore
adb restore backup.ab
```

---

## Guias de Instalação

### Configuração Completa do Ambiente

#### 1. Instalar ADB

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install adb

# Fedora
sudo dnf install android-tools

# Arch
sudo pacman -S android-tools

# Verificar
adb version
```

#### 2. Habilitar USB Debugging no Android

1. Ir em **Configurações → Sobre o Phone**
2. Tocar 7x em **Número de Build** (ativa Developer Options)
3. Ir em **Configurações → Sistema → Opções do Desenvolvedor**
4. Ativar **USB Debugging**
5. Conectar ao PC e aceitar fingerprint RSA

#### 3. Configurar Claude Desktop com MCPs

**Arquivo de configuração:**
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%/Claude/claude_desktop_config.json`

**Exemplo de configuração completa:**

```json
{
  "mcpServers": {
    "deepadb": {
      "command": "node",
      "args": ["/home/user/DeepADB/build/index.js"]
    },
    "droidmind": {
      "command": "droidmind",
      "args": ["serve", "--port", "8080"]
    },
    "android-mcp": {
      "command": "uv",
      "args": ["--directory", "/home/user/Android-MCP", "run", "server.py"]
    }
  }
}
```

---

## Recursos Adicionais

### Referências de Comandos ADB

| Recurso | URL |
|---------|-----|
| MattInTech ADB Commands | https://mattintech.github.io/tools/adb-cmd/ |
| Android Shell (wuseman) | https://www.android-shell.se/ |
| ADB Cheatsheet (GadagoolKrishna) | https://github.com/GadagoolKrishna/adb-cheatsheet |
| CCommand (xbdcc) | https://github.com/xbdcc/CCommand |

### Comunidades

- **XDA Developers** — xdaforums.com
- **r/Android** — reddit.com/r/android
- **Stack Overflow** — tag: android, adb

### Livros Recomendados

- "Android System Programming" — Roger Ye
- "Android Security Internals" — Peter Gilg

---

## Aviso Legal

> Ferramentas de forense e diagnóstico devem ser usadas apenas em dispositivos que você possui ou tem autorização legal. O uso não autorizado pode ser ilegal em sua jurisdição.

---

## Licença

Este guia é mantido pela comunidade. Contribuições são bem-vindas via GitHub.

---

*Última atualização: Abril 2026*