-- Esquema de la base de datos del sistema de pagos

CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tarjetas (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    card_number VARCHAR(16) NOT NULL,
    cardholder VARCHAR(100) NOT NULL,
    expiration_date VARCHAR(5) NOT NULL,
    cvv VARCHAR(4) NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'credit',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pagos (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    card_id INTEGER NOT NULL REFERENCES tarjetas(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    reference VARCHAR(50),
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para mejorar el rendimiento de las consultas por usuario
CREATE INDEX idx_pagos_user ON pagos(user_id);
CREATE INDEX idx_tarjetas_user ON tarjetas(user_id);

-- Permisos mínimos necesarios para el usuario de la aplicación
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO pagos_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pagos_user;
