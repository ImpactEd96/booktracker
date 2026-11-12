// functions/auth/signup.js

import { hashPassword, signJWT } from "../_lib/crypto.js";
import { json, err, setCookieHeader, randomId, validateEmail, checkFields, clientIp } from "../_lib/helpers.js";
import { signupBlocked, recordSignupAttempt } from "../_lib/ratelimit.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return err("Invalid request body");
  }

  const { name, email, password } = body;

  if (!name || !email || !password) {
    return err("Name, email and password are required");
  }
  const problem = checkFields(body, ["name", "email", "password"]);
  if (problem) return err(problem);
  if (!validateEmail(email)) {
    return err("Invalid email address");
  }
  if (password.length < 8) {
    return err("Password must be at least 8 characters");
  }
  if (name.trim().length < 2) {
    return err("Name must be at least 2 characters");
  }

  // Limit sign-ups per network, so nobody can use this form to check
  // lots of email addresses for existing accounts
  const ip = clientIp(request);
  if (await signupBlocked(env.DB, ip)) {
    return err("Too many sign-up attempts. Please try again in an hour.", 429);
  }
  await recordSignupAttempt(env.DB, email.toLowerCase(), ip);

  const existing = await env.DB.prepare(
    "SELECT id FROM users WHERE email = ?"
  ).bind(email.toLowerCase()).first();

  if (existing) {
    return err("An account with that email already exists");
  }

  const { hash, salt } = await hashPassword(password);
  const id = randomId();

  await env.DB.prepare(
    "INSERT INTO users (id, email, name, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, email.toLowerCase(), name.trim(), hash, salt).run();

  const token = await signJWT({ sub: id, email: email.toLowerCase(), name: name.trim() }, env.JWT_SECRET);

  return json({ ok: true }, 201, { "Set-Cookie": setCookieHeader(token) });
}
