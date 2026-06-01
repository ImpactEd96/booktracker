// functions/api/books/index.js

import { json, err, randomId } from "../../_lib/helpers.js";

export async function onRequestGet(context) {
  const { env, data } = context;
  const user = data.user;

  const { results } = await env.DB.prepare(`
    SELECT
      b.id, b.title, b.author, b.isbn, b.cover_url, b.notes, b.created_at,
      CASE WHEN lo.id IS NOT NULL THEN 1 ELSE 0 END AS on_loan,
      lo.borrower_name, lo.loaned_at, lo.due_at
    FROM books b
    LEFT JOIN loans_out lo ON lo.book_id = b.id AND lo.returned_at IS NULL
    WHERE b.owner_id = ?
    ORDER BY b.title ASC
  `).bind(user.sub).all();

  return json({ books: results });
}

export async function onRequestPost(context) {
  const { request, env, data } = context;
  const user = data.user;

  let body;
  try {
    body = await request.json();
  } catch {
    return err("Invalid request body");
  }

  const { title, author, isbn, cover_url, notes } = body;

  if (!title || !author) {
    return err("Title and author are required");
  }

  const id = randomId();
  await env.DB.prepare(
    "INSERT INTO books (id, owner_id, title, author, isbn, cover_url, notes) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, user.sub, title.trim(), author.trim(), isbn || null, cover_url || null, notes || null).run();

  const book = await env.DB.prepare(
    "SELECT * FROM books WHERE id = ?"
  ).bind(id).first();

  return json({ book }, 201);
}
