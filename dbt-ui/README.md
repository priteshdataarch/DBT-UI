# DBT Studio

A browser-based IDE for **dbt projects backed by AWS Athena** — file explorer, Monaco editor, AI chat assistant, real-time dbt command output, and one-click data preview.

---

## Table of Contents

1. [What you need before starting](#1-what-you-need-before-starting)
2. [Clone / copy the project](#2-clone--copy-the-project)
3. [Set up Python & dbt](#3-set-up-python--dbt)
4. [Set up Node.js & pnpm](#4-set-up-nodejs--pnpm)
5. [Install Node dependencies](#5-install-node-dependencies)
6. [Configure environment variables](#6-configure-environment-variables)
7. [Configure profiles.yml](#7-configure-profilesyml)
8. [Update Athena settings in the code](#8-update-athena-settings-in-the-code)
9. [Start the dev server](#9-start-the-dev-server)
10. [Using the UI](#10-using-the-ui)
11. [Running tests](#11-running-tests)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. What you need before starting

| Tool | Minimum version | Check command |
|---|---|---|
| Python | 3.9 | `python3 --version` |
| Node.js | 18 LTS | `node --version` |
| pnpm | 8 | `pnpm --version` |
| Git | any | `git --version` |
| AWS account | — | Athena + S3 bucket access |
| OpenAI API key | — | [platform.openai.com](https://platform.openai.com/api-keys) |

---

## 2. Clone / copy the project

**Option A — clone the whole dbt project:**

```bash
git clone <your-repo-url>
cd dbt_athena
```

**Option B — copy `dbt-ui/` into an existing dbt project:**

```bash
# From the source repo, copy the dbt-ui folder into your project root
cp -r /path/to/source/dbt-ui  /path/to/your-dbt-project/dbt-ui
cd /path/to/your-dbt-project
```

After this step your project root should look like:

```
your-dbt-project/          ← this is DBT_PROJECT_ROOT
├── models/
├── macros/
├── seeds/
├── dbt_project.yml
├── profiles.yml            ← dbt profile (see step 7)
└── dbt-ui/                 ← UI lives here
    ├── src/
    ├── package.json
    └── README.md           ← you are here
```

---

## 3. Set up Python & dbt

The UI runs dbt as a subprocess using a local Python virtual environment.  
All of the following commands are run from the **project root** (one level above `dbt-ui/`).

### 3a. Create the virtual environment

```bash
# From your dbt project root:
python3 -m venv vdbt
```

This creates a `vdbt/` folder inside the project root.

### 3b. Activate it

```bash
# macOS / Linux:
source vdbt/bin/activate

# Windows (Command Prompt):
vdbt\Scripts\activate.bat

# Windows (PowerShell):
vdbt\Scripts\Activate.ps1
```

Your terminal prompt will change to show `(vdbt)` when it's active.

### 3c. Install dbt

```bash
pip install --upgrade pip
pip install dbt-athena-community
```

This installs `dbt-core` and the Athena adapter together.

### 3d. Verify

```bash
dbt --version
```

Expected output (versions may differ):

```
Core:
  - installed: 1.x.x
  - latest:    1.x.x

Plugins:
  - athena: 1.x.x
```

### 3e. Install dbt packages (if `packages.yml` exists)

```bash
dbt deps --project-dir . --profiles-dir dbt-ui
```

### 3f. Deactivate when done

```bash
deactivate
```

> **The UI does NOT need the virtualenv to be manually activated** — it calls  
> `vdbt/bin/dbt` directly. You only need the venv active when running dbt from the terminal yourself.

---

## 4. Set up Node.js & pnpm

### 4a. Install Node.js 18+

Download from [nodejs.org](https://nodejs.org/) or use a version manager:

```bash
# Using nvm (recommended):
nvm install 18
nvm use 18

# Verify:
node --version   # should print v18.x.x or higher
```

### 4b. Install pnpm

```bash
npm install -g pnpm

# Verify:
pnpm --version   # should print 8.x.x or higher
```

---

## 5. Install Node dependencies

```bash
cd dbt-ui
pnpm install
```

This installs everything listed in `package.json` into `dbt-ui/node_modules/`.  
It takes about 30–60 seconds on first run.

---

## 6. Configure environment variables

The UI reads secrets from a `.env.local` file that you create locally.  
**This file is in `.gitignore` — never commit it.**

```bash
# From the dbt-ui/ folder:
cp .env.local.example .env.local
```

Now open `dbt-ui/.env.local` in any editor and fill in the values:

```dotenv
# ── REQUIRED ─────────────────────────────────────────────────────────────────

# OpenAI API key — powers the AI chat assistant
# Get one at https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxx

# AWS credentials — used by dbt subprocesses AND the Data Preview (Athena SDK)
# The IAM user needs: AmazonAthenaFullAccess + S3 read/write on your staging bucket
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_DEFAULT_REGION=us-west-2

# ── OPTIONAL ──────────────────────────────────────────────────────────────────

# Absolute path to your dbt project root
# Default: the parent directory of dbt-ui/ (usually correct if structure matches step 2)
# DBT_PROJECT_ROOT=/absolute/path/to/your-dbt-project

# Absolute path to the dbt binary
# Default: <DBT_PROJECT_ROOT>/vdbt/bin/dbt
# DBT_BIN=/absolute/path/to/vdbt/bin/dbt
```

> After editing `.env.local`, always **restart the dev server** — Next.js reads
> environment variables only at startup.

---

## 7. Configure profiles.yml

The UI passes `--profiles-dir dbt-ui/` to every dbt command, so it looks for  
`dbt-ui/profiles.yml`. Create or copy this file:

```bash
# Option A: copy from project root if one already exists there
cp ../profiles.yml dbt-ui/profiles.yml

# Option B: create from scratch
```

The file must read credentials from environment variables (not hard-coded):

```yaml
# dbt-ui/profiles.yml
your_project_name:           # must match "profile:" in dbt_project.yml
  outputs:
    dev:
      type: athena
      database: awsdatacatalog
      region_name: us-west-2
      s3_staging_dir: s3://your-bucket/staging/
      s3_data_dir: s3://your-bucket/data/
      schema: your_schema    # Athena database / Glue database name
      threads: 4
      aws_access_key_id: "{{ env_var('AWS_ACCESS_KEY_ID') }}"
      aws_secret_access_key: "{{ env_var('AWS_SECRET_ACCESS_KEY') }}"
  target: dev
```

Replace `your_project_name`, `your-bucket`, and `your_schema` with your actual values.

---

## 8. Update Athena settings in the code

Two constants in the preview API route must match your Athena setup.  
Open `dbt-ui/src/app/api/preview/route.ts` and update lines near the top:

```ts
const S3_STAGING_DIR = 's3://your-bucket/staging/preview/';
const ATHENA_DATABASE = 'your_schema';   // same as "schema" in profiles.yml
const ATHENA_REGION   = process.env.AWS_DEFAULT_REGION ?? 'us-west-2';
```

---

## 9. Start the dev server

```bash
# From the dbt-ui/ folder:
pnpm dev
```

Expected output:

```
  ▲ Next.js 15.x.x
  - Local:        http://localhost:3001
  - Ready in 2.1s
```

Open **[http://localhost:3001](http://localhost:3001)** in your browser.

> To stop the server press `Ctrl+C`.

---

## 10. Using the UI

### Top bar buttons

| Button | What it runs |
|---|---|
| **Run** | `dbt run` — builds all models |
| **Run \<model\>** | `dbt run --select <active file>` |
| **Test** | `dbt test` — runs all tests |
| **Test \<model\>** | `dbt test --select <active file>` |
| **Docs → generate** | `dbt docs generate` — builds the catalog |
| **Docs → serve** | `dbt docs serve` — starts docs server; click **Open Docs ↗** in terminal |
| **More → compile** | `dbt compile` — renders all Jinja/refs without running |
| **More → source freshness** | `dbt source freshness` |
| **More → debug** | `dbt debug` — checks connection and config |
| **More → deps** | `dbt deps` — installs packages from `packages.yml` |

### Terminal command input

At the bottom of the Output panel, type any dbt command and press **Enter**:

```
dbt ▸  run --select f_score
dbt ▸  compile
dbt ▸  test --select marts
```

### Data Preview (query Athena directly)

1. Open any `.sql` model in the editor  
2. Click **Preview Data** (teal button in the breadcrumb bar)  
3. The Output panel switches to the **Preview** tab  
4. Results appear as a table (`LIMIT 100`)

> `dbt compile` must have been run first so compiled SQL exists in `target/compiled/`.

### Resizing panels

Drag the thin divider bars:

- **Left bar** — resize the file explorer
- **Right bar** — resize the chat panel  
- **Top bar of Output panel** — resize the terminal height

### Creating a model

Click **+ New Model** → choose folder, materialization, optional AI-generated SQL → **Create**.

### Creating / updating a source

Click **+ New Source** → if `sources.yaml` already exists for that source it will **append** the new table, not overwrite.

---

## 11. Running tests

```bash
cd dbt-ui
pnpm test
```

Run in watch mode during development:

```bash
pnpm test:watch
```

---

## 12. Troubleshooting

### "dbt: command not found" or "Failed to start dbt binary"

The virtualenv was not created at the expected location.

```bash
# Check if the binary exists:
ls /path/to/your-dbt-project/vdbt/bin/dbt

# If it's somewhere else, set the explicit path in .env.local:
DBT_BIN=/absolute/path/to/your/dbt
```

### `dbt run` fails — "AWS_ACCESS_KEY_ID not set" or Athena auth error

- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` are empty in `dbt-ui/.env.local`
- After filling them in, **restart `pnpm dev`** — env changes need a server restart

### Data Preview — "Compiled SQL not found"

Run `dbt compile` first (use **More → compile** button or the terminal input).  
The compiled files must exist under `target/compiled/`.

### `dbt docs generate` shows `RuntimeWarning: "table_owner"`

This is a harmless Python warning from the `agate` library used internally by dbt-athena.  
The catalog still generates successfully. Just proceed to **Docs → serve**.

### OpenAI chat returns 401 error

The `OPENAI_API_KEY` in `.env.local` is invalid or expired.  
Get a new key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys) and restart the server.

### File explorer shows old files / doesn't update

The explorer auto-refreshes every 5 seconds. You can also click the **↺** button  
in the explorer header to force an immediate refresh.

### Port 3001 already in use

```bash
# Find and kill the process using the port:
lsof -ti :3001 | xargs kill -9

# Or change the port in package.json:
"dev": "next dev --port 3002"
```
