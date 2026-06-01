// functions/api/books/[id].js

import { json, err } from "../../_lib/helpers.js";

async function getBook(env, bookId, userId) {
  return env.DB.prepare(
    "SELECT * FROM books WHERE id = ? AND owner_id = ?"
  ).bind(bookId, userId).first();
}

export async function onRequestGet(context) {
  const { env, data, params } = context;
  const book = await getBook(env, params.id, data.user.sub);
  if (!book) return err("Book not found", 404);
  return json({ book });
}

export async function onRequestPut(context) {
  const { request, env, data, params } = context;

  const book = await getBook(env, params.id, data.user.sub);
  if (!book) return err("Book not found", 404);

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

  await env.DB.prepare(
    "UPDATE books SET title = ?, author = ?, isbn = ?, cover_url = ?, notes = ? WHERE id = ?"
  ).bind(title.trim(), author.trim(), isbn || null, cover_url || null, notes || null, params.id).run();

  const updated = await env.DB.prepare(
    "SELECT * FROM books WHERE id = ?"
  ).bind(params.id).first();

  return json({ book: updated });
}

export async function onRequestDelete(context) {
  const { env, data, params } = context;

  const book = await getBook(env, params.id, data.user.sub);
  if (!book) return err("Book not found", 404);

  const activeLoans = await env.DB.prepare(
    "SELECT id FROM loans_out WHERE book_id = ? AND returned_at IS NULL"
  ).bind(params.id).first();

  if (activeLoans) {
    return err("Cannot delete a book that is currently on loan");
  }

  await env.DB.prepare("DELETE FROM books WHERE id = ?").bind(params.id).run();
  return json({ ok: true });
}
