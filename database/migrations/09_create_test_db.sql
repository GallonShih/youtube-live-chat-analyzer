-- Migration script to create test database on running PostgreSQL
-- Run this manually if PostgreSQL is already running

-- Check if database exists and create if not
-- Note: Run this as superuser (e.g., hermes user)

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'hermes_test') THEN
        PERFORM dblink_exec('dbname=postgres', 'CREATE DATABASE hermes_test');
    END IF;
END
$$;

-- Alternative: Run these commands directly in psql if dblink is not available
-- SELECT 'CREATE DATABASE hermes_test' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'hermes_test')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE hermes_test TO hermes;
