# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hermes is a YouTube live stream chat collection and analysis system. The project uses Docker Compose to orchestrate services for collecting, storing, and analyzing YouTube live chat messages and statistics.

## Architecture

### Current Services (Phase 1)
- **PostgreSQL**: Data storage for chat messages and stream statistics
- **hermes_worker**: Collects live chat messages using chat-downloader and polls YouTube Data API for statistics

### Future Services (Commented in docker-compose.yml)
- **ETL-Analysis**: Data cleaning, tokenization, word frequency analysis, text cloud generation
- **Metabase**: BI tool for data visualization

## Commands

### Development

Start all services:
```bash
docker-compose up -d
```

Stop all services:
```bash
docker-compose down
```

View logs:
```bash
docker-compose logs -f
docker-compose logs -f hermes-worker
docker-compose logs -f postgres
```

Rebuild and restart hermes-worker:
```bash
docker-compose up -d --build hermes-worker
```

### Database

Access PostgreSQL:
```bash
docker-compose exec postgres psql -U hermes -d hermes
```

Run SQL migrations:
```bash
docker-compose exec postgres psql -U hermes -d hermes -f /docker-entrypoint-initdb.d/schema.sql
```

## Configuration

All configuration is managed through `.env` file (copy from `.env.example`):
- Database credentials
- YouTube API key
- hermes_worker polling intervals
- Retry/backfill settings

## Database Schema

Key tables:
- `chat_messages`: Stores live chat messages with `message_id` unique index
- `stream_stats`: Stores periodic statistics snapshots
- Future: `etl_tokens`, `etl_aggregates`, `etl_insights`

Important indexes:
- `message_id` (unique)
- `published_at`
- `live_stream_id`

## Development Guidelines

### hermes_worker Service
- Located in `hermes_worker/` directory
- Implements retry logic with exponential backoff for API/DB failures
- Backfill functionality (optional) only attempts if Live Chat Replay is available
- Must ensure idempotent writes to prevent duplicate messages

### Database Migrations
- Place initialization scripts in `database/init/`
- Files are automatically executed by PostgreSQL container on first startup

## Project Structure

```
hermes/
├── hermes_worker/       # Worker service for chat collection
├── database/
│   └── init/           # Database initialization scripts
├── docker-compose.yml
├── .env.example
├── .gitignore
├── README.md
└── CLAUDE.md
```