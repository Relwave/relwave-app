-- PostgreSQL seed script for test databases
-- Run this in the postgres container

-- Create test tables
CREATE TABLE IF NOT EXISTS persons (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    address VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample data
INSERT INTO persons (name, email) VALUES 
    ('John Doe', 'john@example.com'),
    ('Jane Smith', 'jane@example.com'),
    ('Bob Wilson', 'bob@example.com')
ON CONFLICT DO NOTHING;

INSERT INTO student (name, address) VALUES 
    ('Alice Johnson', '123 Main St'),
    ('Charlie Brown', '456 Oak Ave'),
    ('Diana Ross', '789 Pine Rd')
ON CONFLICT DO NOTHING;
