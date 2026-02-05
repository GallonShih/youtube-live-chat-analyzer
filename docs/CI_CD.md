# CI/CD Pipeline

This document describes the GitHub Actions CI/CD pipeline for the YouTube Live Chat Analyzer project.

---

## Overview

The pipeline (`.github/workflows/ci.yml`) automates:

1. **Testing** - Run backend unit tests with PostgreSQL
2. **Building** - Build Docker images for modified components
3. **Deploying** - Push images to Docker Hub (manual trigger)

---

## Workflow Triggers

| Trigger | Behavior |
|---------|----------|
| `push` to **任何分支** | 偵測變更，backend 有變更時執行測試 |
| `push` to `master` | 測試通過後 build images |
| `pull_request` to `master` | 偵測變更，backend 有變更時執行測試 |
| `workflow_dispatch` | 手動部署到 Docker Hub |

---

## Jobs

### 1. detect-changes

Identifies which components have changed:

- `dashboard/backend/**` → `backend`
- `dashboard/frontend/**` → `frontend`
- `collector/**` → `worker`

### 2. test-backend

Runs pytest with coverage (只在 backend 有變更時執行):

```bash
pytest --cov=app --cov-report=term-missing --cov-report=html
```

- Uses PostgreSQL service container
- Uploads coverage report as artifact
- Required for backend build job

### 3. build-* (backend/frontend/worker)

Builds Docker images using `docker/build-push-action`:

- **只在 master 分支執行**
- Only runs if corresponding component has changes
- Uses GitHub Actions cache for faster builds
- Does NOT push to registry (PR/push only)

### 4. deploy

Manual deployment to Docker Hub:

- Triggered via `workflow_dispatch`
- Builds and pushes ALL components
- Supports optional version tagging

---

## Manual Deployment

### Via GitHub UI

1. Go to **Actions** → **CI/CD Pipeline**
2. Click **Run workflow**
3. (Optional) Enter version tag (e.g., `v1.0.0`)
4. Click **Run workflow**

### Version Tags

| Input | Result |
|-------|--------|
| (empty or `latest`) | Tags: `latest`, `<commit-sha>` |
| `v1.0.0` | Tags: `latest`, `v1.0.0`, `<commit-sha>` |

---

## Docker Hub Images

| Image | Description |
|-------|-------------|
| `<username>/youtube-chat-analyzer-backend` | FastAPI backend with ETL scheduler |
| `<username>/youtube-chat-analyzer-frontend` | React dashboard |
| `<username>/youtube-chat-analyzer-collector` | Chat collection worker |

---

## Required GitHub Secrets

Configure in **Settings → Secrets and variables → Actions**:

| Secret | Description |
|--------|-------------|
| `DOCKERHUB_USERNAME` | Docker Hub username |
| `DOCKERHUB_TOKEN` | Docker Hub access token |

---

## Coverage Reports

Backend test coverage reports are automatically uploaded as artifacts:

1. Go to workflow run
2. Download `coverage-report` artifact
3. Open `htmlcov/index.html` in browser

Reports are retained for 30 days.

---

## Local Testing

To run the same tests locally:

```bash
cd dashboard/backend

# Install dependencies
pip install -r requirements.txt
pip install pytest pytest-cov httpx==0.25.2

# Run tests (requires PostgreSQL)
DATABASE_URL=postgresql://hermes:hermes@localhost:5432/hermes_test \
  pytest --cov=app --cov-report=term-missing
```

Or use Docker:
```bash
docker run --rm \
  -v $(pwd):/app \
  -w /app/dashboard/backend \
  -e DATABASE_URL=postgresql://hermes:hermes@postgres:5432/hermes_test \
  --network hermes_analyzer-network \
  python:3.11 \
  bash -c "pip install -r requirements.txt pytest pytest-cov httpx && pytest"
```
