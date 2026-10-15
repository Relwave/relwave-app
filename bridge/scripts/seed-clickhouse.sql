-- ClickHouse seed script for test databases
-- Mounted to /docker-entrypoint-initdb.d/seed.sql

CREATE DATABASE IF NOT EXISTS testdb;

CREATE TABLE IF NOT EXISTS testdb.TestTable (
    id UInt32,
    name String,
    created_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY id;

CREATE TABLE IF NOT EXISTS testdb.persons (
    id UInt32,
    name String,
    email Nullable(String),
    created_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY id;

CREATE TABLE IF NOT EXISTS testdb.student (
    id UInt32,
    name String,
    address Nullable(String),
    created_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY id;

INSERT INTO testdb.TestTable (id, name) VALUES 
    (1, 'Test Item 1'),
    (2, 'Test Item 2'),
    (3, 'Test Item 3');

INSERT INTO testdb.persons (id, name, email) VALUES 
    (1, 'John Doe', 'john@example.com'),
    (2, 'Jane Smith', 'jane@example.com'),
    (3, 'Bob Wilson', 'bob@example.com');

INSERT INTO testdb.student (id, name, address) VALUES 
    (1, 'Alice Johnson', '123 Main St'),
    (2, 'Charlie Brown', '456 Oak Ave'),
    (3, 'Diana Ross', '789 Pine Rd');
