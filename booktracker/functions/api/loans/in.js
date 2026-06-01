// functions/api/loans/in.js

import { json, err, randomId } from "../../_lib/helpers.js";

export async function onRequestGet(context) {
  const { env, data } = context;

  const { results } = await env.DB.prepare(`
    SELECT id, title, author, lender_name, lender_email,
           borrowed_at, due_at, returned_at
    FROM loans_in
    WHERE owner_id = ?
    ORDER BY returned_at IS NULL DESC, borrowed_at DESC
  `).bind(data.user.sub).all();

  return json({ loans: results });
}

export async function onRequestPost(context) {
  const { request, env, data } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return err("Invalid request body");
  }

  const { title, author, lender_name, lender_email, due_at } = body;

  if (!title || !author || !lender_name) {
    return err("Title, author and lender name are required");
  }

  const id = randomId();
  await env.DB.prepare(
    "INSERT INTO loans_in (id, owner_id, title, author, lender_name, lender_email, due_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, data.user.sub, title.trim(), author.trim(), lender_name.trim(), lender_email || null, due_at || null).run();

  const loan = await env.DB.prepare(
    "SELECT * FROM loans_in WHERE id = ?"
  ).bind(id).first();

  return json({ loan }, 201);
}
