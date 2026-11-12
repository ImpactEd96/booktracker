// functions/_lib/ratelimit.js
// Limits on sign-in and sign-up attempts, stored in D1.

import { ensureAuthAttemptsTable } from "./schema.js";

const LOGIN_WINDOW = 15 * 60;     // seconds
const LOGIN_MAX_PER_EMAIL = 5;    // failed sign-ins for one account
const LOGIN_MAX_PER_IP = 20;      // failed sign-ins from one network, across all accounts
const SIGNUP_WINDOW = 60 * 60;
const SIGNUP_MAX_PER_IP = 10;
const KEEP_FOR = 24 * 60 * 60;    // old attempts are deleted after a day

const now = () => Math.floor(Date.now() / 1000);

export async function loginBlocked(db, email, ip) {
  await ensureAuthAttemptsTable(db);
  const row = await db.prepare(`
    SELECT SUM(email = ?) AS by_email, SUM(ip = ?) AS by_ip
    FROM auth_attempts WHERE kind = 'login' AND attempted_at > ?
  `).bind(email, ip, now() - LOGIN_WINDOW).first();
  return (row?.by_email ?? 0) >= LOGIN_MAX_PER_EMAIL || (row?.by_ip ?? 0) >= LOGIN_MAX_PER_IP;
}

export async function recordFailedLogin(db, email, ip) {
  await record(db, "login", email, ip);
}

export async function clearFailedLogins(db, email) {
  await db.prepare("DELETE FROM auth_attempts WHERE kind = 'login' AND email = ?").bind(email).run();
}

export async function signupBlocked(db, ip) {
  await ensureAuthAttemptsTable(db);
  const row = await db.prepare(`
    SELECT COUNT(*) AS n FROM auth_attempts
    WHERE kind = 'signup' AND ip = ? AND attempted_at > ?
  `).bind(ip, now() - SIGNUP_WINDOW).first();
  return (row?.n ?? 0) >= SIGNUP_MAX_PER_IP;
}

export async function recordSignupAttempt(db, email, ip) {
  await record(db, "signup", email, ip);
}

async function record(db, kind, email, ip) {
  await db.batch([
    db.prepare("INSERT INTO auth_attempts (kind, email, ip, attempted_at) VALUES (?, ?, ?, ?)")
      .bind(kind, email, ip, now()),
    db.prepare("DELETE FROM auth_attempts WHERE attempted_at < ?").bind(now() - KEEP_FOR),
  ]);
}
