-- Create Airflow database for ETL workflows
-- This script will create the airflow database and user

-- Create airflow database
CREATE DATABASE airflow;

-- Create airflow user
CREATE USER airflow WITH PASSWORD 'airflow';

-- Grant privileges to airflow user on airflow database
GRANT ALL PRIVILEGES ON DATABASE airflow TO airflow;

-- Switch to airflow database and grant schema privileges
\c airflow;
GRANT ALL ON SCHEMA public TO airflow;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO airflow;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO airflow;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO airflow;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO airflow;