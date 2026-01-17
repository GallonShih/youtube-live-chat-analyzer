---
description: Run dashboard backend unit tests in Docker with PostgreSQL
---

# Run Dashboard Backend Unit Tests

Execute unit tests for the dashboard backend using Docker container with PostgreSQL.

## Steps

1. Navigate to the backend directory
```bash
cd /Users/gallon/Documents/hermes/dashboard/backend
```

// turbo
2. Run tests using the existing service image with PostgreSQL
```bash
docker run --rm --network hermes_hermes-network -v $(pwd):/app -w /app -e DATABASE_URL=postgresql://hermes:hermes@hermes-postgres:5432/hermes_test hermes_dashboard-backend:latest sh -c "pip install pytest pytest-cov httpx==0.25.2 -q && pytest"
```

## Expected Output
- 62+ passed tests
- Coverage >= 70%
- HTML coverage report generated in `htmlcov/`

## Notes
- Uses PostgreSQL `hermes_test` database for testing (matches production environment)
- Test results include coverage report with per-module breakdown
