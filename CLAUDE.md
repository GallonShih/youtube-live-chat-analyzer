# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hermes is a complete data pipeline for collecting, processing, and visualizing YouTube live stream chat messages in real-time. It captures chat messages, processes them through NLP pipelines (Chinese tokenization, emoji extraction), and uses Gemini AI to automatically discover new slang, memes, and typos from the community.

## Architecture

The system consists of five main components:

1. **hermes-worker**: Real-time chat collection using `chat-downloader` + YouTube Data API stats polling
2. **PostgreSQL**: Central database storing raw messages, processed tokens, and analysis results
3. **Airflow**: ETL orchestration (3 DAGs: dictionary imports, message processing, AI word discovery)
4. **Dashboard Backend**: FastAPI REST API serving data and admin operations
5. **Dashboard Frontend**: React + Vite + TailwindCSS for visualization and management

### Service Communication Flow

```
YouTube Live → hermes-worker → PostgreSQL
                                    ↓
                    Airflow DAGs (ETL + AI Discovery)
                                    ↓
                              PostgreSQL
                                    ↓
                        FastAPI Backend ← React Frontend
```

## Commands

### Service Management

Start all services:
```bash
docker-compose up -d
```

Stop all services:
```bash
docker-compose down
```

Rebuild specific service:
```bash
docker-compose up -d --build hermes-worker
docker-compose up -d --build dashboard-backend
docker-compose up -d --build dashboard-frontend
```

View logs:
```bash
docker-compose logs -f hermes-worker
docker-compose logs -f airflow-scheduler
docker-compose logs -f dashboard-backend
```

### Database

Access PostgreSQL:
```bash
docker-compose exec postgres psql -U hermes -d hermes
```

Database schema is auto-initialized from `database/init/*.sql` on first startup (files execute in alphabetical order).

### Airflow

Access Airflow UI at `http://localhost:8080` (default: `airflow/airflow`)

Trigger DAG manually:
```bash
docker-compose exec airflow-scheduler airflow dags trigger <dag_id>
```

List all DAGs:
```bash
docker-compose exec airflow-scheduler airflow dags list
```

### Dashboard

- Frontend: `http://localhost:3000`
- Backend API docs (Swagger): `http://localhost:8000/docs`
- pgAdmin: `http://localhost:5050`

## Configuration

All configuration is managed through `.env` file (copy from `.env.example`):

### Critical Variables
- `YOUTUBE_API_KEY`: Required for stats polling
- `YOUTUBE_URL`: Target live stream URL (can also be set via dashboard settings)
- `GEMINI_API_KEY`: Required for AI word discovery DAG
- `VITE_API_BASE_URL`: Frontend API endpoint (default: `http://localhost:8000`)

### Worker Configuration
- `POLL_INTERVAL`: Stats polling interval in seconds (default: 60)
- `CHAT_WATCHDOG_TIMEOUT`: Restart chat collector if hung for N seconds (default: 1800)
- `ENABLE_BACKFILL`: Enable chat replay backfill (default: false)

### Airflow Configuration
- `_PIP_ADDITIONAL_REQUIREMENTS`: Python packages for Airflow workers (default includes Gemini SDK, Jieba, emoji)
- Connection `postgres_hermes` is auto-configured via `AIRFLOW_CONN_POSTGRES_HERMES` environment variable

### Airflow Variables (Set in UI: Admin → Variables)
- `GEMINI_API_KEY`: Required for `discover_new_words` DAG
- `PROCESS_CHAT_DAG_START_TIME`: ISO timestamp to start processing from (default: 7 days ago)
- `DISCOVER_NEW_WORDS_PROMPT`: Custom Gemini API prompt (optional, has built-in default)

See `docs/SETUP.md` for detailed first-time setup instructions including Airflow Variables configuration.

## Database Schema

### Core Tables
- `chat_messages`: Raw messages from live chat (unique `message_id` index)
- `stream_stats`: Periodic statistics snapshots (viewers, likes, etc.)
- `processed_chat_messages`: Tokenized messages with emojis extracted

### Text Analysis Tables
- `special_words`: Custom dictionary for important words (preserved during tokenization)
- `replace_words`: Word replacement rules (typos → correct form)
- `meaningless_words`: Stopwords excluded from word clouds
- `replacement_wordlist`: User-managed replacement dictionary (via admin panel)
- `exclusion_wordlist`: User-managed exclusion dictionary (via admin panel)

### AI Discovery Tables
- `discovered_words`: AI-suggested new slang/memes/typos (pending approval)
- `rejected_words`: Previously rejected suggestions (prevents re-discovery)

### Key Indexes
- GIN indexes on `processed_chat_messages.tokens_array` for fast word frequency queries
- Composite indexes on `published_at` + `live_stream_id` for time-range queries

## Development Guidelines

### hermes_worker Service

Entry point: `hermes_worker/main.py` (HermesWorker class)

Key components:
- `chat_collector.py`: Uses `chat-downloader` library, implements watchdog timer and retry logic
- `youtube_api.py`: Polls YouTube Data API v3 for stream statistics
- `config.py`: Loads configuration from environment and database

The worker runs two threads:
1. Chat collection thread (continuous connection to live chat)
2. Stats polling thread (periodic API calls at `POLL_INTERVAL`)

### Airflow DAGs

Located in `airflow/dags/`:

1. **`import_text_analysis_dicts.py`**: Manual DAG to load JSON dictionaries into database tables
2. **`process_chat_messages.py`**: Hourly ETL pipeline (word replacement → emoji extraction → Jieba tokenization)
3. **`discover_new_words.py`**: Every 3 hours, uses Gemini API to find new slang/memes from unprocessed messages

DAGs use the `postgres_hermes` connection (auto-configured via environment variable).

Shared logic:
- `text_processor.py`: Jieba tokenization, emoji extraction, word replacement
- `word_discovery_logic.py`: Gemini API integration and result parsing

### Dashboard Backend (FastAPI)

Entry point: `dashboard/backend/main.py`

Structure:
- `app/models.py`: SQLAlchemy ORM models
- `app/routers/`: API endpoints organized by feature
  - `chat.py`: Chat message queries
  - `stats.py`: Stream statistics
  - `wordcloud.py`: Word frequency aggregation
  - `playback.py`: Time-range message playback
  - `admin_*.py`: Admin panel operations (word approval, settings, currency management)
- `app/core/`: Configuration and database connection
- `app/services/`: Business logic layer

API follows RESTful conventions. All endpoints return JSON. See `/docs` for Swagger documentation.

### Dashboard Frontend (React + Vite)

Entry point: `dashboard/frontend/src/main.jsx`

Structure:
- `src/features/`: Feature-based modules
  - `dashboard/`: Main dashboard with word cloud visualization
  - `playback/`: Timeline-based message playback
  - `admin/`: Admin panel for word approval and settings management
  - `wordcloud/`: Word cloud components
  - `messages/`: Message display components
- `src/api/`: API client functions
- `src/hooks/`: Custom React hooks
- `src/components/`: Shared UI components

Uses:
- React Router for navigation
- TailwindCSS for styling
- Chart.js (via react-chartjs-2) for visualizations
- React hooks for state management (no Redux/Context needed yet)

### Database Migrations

Place SQL scripts in `database/init/` with numeric prefixes (e.g., `12_add_new_column.sql`).

Scripts execute in alphabetical order on first container startup. For existing databases, run manually:
```bash
docker-compose exec postgres psql -U hermes -d hermes -f /docker-entrypoint-initdb.d/12_add_new_column.sql
```

Note: Changes to `database/init/` don't auto-apply to existing volumes. Either drop the volume (`docker-compose down -v`) or run SQL manually.

### Text Analysis Dictionaries

Located in `text_analysis/` (mounted read-only in Airflow):
- `special_words.json`: Words to preserve during tokenization (names, brands, memes)
- `replace_words.json`: Replacement rules `{"typo": "correct"}`
- `meaningless_words.json`: Stopwords excluded from analysis

Format: JSON files with arrays or objects. Import via `import_text_analysis_dicts` DAG.

## Key Architectural Patterns

### Idempotent Message Writes
The `chat_messages` table uses a unique index on `message_id` to prevent duplicates. All inserts use `ON CONFLICT DO NOTHING` to safely retry failed writes.

### Stateful ETL Processing
`process_chat_messages` DAG tracks the last processed message timestamp in Airflow Variables. This allows incremental processing without reprocessing old messages.

### AI Discovery Deduplication
Before sending messages to Gemini API, the DAG filters out words already in `discovered_words` or `rejected_words` tables to avoid redundant API calls.

### Frontend State Management
Dashboard uses URL query parameters to persist filter state (e.g., time range, word type). This allows direct linking to specific dashboard views.