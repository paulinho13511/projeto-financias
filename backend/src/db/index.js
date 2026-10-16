'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

/**
 * Migrações versionadas por PRAGMA user_version.
 * Cada item é aplicado uma única vez, em transação. Nunca edite uma migração
 * já publicada: crie uma nova no fim da lista.
 */
const MIGRATIONS = [
  // v1: base de usuários e finanças. Valores monetários em centavos (INTEGER), nunca em float.
  `
  CREATE TABLE users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    email          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    name           TEXT    NOT NULL,
    password_hash  TEXT    NOT NULL,
    role           TEXT    NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    active         INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    -- incrementado ao trocar senha ou desativar conta: invalida tokens JWT antigos
    token_version  INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE cards (
    id          TEXT    PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    close_day   INTEGER NOT NULL CHECK (close_day BETWEEN 1 AND 31),
    due_day     INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX idx_cards_user ON cards(user_id);

  CREATE TABLE transactions (
    id           TEXT    PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type         TEXT    NOT NULL CHECK (type IN ('income', 'expense')),
    description  TEXT    NOT NULL,
    category     TEXT    NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    occurred_on  TEXT    NOT NULL CHECK (occurred_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    card_id      TEXT    REFERENCES cards(id) ON DELETE SET NULL,
    created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX idx_transactions_user_date ON transactions(user_id, occurred_on);

  CREATE TABLE bills (
    id            TEXT    PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT    NOT NULL,
    category      TEXT    NOT NULL,
    amount_cents  INTEGER NOT NULL CHECK (amount_cents > 0),
    kind          TEXT    NOT NULL CHECK (kind IN ('mensal', 'parcelada', 'unica')),
    -- mensal: due_day + start_month (+ end_month opcional); parcelada: start_month + parcels; unica: single_date
    due_day       INTEGER CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31),
    start_month   TEXT,
    end_month     TEXT,
    parcels       INTEGER CHECK (parcels IS NULL OR parcels BETWEEN 1 AND 120),
    single_date   TEXT,
    card_id       TEXT    REFERENCES cards(id) ON DELETE SET NULL,
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX idx_bills_user ON bills(user_id);

  -- conta paga em um mês específico (YYYY-MM)
  CREATE TABLE bill_payments (
    bill_id  TEXT    NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month    TEXT    NOT NULL,
    paid_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (bill_id, month)
  );
  CREATE INDEX idx_bill_payments_user ON bill_payments(user_id);

  CREATE TABLE goals (
    id            TEXT    PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT    NOT NULL,
    target_cents  INTEGER NOT NULL CHECK (target_cents > 0),
    saved_cents   INTEGER NOT NULL DEFAULT 0 CHECK (saved_cents >= 0),
    deadline      TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX idx_goals_user ON goals(user_id);

  -- histórico de depósitos de cada meta (acompanhamento ao longo do tempo)
  CREATE TABLE goal_deposits (
    id            TEXT    PRIMARY KEY,
    goal_id       TEXT    NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_cents  INTEGER NOT NULL CHECK (amount_cents > 0),
    deposited_on  TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX idx_goal_deposits_goal ON goal_deposits(goal_id, deposited_on);
  `,
];

/**
 * Abre (ou cria) o banco SQLite, aplica o modo WAL, as chaves estrangeiras
 * e as migrações pendentes.
 */
function openDatabase(file) {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }

  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  const current = db.pragma('user_version', { simple: true });
  for (let version = current; version < MIGRATIONS.length; version += 1) {
    const applyMigration = db.transaction(() => {
      db.exec(MIGRATIONS[version]);
      db.pragma(`user_version = ${version + 1}`);
    });
    applyMigration();
  }

  return db;
}

module.exports = { openDatabase, MIGRATIONS };
