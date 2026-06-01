// functions/api/users/me.js

import { json, err } from "../../_lib/helpers.js";

export async function onRequestGet(context) {
  const { env, data } = context;

  const user = await env.DB.prepare(
    "SELECT id, email, name, created_at FROM users WHERE id = ?"
  ).bind(data.user.sub).first();

  if (!user) return err("User not found", 404);
  return json({ user });
}
