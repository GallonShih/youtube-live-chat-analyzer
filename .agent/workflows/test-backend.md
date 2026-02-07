---
description: Run dashboard backend unit tests in Docker with PostgreSQL
---

# Run Dashboard Backend Unit Tests

Execute unit tests for the dashboard backend using Docker container with PostgreSQL.

## Steps

// turbo
1. Run tests using the existing service image with PostgreSQL
```bash
cd dashboard/backend

# Verify network name first as it might vary by compose project name (default: hermes_analyzer-network)
NETWORK_NAME=$(docker network ls --filter name=analyzer-network --format "{{.Name}}")
[ -z "$NETWORK_NAME" ] && echo "Error: analyzer-network not found. Please run 'docker-compose up -d' first." && exit 1

docker run --rm --network $NETWORK_NAME \
  -v $(pwd):/app \
  -w /app \
  -e DATABASE_URL=postgresql://hermes:hermes@postgres:5432/hermes_test \
  -e ADMIN_PASSWORD=admin123 \
  -e JWT_SECRET_KEY=test_secret_key_for_testing \
  gallonshih/youtube-chat-analyzer-backend:latest \
  sh -c "pip install pytest pytest-cov httpx==0.25.2 -q && pytest"
```

## Expected Output
- 411+ passed tests
- Coverage >= 70%
- HTML coverage report generated in `htmlcov/`

## Notes
- Uses PostgreSQL `hermes_test` database for testing (matches production environment)
- Test results include coverage report with per-module breakdown
