# Hermes Setup Guide

Detailed setup instructions for first-time installation and Airflow configuration.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Airflow Configuration](#airflow-configuration)
- [Initial DAG Triggers](#initial-dag-triggers)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Docker | 20.10+ | `docker --version` |
| Docker Compose | 2.0+ | `docker compose version` |
| YouTube Data API Key | - | [Get API Key](https://console.cloud.google.com/apis/library/youtube.googleapis.com) |
| Gemini API Key | - | [Get API Key](https://aistudio.google.com/app/apikey) (for AI word discovery) |

---

## Environment Variables

Copy the example file and configure:

```bash
cp .env.example .env
```

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `YOUTUBE_API_KEY` | YouTube Data API v3 key | `AIzaSy...` |
| `YOUTUBE_URL` | Target live stream URL | `https://www.youtube.com/watch?v=xxxxx` |
| `GEMINI_API_KEY` | Google Gemini API key | `AIzaSy...` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POLL_INTERVAL` | `60` | Stats polling interval (seconds) |
| `CHAT_WATCHDOG_TIMEOUT` | `1800` | Restart chat collector if hung (seconds) |
| `POSTGRES_PASSWORD` | `hermes` | Database password |

---

## Airflow Configuration

After starting services with `docker-compose up -d`, configure Airflow Variables.

### Access Airflow Web UI

- **URL:** http://localhost:8080
- **Default login:** `airflow` / `airflow`

### PostgreSQL Connection

> ✅ **No manual configuration needed!**
> 
> The connection `postgres_hermes` is **automatically configured** via `docker-compose.yml`:
> ```yaml
> AIRFLOW_CONN_POSTGRES_HERMES: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:${POSTGRES_PORT}/${POSTGRES_DB}
> ```

---

## Airflow Variables Reference

Navigate to **Admin → Variables** to configure. Variables are extracted from source code:

### Required Variables

| Variable | Used By | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | `discover_new_words` | Google Gemini API key for AI word discovery. Falls back to environment variable if not set. |

### Optional Variables (with defaults)

| Variable | Default | Used By | Description |
|----------|---------|---------|-------------|
| `DISCOVER_NEW_WORDS_PROMPT` | (built-in prompt) | `discover_new_words` | Custom prompt template for Gemini API analysis |
| `PROCESS_CHAT_DAG_START_TIME` | 7 days ago | `process_chat_messages` | ISO format timestamp to start processing from (e.g., `2025-01-01T00:00:00`) |
| `PROCESS_CHAT_DAG_RESET` | `false` | `process_chat_messages` | Set to `true` to truncate processed messages and reprocess from start |
| `TRUNCATE_REPLACE_WORDS` | `false` | `import_text_analysis_dicts` | Set to `true` to clear `replace_words` table before import |
| `TRUNCATE_SPECIAL_WORDS` | `false` | `import_text_analysis_dicts` | Set to `true` to clear `special_words` table before import |
| `MEANINGLESS_WORDS_FILE` | `/opt/airflow/text_analysis/meaningless_words.json` | `import_text_analysis_dicts` | Path to meaningless words JSON file |
| `REPLACE_WORDS_FILE` | `/opt/airflow/text_analysis/replace_words.json` | `import_text_analysis_dicts` | Path to replace words JSON file |
| `SPECIAL_WORDS_FILE` | `/opt/airflow/text_analysis/special_words.json` | `import_text_analysis_dicts` | Path to special words JSON file |

### Example Variable Setup (Screenshot)

For first-time setup, you typically only need to add:

1. `GEMINI_API_KEY` - Your Gemini API key
2. `PROCESS_CHAT_DAG_START_TIME` - When to start processing messages

All other variables have sensible defaults.

---

## Initial DAG Triggers

DAGs run on schedule, but for first-time setup, trigger them manually in this order:

### Step 1: Import Dictionaries

**DAG:** `import_text_analysis_dicts`

Imports base dictionaries from `text_analysis/` folder into the database:
- `special_words.json` → `special_words` table
- `replace_words.json` → `replace_words` table
- `meaningless_words.json` → `meaningless_words` table

```
Airflow UI → DAGs → import_text_analysis_dicts → ▶️ Trigger DAG
```

> ⚡ **Schedule:** Manual only (`schedule_interval=None`)

### Step 2: Process Chat Messages

**DAG:** `process_chat_messages`

Runs ETL on raw chat messages:
- Applies word replacements
- Extracts Unicode emojis and YouTube emotes
- Tokenizes Chinese text with Jieba

```
Airflow UI → DAGs → process_chat_messages → ▶️ Trigger DAG
```

> ⏰ **Schedule:** Runs every hour automatically (`0 * * * *`)

### Step 3: Discover New Words

**DAG:** `discover_new_words`

Uses Gemini AI to find new slang, memes, and typos from chat messages:

```
Airflow UI → DAGs → discover_new_words → ▶️ Trigger DAG
```

> ⏰ **Schedule:** Runs every 3 hours automatically (`0 */3 * * *`)
> 
> ⚠️ **Requires:** `GEMINI_API_KEY` in Airflow Variables

---

## DAG Dependency Order

```mermaid
flowchart LR
    A[import_text_analysis_dicts] --> B[process_chat_messages]
    B --> C[discover_new_words]
    
    style A fill:#4CAF50,color:#fff
    style B fill:#2196F3,color:#fff
    style C fill:#9C27B0,color:#fff
```

| Order | DAG | Purpose | Trigger |
|-------|-----|---------|---------|
| 1️⃣ | `import_text_analysis_dicts` | Load base dictionaries | Manual (once) |
| 2️⃣ | `process_chat_messages` | ETL pipeline | Hourly (auto) |
| 3️⃣ | `discover_new_words` | AI word discovery | Every 3h (auto) |

---

## Troubleshooting

### Airflow Variables not found

```
ValueError: GEMINI_API_KEY not found in Airflow Variables or Environment Variables
```

**Solution:** Add `GEMINI_API_KEY` in Airflow UI → Admin → Variables

### DAG not appearing in Airflow

**Solution:** Check DAG syntax errors:

```bash
docker-compose exec airflow-webserver airflow dags list
```

### PostgreSQL connection failed

**Solution:** Ensure PostgreSQL container is healthy:

```bash
docker-compose ps postgres
docker-compose logs postgres
```

---

## Service URLs Summary

| Service | URL | Default Credentials |
|---------|-----|---------------------|
| Dashboard | http://localhost:3000 | - |
| API Docs (Swagger) | http://localhost:8000/docs | - |
| Airflow | http://localhost:8080 | `airflow` / `airflow` |
| pgAdmin | http://localhost:5050 | See `.env` |

---

## Next Steps

1. ✅ Start collecting chat messages (automatic via `hermes-worker`)
2. ✅ Process messages with ETL (automatic via Airflow)
3. 🎯 Review AI-discovered words in Dashboard Admin panel
4. 📊 Explore data in Dashboard or via API

For development commands, see [CLAUDE.md](./CLAUDE.md).
