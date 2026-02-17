# 📊 Dashboard Backend

The backend engine for the YouTube Live Chat Analyzer, built with modern Python technologies to handle real-time data processing and analytics.

**Tech Stack**:
- **Framework**: FastAPI (Async)
- **Database**: SQLAlchemy (ORM) + PostgreSQL
- **Testing**: Pytest + Docker

## 🚀 Key Features and Optimizations

### Playback Analytics (`app/routers/playback.py`)

This router powers the interactive playback timeline, providing synchronized chat density, viewer counts, and paid message overlays.

**Optimization: Single-Pass Sliding Window**
- **Problem**: Previous implementations queried the database for each time step (e.g., every 5 minutes), leading to O(N) queries and slow performance on long streams.
- **Solution**: Implemented a **single-pass sliding window** algorithm.
  - Fetches all relevant chat and viewer data data for the entire requested range in **one SQL query**.
  - Processes data in-memory using an efficient sliding window approach.
  - Dynamically calculates message density and viewer stats for each time slice without hitting the DB repeatedly.
- **Result**: Drastic reduction in latency and database load, enabling smooth playback navigation even for 12+ hour streams.

### Playback Word Cloud (`app/routers/playback_wordcloud.py`)

Generates time-series word usage data, allowing the frontend to display an evolving word cloud synced with the video playback.

**Optimization: In-Memory Aggregation**
- **Logic**: Accepts a `window_hours` parameter (e.g., 1 hour) and slides it across the timeline with a specified `step_seconds` (e.g., 60 seconds).
- **Efficiency**: Similar to the playback metrics, this uses a **single query** to fetch word occurences.
- **Algorithm**: Maintains a running counter of word frequencies. As the window slides forward:
  - Words entering the window are **added** to the counter.
  - Words leaving the window are **subtracted**.
- **Impact**: Generates hundreds of word cloud snapshots in sub-second time, enabling real-time visualization of trend shifts.

## 📂 Project Structure

- **`app/routers/`**: API endpoints grouped by feature.
  - `admin_*.py`: Administrative endpoints for dictionary and settings management.
  - `chat.py`: Real-time chat retrieval and statistics.
  - `etl_jobs.py`: Control and monitoring of ETL pipelines.
  - `text_mining.py`: AI-powered slang and new word discovery.
