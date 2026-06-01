// functions/auth/login.js

import { verifyPassword, signJWT } from "../_lib/crypto.js";
import { json, err, setCookieHeader, validateEmail } from "../_lib/helpers.js";

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
  if (!validateEmail(email)) {
    return err("Invalid email address");
  }

  const user = await env.DB.prepare(
    "SELECT id, email, name, password_hash, password_salt FROM users WHERE email = ?"
  ).bind(email.toLowerCase()).first();

  // Same error message for missing user or wrong password — don't leak which
  if (!user) {
    return err("Invalid email or password", 401);
  }

  const valid = await verifyPassword(password, user.password_hash, user.password_salt);
  if (!valid) {
    return err("Invalid email or password", 401);
  }

  const token = await signJWT(
    { sub: user.id, email: user.email, name: user.name },
    env.JWT_SECRET
  );

  return json({ ok: true }, 200, { "Set-Cookie": setCookieHeader(token) });
}
