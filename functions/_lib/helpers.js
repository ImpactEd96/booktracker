// functions/_lib/helpers.js

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

export function err(message, status = 400) {
  return json({ error: message }, status);
}

export function setCookieHeader(token) {
  return `session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`;
}

export function clearCookieHeader() {
  return `session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

export function getCookieToken(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? match[1] : null;
}

export function randomId() {
  return crypto.randomUUID();
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

// Limits for every text field the API accepts: [friendly name, max length, optional format]
const FIELDS = {
  name: ["Name", 100],
  email: ["Email", 254],
  password: ["Password", 1024],
  title: ["Title", 300],
  author: ["Author", 300],
  isbn: ["ISBN", 20],
  notes: ["Notes", 5000],
  cover_url: ["Cover link", 1000, /^https?:\/\//i],
  book_id: ["Book", 100],
  borrower_name: ["Borrower's name", 100],
  borrower_email: ["Borrower's email", 254],
  lender_name: ["Lender's name", 100],
  lender_email: ["Lender's email", 254],
  due_at: ["Due date", 10, /^\d{4}-\d{2}-\d{2}$/],
};

// Returns an error message if any of the named fields isn't text, is too long,
// or has the wrong format; otherwise null. Empty/missing fields are allowed here
// (each endpoint checks its own required fields).
export function checkFields(body, names) {
  for (const name of names) {
    const value = body[name];
    if (value === undefined || value === null || value === "") continue;
    const [label, max, format] = FIELDS[name];
    if (typeof value !== "string") return `${label} must be text`;
    if (value.length > max) return `${label} is too long (maximum ${max} characters)`;
    if (format && !format.test(value)) return `${label} isn't valid`;
  }
  return null;
}
