// functions/api/loans/in/[id].js
// Edit or delete a book you've borrowed. Only affects your own account.

import { json, err, checkFields } from "../../../_lib/helpers.js";
import { ensureLoansInColumns } from "../../../_lib/schema.js";

async function getLoan(env, loanId, userId) {
  return env.DB.prepare(
    "SELECT id FROM loans_in WHERE id = ? AND owner_id = ?"
  ).bind(loanId, userId).first();
}

export async function onRequestPut(context) {
  const { request, env, data, params } = context;
  await ensureLoansInColumns(env.DB);

  if (!(await getLoan(env, params.id, data.user.sub))) return err("Loan not found", 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return err("Invalid request body");
  }

  const { title, author, isbn, cover_url, lender_name, lender_email, due_at } = body;
  if (!title || !author || !lender_name) {
    return err("Title, author and lender name are required");
  }
  const problem = checkFields(body, ["title", "author", "isbn", "cover_url", "lender_name", "lender_email", "due_at"]);
  if (problem) return err(problem);

  await env.DB.prepare(
    "UPDATE loans_in SET title = ?, author = ?, isbn = ?, cover_url = ?, lender_name = ?, lender_email = ?, due_at = ? WHERE id = ?"
  ).bind(title.trim(), author.trim(), isbn || null, cover_url || null, lender_name.trim(), lender_email || null, due_at || null, params.id).run();

  const loan = await env.DB.prepare("SELECT * FROM loans_in WHERE id = ?").bind(params.id).first();
  return json({ loan });
}

export async function onRequestDelete(context) {
  const { env, data, params } = context;

  if (!(await getLoan(env, params.id, data.user.sub))) return err("Loan not found", 404);

  await env.DB.prepare("DELETE FROM loans_in WHERE id = ?").bind(params.id).run();
  return json({ ok: true });
}
