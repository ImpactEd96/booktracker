// functions/auth/login.js

import { verifyPassword, signJWT } from "../_lib/crypto.js";
import { json, err, setCookieHeader, validateEmail, checkFields, clientIp } from "../_lib/helpers.js";
import { loginBlocked, recordFailedLogin, clearFailedLogins } from "../_lib/ratelimit.js";

// Used to check a password when there's no such account, so that a wrong email
// takes as long as a wrong password and doesn't reveal which emails exist
const DUMMY_SALT = "00".repeat(16);
const DUMMY_HASH = "00".repeat(32);

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return err("Invalid request body");
  }

  const { email, password } = body;

  if (!email || !password) {
    return err("Email and password are required");
  }
  const problem = checkFields(body, ["email", "password"]);
  if (problem) return err(problem);
  if (!validateEmail(email)) {
    return err("Invalid email address");
  }

  const emailLower = email.toLowerCase();
  const ip = clientIp(request);

  if (await loginBlocked(env.DB, emailLower, ip)) {
    return err("Too many failed sign-in attempts. Please wait 15 minutes and try again.", 429);
  }

  const user = await env.DB.prepare(
    "SELECT id, email, name, password_hash, password_salt FROM users WHERE email = ?"
  ).bind(emailLower).first();

  const valid = user
    ? await verifyPassword(password, user.password_hash, user.password_salt)
    : (await verifyPassword(password, DUMMY_HASH, DUMMY_SALT), false);

  // Same error message for missing user or wrong password — don't leak which
  if (!valid) {
    await recordFailedLogin(env.DB, emailLower, ip);
    return err("Invalid email or password", 401);
  }

  await clearFailedLogins(env.DB, emailLower);

  const token = await signJWT(
    { sub: user.id, email: user.email, name: user.name },
    env.JWT_SECRET
  );

  return json({ ok: true }, 200, { "Set-Cookie": setCookieHeader(token) });
}
