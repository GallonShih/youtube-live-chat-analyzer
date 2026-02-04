#!/bin/sh
set -e

if [ "$APP_ENV" = "dev" ]; then
    echo "Running in DEV mode (Vite Dev Server)"
    exec npm run dev -- --host
else
    echo "Running in PROD mode (Vite Build + Preview)"
    echo "Building for production..."
    npm run build
    echo "Starting preview server..."
    exec npm run preview -- --host --port 3000
fi
