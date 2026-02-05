# YouTube Live Chat Analyzer Setup Guide

Detailed setup instructions for first-time installation.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [User Roles & Authentication](#user-roles--authentication)
- [ETL Configuration](#etl-configuration)
- [Initial Setup](#initial-setup)
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

### Authentication Variables (Required for Production)

| Variable | Description | How to Generate |
|----------|-------------|-----------------|
| `ADMIN_PASSWORD` | Password for admin login | Choose a strong password |
| `JWT_SECRET_KEY` | Secret key for JWT signing | See below |

**Generate a secure JWT_SECRET_KEY:**

```bash
# Option 1: Using Python
python3 -c "import secrets; print(secrets.token_hex(32))"

# Option 2: Using OpenSSL
openssl rand -hex 32

# Option 3: Using /dev/urandom (Linux/macOS)
head -c 32 /dev/urandom | xxd -p -c 64
```

Copy the generated key to your `.env` file:
```bash
JWT_SECRET_KEY=your_generated_64_character_hex_string_here
```

> ⚠️ **Security Note**: Never use the default values in production. Always generate a unique `JWT_SECRET_KEY` and choose a strong `ADMIN_PASSWORD`.

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POLL_INTERVAL` | `60` | Stats polling interval (seconds) |
| `CHAT_WATCHDOG_TIMEOUT` | `1800` | Restart chat collector if hung (seconds) |
| `POSTGRES_PASSWORD` | `hermes` | Database password |
| `ENABLE_ETL_SCHEDULER` | `true` | Enable built-in ETL scheduler |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `15` | Access token expiry time |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | `7` | Refresh token expiry time |

---

## User Roles & Authentication

The system supports two user roles with different access levels:

### User Roles

| Role | Description | Access Level |
|------|-------------|--------------|
| **Guest** | Default role (no login required) | Read-only access to Dashboard, Playback, Trends |
| **Admin** | Authenticated administrator | Full access including Admin panel and all write operations |

### Admin Login

1. Open Dashboard: http://localhost:3000
2. Click the user icon in the navigation bar
3. Select "切換為管理員" (Switch to Admin)
4. Enter the admin password configured in `.env`

### Protected Features (Admin Only)

- **Admin Panel**: ETL jobs management, settings, word approval
- **Word Management**: Approve/reject discovered words, manage dictionaries
- **Settings**: Configure ETL parameters, currency rates
- **Write Operations**: Create/update/delete word groups, wordlists, etc.

### Token Lifecycle

| Token Type | Default Expiry | Purpose |
|------------|----------------|---------|
| Access Token | 15 minutes | API authentication |
| Refresh Token | 7 days | Obtain new access tokens |

The frontend automatically refreshes tokens before expiry. If both tokens expire, users must login again.

---

## ETL Configuration

ETL tasks are managed through the Dashboard Admin panel. No external configuration required.

### Access ETL Management

1. Open Dashboard: http://localhost:3000
2. Navigate to **Admin** (top navigation)
3. Click **ETL Jobs** tab

### Available ETL Tasks

| Task | Schedule | Description |
|------|----------|-------------|
| `import_dicts` | Manual | Import base dictionaries from `text_analysis/` folder |
| `process_chat_messages` | Hourly | ETL pipeline (word replacement → emoji extraction → tokenization) |
| `discover_new_words` | Every 3h | AI-powered word discovery using Gemini API |

### ETL Settings

Via **Admin > ETL Jobs > Settings**, you can configure:

| Setting | Description |
|---------|-------------|
| `PROCESS_CHAT_START_TIME` | Start processing from this timestamp |
| `PROCESS_CHAT_BATCH_SIZE` | Number of messages per batch |
| `DISCOVER_NEW_WORDS_ENABLED` | Enable/disable AI discovery |
| `DISCOVER_NEW_WORDS_MIN_CONFIDENCE` | Minimum confidence score for discoveries |

---

## Initial Setup

### Step 1: Start Services

```bash
# Start all services
docker-compose up -d

# Verify all containers are running
docker-compose ps
```

### Step 2: Import Dictionaries (First Time Only)

1. Open Dashboard: http://localhost:3000/admin
2. Go to **ETL Jobs** tab
3. Find `import_dicts` task
4. Click **Trigger** button

This imports base dictionaries from `text_analysis/` folder:
- `special_words.json` → `special_words` table
- `replace_words.json` → `replace_words` table
- `meaningless_words.json` → `meaningless_words` table

### Step 3: Verify ETL is Running

Check the ETL scheduler status:

```bash
curl http://localhost:8000/api/admin/etl/status
```

Expected response:
```json
{
  "scheduler_running": true,
  "jobs_count": 3
}
```

### Step 4: Start Collecting Data

The collector service starts automatically with `docker-compose up`. Verify it's working:

```bash
docker-compose logs -f collector
```

You should see log messages about chat collection starting.

---

## Troubleshooting

### ETL Tasks Not Running

**Solution:** Check if scheduler is enabled:

```bash
# Check scheduler status
curl http://localhost:8000/api/admin/etl/status

# Check environment variable
echo $ENABLE_ETL_SCHEDULER
```

Ensure `ENABLE_ETL_SCHEDULER=true` in your `.env` file.

### AI Discovery Not Working

**Solution:** Verify Gemini API key is set:

1. Check `.env` file has `GEMINI_API_KEY`
2. Restart backend: `docker-compose restart dashboard-backend`

### PostgreSQL Connection Failed

**Solution:** Ensure PostgreSQL container is healthy:

```bash
docker-compose ps postgres
docker-compose logs postgres
```

### View ETL Execution Logs

Via Dashboard:
1. Go to **Admin > ETL Jobs**
2. Click **Logs** tab

Via API:
```bash
curl http://localhost:8000/api/admin/etl/logs
```

### Admin Login Not Working

**Symptoms:** Password changed in `.env` but old password still works, or new password doesn't work.

**Solution:** The backend container needs to be recreated to pick up new environment variables:

```bash
# Restart backend with updated environment
docker-compose up -d dashboard-backend

# Verify environment variable is loaded
docker exec youtube-chat-analyzer-backend printenv | grep ADMIN_PASSWORD
```

### JWT Token Errors

**Symptoms:** "Token expired" or "Invalid token" errors.

**Solution:**
1. Clear browser localStorage: Open DevTools → Application → Local Storage → Clear
2. Login again with admin password

If issues persist, verify `JWT_SECRET_KEY` is set correctly:
```bash
docker exec youtube-chat-analyzer-backend printenv | grep JWT_SECRET_KEY
```

---

## Service URLs Summary

| Service | URL | Description |
|---------|-----|-------------|
| Dashboard | http://localhost:3000 | Main UI |
| API Docs (Swagger) | http://localhost:8000/docs | REST API documentation |
| pgAdmin | http://localhost:5050 | Database administration |

---

## Next Steps

1. ✅ Start collecting chat messages (automatic via `collector` service)
2. ✅ Process messages with ETL (automatic via built-in scheduler)
3. 🎯 Review AI-discovered words in Dashboard Admin panel
4. 📊 Explore data in Dashboard or via API

For development commands, see [CLAUDE.md](../CLAUDE.md).
