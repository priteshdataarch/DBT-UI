# Project Knowledge: mursion_dbt_athena

## Overview

This is a **dbt (data build tool)** project that transforms raw application data stored in AWS Glue/Athena into structured dimension and fact tables consumed by **Amazon QuickSight** dashboards. It is maintained by the Mursion analytics team.

- **dbt project name:** `mursion_dbt_athena`
- **dbt profile:** `mursion_dbt_athena`
- **Query engine:** AWS Athena
- **Default materialization:** Iceberg tables (Parquet/Snappy)
- **Output AWS region:** `us-west-2`
- **S3 bucket:** `s3://mursion-dbt-athena/`
- **Target schema:** `dbt`
- **Table type:** Iceberg (default), Parquet format, Snappy compression
- **Target file size:** 52428800 bytes (50 MB)
- **Package dependency:** `dbt-labs/dbt_utils` v1.1.1

---

## Infrastructure & Deployment

| Component | Details |
|-----------|---------|
| Container | Dockerfile builds a dbt runner image |
| CI/CD | GitHub Actions: `build-and-push.yml` (ECR), `run-dbt.yml` (dbt execution) |
| Scheduling | Kubernetes CronJob (`k8s/dbt-cronjob.yml`) |
| AWS credentials | Injected via K8s secrets (not stored in repo); `aws_profile_name: mursion_dbt_athena` for local dev |

See `DEVOPS_SETUP.md` for full setup instructions.

---

## Project Structure

```
mursion_dbt_athena/
├── models/
│   ├── sources/
│   │   └── application_db/
│   │       └── sources.yaml        # Raw Glue source definitions (schema: prod-raw)
│   ├── warehouse/
│   │   ├── schema.yml              # Tests for warehouse models
│   │   └── *.sql                   # Staging/intermediate dims & facts
│   └── marts/
│       ├── schema.yml              # Tests for mart models
│       └── *.sql                   # Business-facing output tables
├── dbt_project.yml
├── profiles.yml
├── packages.yml
├── Dockerfile
├── DEVOPS_SETUP.md
└── k8s/dbt-cronjob.yml
```

---

## Data Source

All raw data comes from a single dbt source named **`application_db`** (schema `prod-raw` in `awsdatacatalog`). Key raw tables include:

- `raw_session`, `raw_session_score`, `raw_session_learner`, `raw_session_learner_report`
- `raw_skill_score`, `raw_sim_feedback`, `raw_session_insights_service`
- `raw_scenario`, `raw_scenario_team`, `raw_scenario_building_block`, `raw_scenario_goals`
- `raw_building_blocks`, `raw_events`, `raw_events_assessment`, `raw_events_mindset`
- `raw_client`, `raw_users`, `raw_team`, `raw_industry`, `raw_project`
- `raw_client_user`, `raw_client_user_role`, `raw_team_member`
- `raw_ondemand_session`, `raw_ondemand_session_event`
- `raw_post_simulation`
- `raw_skill_domain_mapping`, `raw_scenario_bank_event_scoring`

Many tables use **CDC (Change Data Capture)** with an `op` column (`'D'` = delete) and `version`/`modify_revision` columns for deduplication.

---

## Data Flow / Lineage

```
prod-raw (Glue)
    └─► warehouse/d_* (dimensions)  ──┐
    └─► warehouse/m_* (bridges)     ──┼─► marts/ (business facts for QuickSight)
    └─► warehouse/f_* (facts)       ──┘
```

### Step 1 — Warehouse Layer (dedup & clean)

Raw CDC tables are deduplicated using `ROW_NUMBER()` over `id`/`version`/`modify_revision` keys, HTML is stripped, and `op = 'D'` deletes are filtered.

### Step 2 — Marts Layer (business grain)

Warehouse models are joined and unioned (live + on-demand sessions) into wide tables suitable for BI dashboards.

---

## Model Inventory

### Warehouse — Dimensions (`d_*`)

| Model | Description |
|-------|-------------|
| `d_client` | Latest non-archived client record per `id` |
| `d_users` | Latest non-archived user record per `id` |
| `d_team` | Latest team record per `id` |
| `d_industry` | Latest industry record per `id` |
| `d_project` | Latest non-archived project record per `id` |
| `d_scenario` | Latest non-archived scenario record per `id` |
| `d_building_blocks` | Latest building block per `id`; HTML-stripped title/description |
| `d_events` | Latest non-archived event per `id` |
| `d_events_mindset` | Latest events_mindset; cleans definition text |
| `d_scenario_goals` | Latest goal per `scenario_id` + `goal_index`; excludes deletes |
| `d_scenario_bank_event_scoring` | Latest bank event scoring row; HTML-stripped text fields |
| `d_learner_confidence` | From `raw_session_learner_report`; flattens nested confidence/sim feedback fields per session |
| `d_post_simulation` | From `raw_post_simulation`; pivots JSON questions to wide columns (Q1–Q62+) per session |

### Warehouse — Bridge/Junction Tables (`m_*`)

| Model | Materialization | Description |
|-------|----------------|-------------|
| `m_user_client` | table | Active `raw_client_user` deduped by `id` |
| `m_client_user_role` | table | `raw_client_user_role` deduped by `id`/`version` |
| `m_team_member` | table | Team–user-role pairs; excludes `op = 'D'` |
| `m_scenario_team` | view | Scenario–team assignments (CDC caveat noted) |
| `m_scenario_building_block` | table | Scenario–building-block pairs |
| `m_session_learner` | view | Pass-through `raw_session_learner` (CDC caveat) |
| `m_skill_score_mindset` | view | Joins `d_events_mindset` → `d_building_blocks` on mindset_id |

### Warehouse — Facts (`f_*`)

| Model | Materialization | Description |
|-------|----------------|-------------|
| `f_live_session` | table | Deduped `raw_session`; adds `session_date` |
| `f_ondemand_session` | view | Deduped on-demand sessions (CDC caveat) |
| `f_ondemand_session_event` | view | Pass-through `raw_ondemand_session_event` |
| `f_session_score` | table | Deduped `raw_session_score` |
| `f_skill_score` | table | Deduped `raw_skill_score` |
| `f_skill_domain_mapping` | table | Skill→domain mapping; excludes deletes/archived |
| `f_skill_domain_name` | table | Skill/domain names via live skills + domains |
| `f_building_blocks` | table | Deduped `raw_building_blocks` (CDC); non-archived |
| `f_events_assessment` | table | Deduped `raw_events_assessment`, non-archived |
| `f_events_mindset` | table | Deduped `raw_events_mindset` |
| `f_session_insights_service` | table | Deduped `raw_session_insights_service` |
| `f_live_skills` | table | Core live skill facts: unpivots 5 sim-feedback events per session; derives `skill_score` from mindset titles |
| `f_ondemand_skills` | table | Ranks skill scores per on-demand session (`ROW_NUMBER`) |

### Marts

| Model | Materialization | Description |
|-------|----------------|-------------|
| `f_sessions_final` | table | **Union** of live + on-demand sessions with scenario/project/client context |
| `f_team_sessions_final` | table | Wide user–team–scenario–session grain for dashboards; includes user-client-role and scenario details |
| `f_score` | table | `f_team_sessions_final` + skill scores (live or on-demand by `session_type`) with competency attempts |

---

## Key Patterns & Conventions

### CDC Deduplication
Most warehouse models deduplicate CDC-style feeds using:
```sql
ROW_NUMBER() OVER (PARTITION BY id ORDER BY modify_revision DESC) AS row_num
-- then: WHERE row_num = 1 AND op <> 'D'
```

### Materialization Defaults
- Default (set in `dbt_project.yml`): **Iceberg table**, Parquet format, Snappy compression, `write.target-file-size-bytes = 52428800`
- Views are used where CDC makes full rebuilds impractical or where the model is a thin pass-through
- Individual models can override via `{{ config(...) }}`

### Model Metadata
Many models include:
```sql
{{ config(
    meta={'owner': 'analytics'},
    persist_docs={'relation': true, 'columns': true}
) }}
```

### Session Types
- **Live sessions:** `generation_type = 1` or sourced from `f_live_session`/`raw_session`; scored via `f_live_skills`
- **On-demand sessions:** sourced from `f_ondemand_session`/`raw_ondemand_session`; scored via `f_ondemand_skills`

### Attempt Numbering
Multiple models compute an **attempt number** using `ROW_NUMBER()` or `DENSE_RANK()` ordered by `start_date` partitioned by learner + scenario.

---

## Known Issues & Tech Debt

| Issue | Location | Notes |
|-------|----------|-------|
| Schema drift in `warehouse/schema.yml` | `warehouse/schema.yml` | References to models that no longer exist as `.sql` files (e.g. `d_licensee`, `d_session_details`, `d_session_flow_event`, `d_skill_score`, `f_team`, `passed_events`, `d_scenario_attempt`, `scenario_attempt`) should be removed or addressed |
| Test deprecation warnings | `marts/schema.yml` | `f_user_team_final` test references may cause warnings if that model no longer exists |
| Materialization overrides | Various models | Some models override default `table` materialization with `view`: `f_ondemand_session`, `f_ondemand_session_event`, `m_scenario_team`, `m_session_learner`, `m_skill_score_mindset` |
| No seeds despite `dbt seed` in CI | `DEVOPS_SETUP.md` | CI references `dbt seed` but no seed CSVs exist in the repo |
| Hard-coded client ID remapping | `f_team_sessions_final.sql` | Two `UNION ALL` blocks remap specific client IDs for a single source client; this is business logic, not a bug |

---

## Local Development

### Prerequisites
- Python with dbt-athena adapter installed
- AWS CLI configured with profile `mursion_dbt_athena`

### Commands
```bash
# Install packages
dbt deps

# Run all models
dbt run

# Run specific model + dependencies
dbt run --select +f_team_sessions_final

# Test models
dbt test

# Generate and serve docs
dbt docs generate
dbt docs serve
```

### Connection (`profiles.yml`)
```yaml
mursion_dbt_athena:
  target: dev
  outputs:
    dev:
      type: athena
      database: awsdatacatalog
      schema: dbt
      region_name: us-west-2
      s3_data_dir: s3://mursion-dbt-athena/data_dir/
      s3_staging_dir: s3://mursion-dbt-athena/staging_dir/
      threads: 4
      aws_profile_name: mursion_dbt_athena
```

---

## QuickSight Consumer Tables

The following mart tables are the primary outputs consumed by QuickSight dashboards:

| Table | Primary Use |
|-------|-------------|
| `f_team_sessions_final` | Core session-level fact for team/scenario dashboards |
| `f_score` | Skill scores per session |
| `f_sessions_final` | live and ondemand sessions data |

