// functions/api/loans/out.js

import { json, err, randomId } from "../../_lib/helpers.js";

export async function onRequestGet(context) {
  const { env, data } = context;

  const { results } = await env.DB.prepare(`
    SELECT
      lo.id, lo.borrower_name, lo.borrower_email,
      lo.loaned_at, lo.due_at, lo.returned_at,
      b.id AS book_id, b.title, b.author, b.cover_url
    FROM loans_out lo
    JOIN books b ON b.id = lo.book_id
    WHERE lo.lender_id = ?
    ORDER BY lo.returned_at IS NULL DESC, lo.loaned_at DESC
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

  const { book_id, borrower_name, borrower_email, due_at } = body;

  if (!book_id || !borrower_name) {
    return err("Book and borrower name are required");
  }

  const book = await env.DB.prepare(
    "SELECT id, title, author FROM books WHERE id = ? AND owner_id = ?"
  ).bind(book_id, data.user.sub).first();

  if (!book) return err("Book not found", 404);

  const existing = await env.DB.prepare(
    "SELECT id FROM loans_out WHERE book_id = ? AND returned_at IS NULL"
  ).bind(book_id).first();

  if (existing) return err("This book is already on loan");

  const id = randomId();
  await env.DB.prepare(
    "INSERT INTO loans_out (id, book_id, lender_id, borrower_name, borrower_email, due_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, book_id, data.user.sub, borrower_name.trim(), borrower_email || null, due_at || null).run();

  // If borrower_email matches a registered user, mirror as a loans_in record
  if (borrower_email) {
    const borrowerUser = await env.DB.prepare(
      "SELECT id FROM users WHERE email = ?"
    ).bind(borrower_email.toLowerCase()).first();

    if (borrowerUser) {
      const loanInId = randomId();
      await env.DB.prepare(
        "INSERT INTO loans_in (id, owner_id, title, author, lender_name, lender_email, due_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(loanInId, borrowerUser.id, book.title, book.author, data.user.name, data.user.email, due_at || null).run();
    }
  }

  const loan = await env.DB.prepare(
    "SELECT lo.*, b.title, b.author FROM loans_out lo JOIN books b ON b.id = lo.book_id WHERE lo.id = ?"
  ).bind(id).first();

  return json({ loan }, 201);
}
