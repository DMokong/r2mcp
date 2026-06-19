-- Runs once on first container init (docker-entrypoint-initdb.d).
-- Provisions the test database alongside the dev database so the vitest suite
-- has a dedicated r2mcp_test to run against (claw-i6td.3). Enables pgvector in
-- both so schema.sql's vector(1536) column type is available.
CREATE DATABASE r2mcp_test;
\connect r2mcp_test
CREATE EXTENSION IF NOT EXISTS vector;
\connect r2mcp
CREATE EXTENSION IF NOT EXISTS vector;
