#!/bin/sh
set -e

if [ "$APP_ENV" = "dev" ]; then
    echo "Running in DEV mode with reload"
    exec uvicorn main:app --host 0.0.0.0 --port 8000 --reload
else
    WORKERS=${APP_WORKERS:-4}
    echo "Running in PROD mode with $WORKERS workers"
    exec uvicorn main:app --host 0.0.0.0 --port 8000 --workers $WORKERS
fi
