# DBT Studio

A browser-based IDE for **dbt projects running on AWS Athena**.  
File explorer · Monaco editor · AI SQL assistant · Real-time command output · One-click data preview.

<br>

---

## Table of Contents

1. [Features](#1-features)
2. [Prerequisites](#2-prerequisites)
3. [Project Structure](#3-project-structure)
4. [Installation](#4-installation)
   - [4a. Clone the repository](#4a-clone-the-repository)
   - [4b. Set up Python & dbt](#4b-set-up-python--dbt)
   - [4c. Install Node dependencies](#4c-install-node-dependencies)
5. [Configuration](#5-configuration)
   - [5a. Environment variables (.env.local)](#5a-environment-variables-envlocal)
   - [5b. dbt profiles.yml](#5b-dbt-profilesyml)
   - [5c. Athena settings in preview API](#5c-athena-settings-in-preview-api)
6. [Running the App](#6-running-the-app)
7. [Using the UI](#7-using-the-ui)
8. [AI Assistant](#8-ai-assistant)
9. [Running Tests](#9-running-tests)
10. [Troubleshooting](#10-troubleshooting)
11. [Architecture](#11-architecture)

<br>

---

## 1. Features

| Feature | Description |
| --- | --- |
| **File Explorer** | Tree view of your dbt project — models, sources, seeds, macros |
| **Monaco Editor** | VS Code-quality editor with SQL syntax highlighting and tabbed files |
| **dbt Commands** | Run, Test, Compile, Docs, Source Freshness, Debug, Deps — all from the UI |
| **Terminal Input** | Type any `dbt` command directly in the output panel |
| **Live Output** | Streaming real-time dbt output with colour-coded log levels |
| **Data Preview** | Query Athena directly from the editor — results in a table (`LIMIT 100`) |
| **AI Assistant** | RAG-powered chat that generates accurate SQL from your schema |
| **Lineage View** | Interactive SVG DAG — pan, zoom, click to highlight paths |
| **Create Model** | Modal to scaffold new `.sql` + `schema.yml` with full dbt config |
| **Create Source** | Modal to add sources — supports new files, existing folders, or appending |
| **Create Seed** | Modal to create CSV seeds with column definitions and optional `schema.yml` |
| **Git Auto-push** | Every file save is automatically committed and pushed |

<br>

---

## 2. Prerequisites

Make sure the following are installed before you begin.

| Tool | Minimum Version | How to check |
| --- | --- | --- |
| Python | 3.9 | `python3 --version` |
| Node.js | 18 LTS | `node --version` |
| pnpm | 8 | `pnpm --version` |
| Git | any | `git --version` |
| AWS account | — | Needs Athena + S3 bucket access |
| OpenAI API key | — | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |

**Install pnpm** (if you don't have it):

```bash
npm install -g pnpm
```

<br>

---

## 3. Project Structure

The UI lives inside your dbt project root as a sub-folder:

```
your-dbt-project/               ← DBT_PROJECT_ROOT
├── models/
│   ├── staging/
│   ├── intermediate/
│   └── marts/
├── seeds/
├── macros/
├── dbt_project.yml
├── profiles.yml
├── venv/                       ← Python virtual environment (you create this)
└── dbt-ui/                     ← This repository
    ├── src/
    │   ├── app/
    │   │   ├── page.tsx        ← Main app shell
    │   │   ├── layout.tsx
    │   │   ├── globals.css
    │   │   └── api/            ← Backend API routes
    │   │       ├── dbt/
    │   │       ├── file/
    │   │       ├── tree/
    │   │       ├── lineage/
    │   │       ├── preview/
    │   │       ├── chat/
    │   │       └── schema-refresh/
    │   ├── components/         ← React UI components
    │   ├── lib/                ← Shared backend utilities
    │   └── types/              ← TypeScript interfaces
    ├── .env.local              ← Your secrets (never committed)
    ├── .env.local.example      ← Template to copy from
    ├── package.json
    └── README.md
```

<br>

---

## 4. Installation

### 4a. Clone the repository

Clone this repo **into your dbt project root**:

```bash
# Navigate to your dbt project root
cd /path/to/your-dbt-project

# Clone dbt-ui inside it
git clone <repo-url> dbt-ui
```

Or if you're starting fresh:

```bash
git clone <repo-url>
cd dbt-ui
```

---

### 4b. Set up Python & dbt

The UI spawns the `dbt` CLI as a subprocess. You need a Python virtual environment with `dbt-athena-community` installed.

Run all of these commands from your **dbt project root** (one level above `dbt-ui/`):

**Step 1 — Create the virtual environment:**

```bash
python3 -m venv venv
```

**Step 2 — Activate it:**

```bash
# macOS / Linux
source venv/bin/activate

# Windows (Command Prompt)
venv\Scripts\activate.bat

# Windows (PowerShell)
venv\Scripts\Activate.ps1
```

Your terminal prompt will change to show `(venv)` when active.

**Step 3 — Install dbt:**

```bash
pip install --upgrade pip
pip install dbt-athena-community
```

**Step 4 — Verify:**

```bash
dbt --version
```

Expected output:

```
Core:
  - installed: 1.x.x

Plugins:
  - athena: 1.x.x
```

**Step 5 — Install dbt packages** (if a `packages.yml` exists in your project):

```bash
dbt deps
```

**Step 6 — Deactivate when done:**

```bash
deactivate
```

> **Note:** You do **not** need to manually activate the venv when using the UI. The app automatically resolves the dbt binary from `venv/bin/dbt` (or set `DBT_BIN` in `.env.local` if your path differs).

---

### 4c. Install Node dependencies

```bash
cd dbt-ui
pnpm install
```

This installs all packages from `package.json` into `node_modules/`. First run takes around 30–60 seconds.

**Key dependencies installed:**

| Package | Version | Purpose |
| --- | --- | --- |
| `next` | ^15.2.4 | Framework (App Router) |
| `react` / `react-dom` | ^19.0.0 | UI rendering |
| `@monaco-editor/react` | ^4.6.0 | Code editor |
| `openai` | ^4.90.0 | AI assistant + embeddings |
| `@aws-sdk/client-athena` | ^3.1030.0 | Data preview queries |
| `yaml` | ^2.7.0 | Parse/write dbt YAML files |
| `lucide-react` | ^0.468.0 | Icons |
| `tailwindcss` | ^3.4.17 | Styling |

<br>

---

## 5. Configuration

### 5a. Environment variables (.env.local)

Create your local environment file from the template:

```bash
# From inside the dbt-ui/ folder
cp .env.local.example .env.local
```

Open `.env.local` and fill in your values:

```dotenv
# ── REQUIRED ──────────────────────────────────────────────────────────────────

# OpenAI API key — powers the AI chat assistant and schema embeddings
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxx

# AWS credentials — used by dbt subprocesses AND the Athena Data Preview SDK
# IAM user needs: AmazonAthenaFullAccess + S3 read/write on your staging bucket
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_DEFAULT_REGION=us-east-1

# ── OPTIONAL ──────────────────────────────────────────────────────────────────

# Absolute path to your dbt project root
# Default: parent directory of dbt-ui/ (correct if structure matches Section 3)
# DBT_PROJECT_ROOT=/absolute/path/to/your-dbt-project

# Absolute path to the dbt binary
# Default: auto-detected from venv/bin/dbt, vdbt/bin/dbt, .venv/bin/dbt, or system PATH
# DBT_BIN=/absolute/path/to/venv/bin/dbt
```

> **Important:** After editing `.env.local`, always **restart `pnpm dev`**. Next.js reads environment variables only at server startup.

> **Security:** `.env.local` is already listed in `.gitignore` — it is never committed.

---

### 5b. dbt profiles.yml

The UI passes `--profiles-dir <dbt-ui>/` to every dbt command, so it reads credentials from `dbt-ui/profiles.yml`.

Create the file (or copy from your project root):

```bash
cp ../profiles.yml profiles.yml
```

The file should read credentials from environment variables — **never hard-code secrets**:

```yaml
# dbt-ui/profiles.yml
your_project_name:           # must match "profile:" in dbt_project.yml
  outputs:
    dev:
      type: athena
      database: awsdatacatalog
      region_name: "{{ env_var('AWS_DEFAULT_REGION') }}"
      s3_staging_dir: s3://your-bucket/staging/
      s3_data_dir: s3://your-bucket/data/
      schema: your_glue_database
      threads: 4
      aws_access_key_id: "{{ env_var('AWS_ACCESS_KEY_ID') }}"
      aws_secret_access_key: "{{ env_var('AWS_SECRET_ACCESS_KEY') }}"
  target: dev
```

Replace `your_project_name`, `your-bucket`, and `your_glue_database` with your actual values.

---

### 5c. Athena settings in preview API

Open `src/app/api/preview/route.ts` and update the constants near the top to match your setup:

```ts
const S3_STAGING_DIR = 's3://your-bucket/staging/preview/';
const ATHENA_DATABASE = 'your_glue_database';   // same as "schema" in profiles.yml
const ATHENA_REGION   = process.env.AWS_DEFAULT_REGION ?? 'us-east-1';
```

<br>

---

## 6. Running the App

```bash
# From inside the dbt-ui/ folder
pnpm dev
```

Expected terminal output:

```
▲ Next.js 15.x.x
  - Local:   http://localhost:3001
  - Ready in ~2s
```

Open **[http://localhost:3001](http://localhost:3001)** in your browser.

To stop the server, press `Ctrl + C`.

**Other available scripts:**

```bash
pnpm build       # Production build
pnpm start       # Run production build on port 3001
pnpm test        # Run tests once
pnpm test:watch  # Run tests in watch mode
```

<br>

---

## 7. Using the UI

### Top bar — dbt command buttons

| Button | Command run | Notes |
| --- | --- | --- |
| **Run** | `dbt run` | Builds all models |
| **Run \<model\>** | `dbt run --select <file>` | Only when a `.sql` file is open |
| **Test** | `dbt test` | Runs all tests |
| **Test \<model\>** | `dbt test --select <file>` | Only when a `.sql` file is open |
| **Docs → Generate** | `dbt docs generate` | Builds `catalog.json` |
| **Docs → Serve** | `dbt docs serve` | Starts docs server; click **Open Docs ↗** link in output |
| **More → Compile** | `dbt compile` | Renders Jinja/refs without executing |
| **More → Source Freshness** | `dbt source freshness` | Checks source freshness |
| **More → Debug** | `dbt debug` | Validates connection and config |
| **More → Deps** | `dbt deps` | Installs packages from `packages.yml` |
| **More → Build** | `dbt build` | Run + test together |
| **More → Seed** | `dbt seed` | Loads CSV seeds into Athena |

### Output panel — terminal input

Type any dbt sub-command in the input at the bottom of the output panel and press **Enter**:

```
$ dbt ▸  run --select f_score
$ dbt ▸  test --select marts
$ dbt ▸  compile --select staging
```

Use **↑ / ↓** arrow keys to cycle through command history.

### Data Preview

1. Open any `.sql` model in the editor
2. Click **Preview Data** in the breadcrumb bar
3. The output panel switches to the **Preview** tab
4. Results load as a table (`LIMIT 100`)

> **Prerequisite:** Run `dbt compile` first. The preview queries the compiled SQL from `target/compiled/`.

### Resizing panels

| Divider | What it resizes |
| --- | --- |
| Left drag bar | File explorer width |
| Right drag bar | Chat panel width |
| Output panel top bar | Terminal height |

### Creating files

| Action | How |
| --- | --- |
| New model | Click **+ New Model** → choose folder, materialization, refs, optional AI SQL |
| New source | Click **+ New Source** → choose strategy: new folder, new file, or append to existing |
| New seed | Click **+ New Seed** → define columns, enter CSV data, optional `schema.yml` entry |

<br>

---

## 8. AI Assistant

The chat panel (right side) uses a RAG pipeline to generate accurate SQL from your dbt schema.

**How it works:**

1. You type a question (e.g. *"Show me top 10 players by score this month"*)
2. The assistant embeds your query and searches `schema_index.json` for the most relevant tables
3. It builds a system prompt grounded in your real column names and data types
4. It sends the prompt to `gpt-4o-mini`
5. The SQL is validated against your schema and auto-repaired if needed
6. The response is returned with the SQL and the schema chunks it used

**First-time setup — build the schema index:**

1. Open the Chat panel
2. Click **Refresh Schema**
3. Wait for the embedding progress to complete (streams live)
4. The index is saved to `target/schema_index.json`

Repeat **Refresh Schema** whenever you add or change models/columns.

<br>

---

## 9. Running Tests

```bash
cd dbt-ui
pnpm test
```

Run in watch mode during development:

```bash
pnpm test:watch
```

<br>

---

## 10. Troubleshooting

### "dbt: command not found" or "Failed to start dbt binary"

The UI could not locate the dbt binary. Check these in order:

```bash
# 1. Verify the binary exists in venv
ls /path/to/your-dbt-project/venv/bin/dbt

# 2. If it's somewhere else, override in .env.local
DBT_BIN=/absolute/path/to/your/dbt
```

---

### `dbt run` fails with AWS auth error

- `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` is missing or incorrect in `dbt-ui/.env.local`
- After fixing, **restart `pnpm dev`** — environment changes require a server restart

---

### Data Preview — "Compiled SQL not found"

Run `dbt compile` first (use **More → Compile** or type `compile` in the terminal input).  
Compiled files must exist under `target/compiled/` before preview works.

---

### `dbt docs generate` shows `RuntimeWarning: "table_owner"`

This is a harmless warning from the `agate` library inside dbt-athena. The catalog still generates successfully. Proceed to **Docs → Serve**.

---

### OpenAI chat returns 401

The `OPENAI_API_KEY` in `.env.local` is invalid or expired.  
Get a fresh key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys) and restart the server.

---

### AI generates incorrect SQL / wrong tables

The schema index may be stale. Click **Refresh Schema** in the chat panel to re-embed your current schema.

---

### File explorer doesn't show new files

The explorer auto-refreshes every 5 seconds. Click the **↺** button in the explorer header for an immediate refresh.

---

### Port 3001 already in use

```bash
# Kill whatever is using the port
lsof -ti :3001 | xargs kill -9

# Or change the port in package.json
"dev": "next dev --port 3002"
```

<br>

---

## 11. Architecture

### Technology Stack

| Layer | Technology | Version | Purpose |
| --- | --- | --- | --- |
| Framework | Next.js (App Router) | ^15.2.4 | Full-stack — UI + API routes in one project |
| Language | TypeScript | ^5.7.3 | Type safety across frontend and backend |
| Styling | Tailwind CSS | ^3.4.17 | Utility-first CSS, no component library needed |
| Editor | Monaco Editor | ^4.6.0 | VS Code engine — SQL syntax, themes, keybindings |
| Icons | Lucide React | ^0.468.0 | Lightweight SVG icon set |
| AI | OpenAI SDK | ^4.90.0 | `gpt-4o-mini` (chat) + `text-embedding-3-small` (RAG) |
| Cloud | AWS Athena SDK | ^3.1030.0 | Live SQL preview against Athena |
| YAML | yaml | ^2.7.0 | Parse and write dbt source/schema YAML files |
| Testing | Jest + Testing Library | ^29.7.0 | Unit and integration tests |
| Package Manager | pnpm | 8+ | Faster, disk-efficient npm alternative |

---

### API Routes

| Route | Method | What it does |
| --- | --- | --- |
| `/api/dbt` | `POST` | Spawns the dbt CLI, streams stdout/stderr as Server-Sent Events |
| `/api/file` | `GET` | Read file content or list directory (`?list=path`) |
| `/api/file` | `PUT` | Update an existing file; auto-commits to Git on save |
| `/api/file` | `POST` | Create a new file; auto-commits to Git on save |
| `/api/tree` | `GET` | Returns filtered file tree (hides `target/`, `logs/`, config files) |
| `/api/lineage` | `GET` | Parses `manifest.json`, returns DAG nodes and edges with topological levels |
| `/api/preview` | `POST` | Runs `SELECT * LIMIT 100` on the active model via Athena SDK |
| `/api/chat` | `POST` | Full RAG pipeline — retrieve → prompt → OpenAI → validate → repair → respond |
| `/api/schema-refresh` | `GET` | Returns schema index status |
| `/api/schema-refresh` | `POST` | Embeds all mart schemas into vector index; streams progress |

---

### UI Components

| Component | What it does |
| --- | --- |
| `FileExplorer.tsx` | Left-panel tree view; click a file to open it in the editor |
| `EditorPane.tsx` | Tabbed Monaco editor with save, dirty indicators, and language detection |
| `OutputPanel.tsx` | Bottom terminal — streams SSE output, command history, stop button, Docs URL detector |
| `ChatPanel.tsx` | Right-side AI assistant with schema chunk display, mode badge, and Refresh Schema |
| `LineageView.tsx` | SVG DAG — pan, zoom, click to highlight paths, double-click to open file |
| `CreateModelModal.tsx` | Scaffold new model with folder strategy, materialization config, and optional AI SQL |
| `CreateSourceModal.tsx` | Add sources: new folder+file, new file in folder, or append to existing YAML |
| `CreateSeedModal.tsx` | Create CSV seeds with column editor, data rows, and optional `schema.yml` entry |
| `ResizeHandle.tsx` | Draggable divider between panels |

---

### Library Files (`src/lib/`)

| File | What it does |
| --- | --- |
| `fileSystem.ts` | Resolves `DBT_ROOT`, builds file tree, validates paths, provides `listDir()` |
| `manifest.ts` | Loads and caches `target/manifest.json`; parses nodes, refs, parent map |
| `catalog.ts` | Merges `catalog.json` with manifest; scores models for relevance; defines intermediate denylist and mart priority list |
| `rag.ts` | Intent detection (SQL vs authoring); retrieval pipeline: vector → keyword → manifest → filesystem |
| `vectorStore.ts` | OpenAI embeddings + cosine similarity; builds/loads/saves `target/schema_index.json` |
| `git.ts` | `commitAndPush()` — runs `git add → commit → push` automatically on every file save |
| `assistantUserInstructions.ts` | Reads custom AI instructions from `DBT_ASSISTANT_EXTRA_INSTRUCTIONS` env var or a markdown file |

---

### Key Data Flows

```
User saves a file
  └── EditorPane ──► PUT /api/file ──► git.ts ──► git add → commit → push

User clicks "Run" or a Docs/More command
  └── page.tsx ──► OutputPanel.runCommand() ──► POST /api/dbt
      └── Streams dbt CLI stdout/stderr as SSE ──► coloured output in terminal

User asks a SQL question in chat
  └── ChatPanel ──► POST /api/chat
      ├── rag.ts: vector search → catalog scoring → context chunks
      ├── buildSqlSystemPrompt: column grounding, prohibited tables, join rules
      ├── OpenAI gpt-4o-mini: generates SQL
      ├── validateSqlAgainstCatalog: checks tables, columns, joins
      ├── repair loop (up to 2 passes on validation failure)
      └── Response: SQL + schema chunks shown in chat

User opens Lineage view
  └── GET /api/lineage ──► manifest.ts parses DAG
      └── LineageView.tsx renders SVG with pan/zoom/highlight

User clicks "Refresh Schema" in chat panel
  └── POST /api/schema-refresh
      ├── catalog.ts reads catalog.json + manifest.json
      ├── vectorStore.ts embeds schemas with text-embedding-3-small
      └── Saves schema_index.json; progress streamed live

User creates a source
  └── CreateSourceModal ──► choose strategy (new folder / new file / append)
      └── POST or PUT /api/file ──► file written ──► editor tab refreshed in-place
```
