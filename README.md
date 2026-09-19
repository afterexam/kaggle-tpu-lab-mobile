# Kaggle TPU Lab Mobile

An Android companion application integrating model scheduling, multi-account preemptive racing (Race), and a mobile streaming AI chat frontend for [kaggle-tpu-lab](https://github.com/ARahim3/kaggle-tpu-lab).

---

## Architecture & How It Works

```
[Mobile APK (Capacitor + React)]
   │
   ├─► Kaggle REST API (Push / Status / Delete) ──► Schedules Google Cloud TPU v5e-8
   │                                                         │
   ├─► ntfy.sh (Long polling / Event listener) ◄──────────────┤ (Publishes compilation, weights, readiness progress)
   │                                                         ▼
   └─► Cloudflare Tunnel (Streaming /v1/chat/completions) ◄──┘ (Exposes OpenAI-compatible endpoint)
```

1. **Decentralized Control**: Operates independently without local PC or Python CLI dependencies. The mobile app interacts directly with Kaggle's official REST API to race accounts for TPU slot allocation.
2. **Quota Protection**: Once any account transitions to `RUNNING`, the app automatically cancels competing queuing accounts to safeguard your 20h weekly free TPU quota.
3. **Real-Time Progress Timeline**: Listens to ntfy.sh stage events (Queued -> VM boot -> Weights mounted -> XLA compilation -> Cloudflare Tunnel opened) and triggers local Android system notifications upon readiness.
4. **Built-in Streaming Chat with Collapsible Reasoning**: Modern conversational interface supporting `<think>` reasoning chain folding, Markdown rendering, code syntax highlighting, and one-click code snippet copying.
5. **One-Click Config Export**: Effortlessly copy Base URL, API Key, cURL templates, and Claude Code terminal environment variables.

---

## Directory Structure

```
├── android/               # Capacitor native Android project & Gradle build files
├── kernels/               # Bundled TPU kernel launch scripts & GLM engine sources
│   ├── serve_qwen38.py    # Qwen3.8-27B TPU bootstrapper
│   ├── serve_glm53.py     # GLM-5.3-Flash TPU bootstrapper
│   └── glm53/             # GLM engine Python package for JAX/Pallas inference
├── src/
│   ├── components/        # UI components (Dashboard, Chat, Settings, Export)
│   ├── services/          # Core services (Kaggle API, Race state machine, ntfy listener, Chat)
│   ├── App.tsx            # Main application root
│   └── index.css          # Dark neon design system
├── build_apk.sh           # Automated APK compilation script (Debian WSL / Linux)
├── capacitor.config.ts    # Capacitor cross-platform configuration
├── generate_templates.py  # Self-contained template bundler (packages kernels into TypeScript)
└── package.json           # Frontend dependency manifest
```

---

## Download & Installation

Prebuilt APKs are available on the [Releases](https://github.com/afterexam/kaggle-tpu-lab-mobile/releases) page.

---

## Building & Running

### 1. Automated APK Compilation (Linux / Debian WSL)

Ensure OpenJDK 21 and Android SDK are installed, then execute:

```bash
chmod +x build_apk.sh
./build_apk.sh
```

Upon successful compilation, the APK is generated at `kaggle-tpu-lab.apk`.

### 2. Local Development & Preview (Browser)

```bash
npm install
npm run generate  # Re-embeds kernels/ into templates_data.ts
npm run dev
```

Open `http://localhost:5173` in your browser for full interactive testing.


