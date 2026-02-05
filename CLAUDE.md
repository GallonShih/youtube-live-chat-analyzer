# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

## Project Overview

**YouTube Live Chat Analyzer** is a complete data pipeline for collecting, processing, and visualizing YouTube live stream chat messages in real-time. It captures chat messages, processes them through NLP pipelines (Chinese tokenization, emoji extraction), and uses Gemini AI to automatically discover new slang, memes, and typos from the community.

## Architecture

The system consists of four main components:

1. **collector**: Real-time chat collection using `chat-downloader` + YouTube Data API stats polling
2. **PostgreSQL**: Central database storing raw messages, processed tokens, and analysis results
3. **Dashboard Backend**: FastAPI REST API with built-in ETL scheduler (APScheduler)
4. **Dashboard Frontend**: React + Vite + TailwindCSS for visualization and management

### Service Communication Flow

```
YouTube Live → collector → PostgreSQL
                                    ↓
                    APScheduler ETL Tasks (in Dashboard Backend)
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
docker-compose up -d --build collector
docker-compose up -d --build dashboard-backend
docker-compose up -d --build dashboard-frontend
```

View logs:
```bash
docker-compose logs -f collector
docker-compose logs -f dashboard-backend
```

### ETL Tasks

ETL tasks are managed via the Dashboard Admin panel or API:

```bash
# Check ETL scheduler status
curl http://localhost:8000/api/admin/etl/status

# List all ETL jobs
curl http://localhost:8000/api/admin/etl/jobs

# Trigger a job manually
curl -X POST http://localhost:8000/api/admin/etl/jobs/process_chat_messages/trigger

# View execution logs
curl http://localhost:8000/api/admin/etl/logs
```

### Database

Access PostgreSQL:
```bash
docker-compose exec postgres psql -U hermes -d hermes
```

Database schema is auto-initialized from `database/init/*.sql` on first startup (files execute in alphabetical order).

### Dashboard

- Frontend: `http://localhost:3000`
- Backend API docs (Swagger): `http://localhost:8000/docs`
- pgAdmin: `http://localhost:5050`
- ETL Management: Dashboard Admin Panel → ETL Jobs

## Configuration

All configuration is managed through `.env` file (copy from `.env.example`):

### Critical Variables
- `YOUTUBE_API_KEY`: Required for stats polling
- `YOUTUBE_URL`: Target live stream URL (can also be set via dashboard settings)
- `GEMINI_API_KEY`: Required for AI word discovery DAG
- `VITE_API_BASE_URL`: Frontend API endpoint (default: `http://localhost:8000`)

### Authentication Variables
- `ADMIN_PASSWORD`: Password for admin login (required for production)
- `JWT_SECRET_KEY`: Secret key for JWT token signing (must be secure random string)
- `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`: Access token expiry (default: 15)
- `JWT_REFRESH_TOKEN_EXPIRE_DAYS`: Refresh token expiry (default: 7)

### Worker Configuration
- `POLL_INTERVAL`: Stats polling interval in seconds (default: 60)
- `CHAT_WATCHDOG_TIMEOUT`: Restart chat collector if hung for N seconds (default: 1800)
- `ENABLE_BACKFILL`: Enable chat replay backfill (default: false)

### ETL Configuration
- `ENABLE_ETL_SCHEDULER`: Enable/disable built-in ETL scheduler (default: true)
- `GEMINI_API_KEY`: Required for AI word discovery task
- `TEXT_ANALYSIS_DIR`: Path to text analysis dictionaries (default: `/app/text_analysis`)

ETL settings can also be configured via Dashboard Admin > ETL Jobs > Settings.

See `docs/SETUP.md` for detailed first-time setup instructions.

## Database Schema

### Core Tables
- `chat_messages`: Raw messages from live chat (unique `message_id` index)
- `stream_stats`: Periodic statistics snapshots (viewers, likes, etc.)
- `processed_chat_messages`: Tokenized messages with emojis extracted
- `word_trend_groups`: User-defined word groups for trend analysis

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

### Collector Service

Entry point: `collector/main.py` (CollectorWorker class)

Key components:
- `chat_collector.py`: Uses `chat-downloader` library, implements watchdog timer and retry logic
- `youtube_api.py`: Polls YouTube Data API v3 for stream statistics
- `config.py`: Loads configuration from environment and database

The worker runs two threads:
1. Chat collection thread (continuous connection to live chat)
2. Stats polling thread (periodic API calls at `POLL_INTERVAL`)

### Built-in ETL Tasks

Located in `dashboard/backend/app/etl/`:

**Task Registry** (`tasks.py`):
1. **`import_dicts`**: Load JSON dictionaries into database tables (manual trigger)
2. **`process_chat_messages`**: Hourly ETL (word replacement → emoji extraction → Jieba tokenization)
3. **`discover_new_words`**: Every 3 hours, uses Gemini API to find new slang/memes

**Processors** (`processors/`):
- `text_processor.py`: Jieba tokenization, emoji extraction, word replacement
- `chat_processor.py`: ChatProcessor class for message ETL
- `word_discovery.py`: WordDiscoveryProcessor with Gemini API integration
- `dict_importer.py`: DictImporter for loading JSON dictionaries

> **Legacy**: The original Airflow DAGs are preserved in `airflow/dags/` for reference. See `docs/legacy/AIRFLOW_GUIDE.md`.

### Dashboard Backend (FastAPI)

Entry point: `dashboard/backend/main.py`

Structure:
- `app/models.py`: SQLAlchemy ORM models
- `app/routers/`: API endpoints organized by feature
  - `auth.py`: Authentication endpoints (login, logout, refresh, me)
  - `chat.py`: Chat message queries
  - `stats.py`: Stream statistics
  - `word_trends.py`: Word trend analysis endpoints
  - `wordcloud.py`: Word frequency aggregation
  - `playback.py`: Time-range message playback
  - `admin_*.py`: Admin panel operations (word approval, settings, currency management)
  - `etl_jobs.py`: ETL task management API
  - `prompt_templates.py`: Gemini prompt template management
- `app/etl/`: Built-in ETL scheduler and processors
- `app/core/`: Configuration, database connection, and authentication
  - `auth_config.py`: Authentication settings
  - `security.py`: JWT token creation and verification
  - `dependencies.py`: FastAPI dependencies for auth
- `app/services/`: Business logic layer

API follows RESTful conventions. All endpoints return JSON. See `/docs` for Swagger documentation.

#### Authentication & Authorization

The system uses JWT-based authentication with two user roles:

| Role | Description | Access |
|------|-------------|--------|
| **Admin** | Authenticated administrator | Full access to all features |
| **Guest** | Unauthenticated visitor | Read-only access to dashboard, playback, trends |

**Protected Endpoints** (require Admin role):
- All write operations (POST, PUT, DELETE) on:
  - ETL jobs (`/api/admin/etl/*`)
  - Settings (`/api/admin/settings/*`)
  - Word approval (`/api/admin/words/*`)
  - Currency rates (`/api/admin/currency-rates`)
  - Word groups (`/api/word-groups/*` write operations)
  - Wordlists (`/api/admin/exclusion-wordlist/*`, `/api/admin/replacement-wordlist/*`)
  - Prompt templates (`/api/admin/etl/prompt-templates/*`)

**Auth Endpoints**:
```bash
# Login (returns access_token and refresh_token)
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password": "your_admin_password"}'

# Get current user info
curl http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer <access_token>"

# Refresh access token
curl -X POST http://localhost:8000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "your_refresh_token"}'

# Logout
curl -X POST http://localhost:8000/api/auth/logout \
  -H "Authorization: Bearer <access_token>"
```

**Using Protected Endpoints**:
```bash
# Example: Trigger ETL job (requires admin)
curl -X POST http://localhost:8000/api/admin/etl/jobs/process_chat_messages/trigger \
  -H "Authorization: Bearer <access_token>"
```

### Dashboard Frontend (React + Vite)

Entry point: `dashboard/frontend/src/main.jsx`

Structure:
- `src/features/`: Feature-based modules
  - `dashboard/`: Main dashboard with word cloud visualization
  - `trends/`: Word trend analysis
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
- React Context for authentication state (`AuthContext`)

**Authentication in Frontend**:
- `src/contexts/AuthContext.jsx`: Manages auth state, tokens, and API calls
- `useAuth()` hook provides: `isAdmin`, `login()`, `logout()`, `getAuthHeaders()`
- Admin-only UI elements are conditionally rendered based on `isAdmin`
- Navigation shows role indicator (Admin/Guest) with login/logout options

### Database Migrations

Place SQL scripts in `database/init/` with numeric prefixes (e.g., `12_add_new_column.sql`).

Scripts execute in alphabetical order on first container startup. For existing databases, run manually:
```bash
docker-compose exec postgres psql -U hermes -d hermes -f /docker-entrypoint-initdb.d/12_add_new_column.sql
```

Note: Changes to `database/init/` don't auto-apply to existing volumes. Either drop the volume (`docker-compose down -v`) or run SQL manually.

### Text Analysis Dictionaries

Located in `text_analysis/` (mounted read-only in Dashboard Backend):
- `special_words.json`: Words to preserve during tokenization (names, brands, memes)
- `replace_words.json`: Replacement rules `{"typo": "correct"}`
- `meaningless_words.json`: Stopwords excluded from analysis

Format: JSON files with arrays or objects. Import via Dashboard Admin > ETL Jobs > Trigger `import_dicts`.

## Key Architectural Patterns

### Idempotent Message Writes
The `chat_messages` table uses a unique index on `message_id` to prevent duplicates. All inserts use `ON CONFLICT DO NOTHING` to safely retry failed writes.

### Stateful ETL Processing
The ETL scheduler tracks the last processed message timestamp in the `etl_settings` table. This allows incremental processing without reprocessing old messages.

### AI Discovery Deduplication
Before sending messages to Gemini API, the processor filters out words already in `discovered_words` or `rejected_words` tables to avoid redundant API calls.

### Frontend State Management
Dashboard uses URL query parameters to persist filter state (e.g., time range, word type). This allows direct linking to specific dashboard views.

## CI/CD

GitHub Actions workflow (`.github/workflows/ci.yml`):

1. **detect-changes**: Identifies modified components (backend/frontend/collector)
2. **test-backend**: Runs pytest with PostgreSQL service container
3. **build-***: Builds Docker images (on PR/push with changes)
4. **deploy**: Manual DockerHub deployment via `workflow_dispatch`

```bash
# Trigger manual deployment with version tag
# Go to GitHub → Actions → CI/CD Pipeline → Run workflow
# Input version: v1.0.0 (or leave as 'latest')
```