-- BookTracker D1 Schema
-- Run with: npx wrangler d1 execute booktracker-db --file=schema.sql

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS books (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  author      TEXT NOT NULL,
  isbn        TEXT,
  cover_url   TEXT,
  notes       TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loans_out (
  id           TEXT PRIMARY KEY,
  book_id      TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  lender_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  borrower_name TEXT NOT NULL,
  borrower_email TEXT,
  loaned_at    TEXT DEFAULT (datetime('now')),
  due_at       TEXT,
  returned_at  TEXT
);

CREATE TABLE IF NOT EXISTS loans_in (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  author       TEXT NOT NULL,
  isbn         TEXT,
  cover_url    TEXT,
  lender_name  TEXT NOT NULL,
  lender_email TEXT,
  borrowed_at  TEXT DEFAULT (datetime('now')),
  due_at       TEXT,
  returned_at  TEXT,
  loan_out_id  TEXT  -- set when created from someone else's loan (loans_out.id)
);

-- Recent failed sign-ins and sign-up attempts, for rate limiting
CREATE TABLE IF NOT EXISTS auth_attempts (
  kind         TEXT NOT NULL,   -- 'login' or 'signup'
  email        TEXT,
  ip           TEXT,
  attempted_at INTEGER NOT NULL -- unix seconds
);

CREATE INDEX IF NOT EXISTS idx_books_owner ON books(owner_id);
CREATE INDEX IF NOT EXISTS idx_loans_out_lender ON loans_out(lender_id);
CREATE INDEX IF NOT EXISTS idx_loans_out_book ON loans_out(book_id);
CREATE INDEX IF NOT EXISTS idx_loans_in_owner ON loans_in(owner_id);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_time ON auth_attempts(attempted_at);
