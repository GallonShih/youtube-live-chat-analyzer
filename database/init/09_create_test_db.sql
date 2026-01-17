-- Create test database for unit tests
-- This script runs during PostgreSQL initialization (from scratch)

-- Create hermes_test database
CREATE DATABASE hermes_test;

-- Grant privileges to hermes user
GRANT ALL PRIVILEGES ON DATABASE hermes_test TO hermes;
