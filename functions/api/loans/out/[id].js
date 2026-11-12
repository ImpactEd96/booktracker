// functions/api/loans/out/[id].js
// Edit or delete a loan you made. Changes to the due date, and deleting the
// loan, also apply to the linked record in the borrower's account (if any).

import { json, err, checkFields } from "../../../_lib/helpers.js";
import { ensureLoansInColumns } from "../../../_lib/schema.js";

async function getLoan(env, loanId, userId) {
  return env.DB.prepare(
    "SELECT id FROM loans_out WHERE id = ? AND lender_id = ?"
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

  const { borrower_name, borrower_email, due_at } = body;
  if (!borrower_name) return err("Borrower name is required");
  const problem = checkFields(body, ["borrower_name", "borrower_email", "due_at"]);
  if (problem) return err(problem);

  await env.DB.batch([
    env.DB.prepare(
      "UPDATE loans_out SET borrower_name = ?, borrower_email = ?, due_at = ? WHERE id = ?"
    ).bind(borrower_name.trim(), borrower_email || null, due_at || null, params.id),
    env.DB.prepare(
      "UPDATE loans_in SET due_at = ? WHERE loan_out_id = ?"
    ).bind(due_at || null, params.id),
  ]);

  const loan = await env.DB.prepare(
    "SELECT lo.*, b.title, b.author FROM loans_out lo JOIN books b ON b.id = lo.book_id WHERE lo.id = ?"
  ).bind(params.id).first();

  return json({ loan });
}

export async function onRequestDelete(context) {
  const { env, data, params } = context;
  await ensureLoansInColumns(env.DB);

  if (!(await getLoan(env, params.id, data.user.sub))) return err("Loan not found", 404);

  await env.DB.batch([
    env.DB.prepare("DELETE FROM loans_in WHERE loan_out_id = ?").bind(params.id),
    env.DB.prepare("DELETE FROM loans_out WHERE id = ?").bind(params.id),
  ]);

  return json({ ok: true });
}
