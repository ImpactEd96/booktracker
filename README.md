# Shelf Life

A personal book library and loan tracker, designed mainly for use on a phone. It keeps track of the books you own, who you've lent them to, and what you've borrowed from other people.

Live from the `main` branch on Cloudflare Pages: pushing to `main` updates the site within a minute or two.

---

## What it does

**My library**
- Add books by ISBN: type it, or tap **📷 Scan** and photograph the barcode. The title, author and cover fill in from Open Library.
- Search by title or author. Tap a book to edit or delete it, or to lend it out.

**Loaned out**
- Log who has your book and when it's due. Each loan shows how long ago you lent it ("loaned to Sam 3 weeks ago"). Overdue loans are shown in red with ⚠ from the day after the due date.
- Tap a loan to change the borrower or due date, or to delete it. **Mark returned** when you get it back.

**Borrowed**
- Log books other people have lent you, with the same ISBN lookup and barcode scan. Each shows how long ago you borrowed it.
- Tap one to edit or delete it.

**Linked loans between accounts**
- When you lend a book and enter the borrower's email, and they also have an account, it appears in their Borrowed list automatically.
- From then on:
  - **Mark returned** on either side updates both lists.
  - Changing the due date updates theirs.
  - Deleting your loan removes their copy. If they delete their copy, yours stays.

---

## How it fits together

| Part | Where | Notes |
|------|-------|-------|
| Pages | `public/` | Plain HTML, CSS and JavaScript, with no build step. Edit these files directly. |
| API | `functions/` | Cloudflare Pages Functions. Each file's path becomes its URL (see the API section). |
| Database | Cloudflare D1 (`booktracker-db`) | SQLite. Bound to the app as `DB`. |
| Sign-in | `functions/_lib/crypto.js` | Salted PBKDF2 password hashes. A signed session cookie lasts 7 days. |
| Book details and covers | [Open Library](https://openlibrary.org) | Called from the browser when you look up an ISBN. |
| Barcode reader | [zxing-wasm](https://github.com/Sec-ant/zxing-wasm) 3.1.6 via jsDelivr | About 1 MB, downloaded the first time someone taps Scan, then cached. Pinned to an exact version with an integrity hash. |

Settings the live site depends on, in the Cloudflare dashboard (not in this repo):
- **Build:** no build command, build output `public`, root directory blank.
- **D1 binding:** `DB` → `booktracker-db`.
- **Secret:** `JWT_SECRET`, a long random string that signs session cookies. If it changes, everyone is signed out.

`wrangler.toml` is only used by Wrangler commands run on your own computer. The live site ignores it.

### Files

```
public/
  index.html        Landing page
  login.html        Sign in
  signup.html       Create account
  app.html          The app itself: library, loans, and all the pop-up forms
  js/app.js         All the app's behaviour
  css/style.css     All styles. Phone layout rules are at the bottom (max-width: 600px)

functions/
  _middleware.js    Checks the session cookie on every /api/* request
  _lib/
    crypto.js       Password hashing and session tokens
    helpers.js      Response helpers, cookies, and the length limits for every field
    ratelimit.js    Limits on sign-in and sign-up attempts
    schema.js       Adds newer columns and tables to the database automatically
  auth/             signup.js, login.js, logout.js
  api/
    users/me.js
    books/index.js, books/[id].js
    loans/out.js, loans/out/[id].js, loans/out/[id]/return.js
    loans/in.js,  loans/in/[id].js,  loans/in/[id]/return.js

schema.sql          Full database layout, for creating a database from scratch
```

---

## Database

| Table | Holds |
|-------|-------|
| `users` | Accounts: name, email (stored lowercase), password hash and salt |
| `books` | Your library: title, author, ISBN, cover link, notes |
| `loans_out` | Books you've lent: borrower, due date, returned date |
| `loans_in` | Books you've borrowed. `loan_out_id` links a record to the lender's loan when it was created automatically |
| `auth_attempts` | Recent failed sign-ins and sign-up attempts, for rate limiting. Entries older than a day are deleted |

Times such as `returned_at` are stored in UTC. Due dates are plain calendar days (`YYYY-MM-DD`). The app converts both to local time for display.

**Changing the database:** there's no need to run migrations by hand. `functions/_lib/schema.js` checks on first use and adds anything missing:
- **New column:** add it to the column list in `schema.js` (for example `LOANS_IN_COLUMNS`), and also to `schema.sql` so a fresh database gets it.
- **New table:** use `CREATE TABLE IF NOT EXISTS`, the same way `ensureAuthAttemptsTable` does.

---

## Security

What's in place:
- **Passwords:** hashed with PBKDF2 at 100,000 rounds, the most Cloudflare Workers allows. They're never stored as typed.
- **Session cookie:** set so page scripts can't read it, it's only sent over HTTPS, and other websites can't use it.
- **Ownership:** every API endpoint checks that the record belongs to the signed-in user.
- **Text display:** everything users type is escaped before it's shown.
- **Sign-in limits:**
  - 5 wrong passwords lock that account for 15 minutes.
  - 20 failures from one network, across all accounts, lock that network for 15 minutes.
  - A successful sign-in resets the account's count.
- **Sign-up limit:** 10 attempts per hour per network.
- **Hidden accounts:** a wrong email takes as long to reject as a wrong password, so sign-in doesn't reveal which emails have accounts.
- **Length limits on every field:** titles and authors 300 characters, notes 5,000, names 100, emails 254, ISBNs 20. Due dates and cover links must be in the right format.

Known gaps:
- **Open signup (on purpose):** the site is public, so anyone can create an account. That makes password reset the most important missing piece (see Features to add).
- **Linked loans:** any account can add a book to someone's Borrowed list by entering their email as the borrower.
- **No password change or reset.** A reset needs the app to send email.
- **Sign-out isn't remote:** it clears the cookie on that device, but a stolen session stays valid for up to 7 days.
- **No security headers**, such as a `public/_headers` file.

---

## Features to add

- **Password reset (forgot password).** This is needed now the site is public: anyone who forgets their password has no way back in. It needs the app to send email. Add **change password** while signed in at the same time.
- **Overdue reminders.** An email or phone notification when a loan runs past its due date. The "passive-aggressive reminder mode" idea from the landing page would live here.
- **Filter, genre tags and ratings** for the library. The landing page's "Your Shelf" tile already advertises these, so build them or reword that tile.
- **Install to the home screen (PWA).** Its own icon, full-screen, and faster to open.
- **"Do I already own this?"** Scan a book in a shop and get a warning if it's already in the library.
- **Export the library and loans to CSV.**

---

## API

Everything under `/api/` needs a signed-in session. Requests and responses are JSON.

**Auth**

| Method | Path | Body | |
|--------|------|------|---|
| POST | `/auth/signup` | `{name, email, password}` | Create account and sign in |
| POST | `/auth/login` | `{email, password}` | Sign in |
| POST | `/auth/logout` | | Sign out |
| GET | `/api/users/me` | | Current user |

**Books**

| Method | Path | |
|--------|------|---|
| GET | `/api/books` | All your books, with current loan info |
| POST | `/api/books` | Add a book `{title, author, isbn?, cover_url?, notes?}` |
| GET / PUT / DELETE | `/api/books/:id` | Get, edit or delete a book. Delete is refused while it's on loan |

**Loaned out**

| Method | Path | |
|--------|------|---|
| GET | `/api/loans/out` | Your loans |
| POST | `/api/loans/out` | Lend a book `{book_id, borrower_name, borrower_email?, due_at?}` |
| PUT | `/api/loans/out/:id` | Edit borrower or due date. The due date also updates the borrower's linked copy |
| DELETE | `/api/loans/out/:id` | Delete, along with the borrower's linked copy |
| POST | `/api/loans/out/:id/return` | Mark returned, on both sides of a linked loan |

**Borrowed**

| Method | Path | |
|--------|------|---|
| GET | `/api/loans/in` | Books you've borrowed |
| POST | `/api/loans/in` | Log a borrowed book `{title, author, lender_name, isbn?, cover_url?, lender_email?, due_at?}` |
| PUT | `/api/loans/in/:id` | Edit |
| DELETE | `/api/loans/in/:id` | Delete (your copy only) |
| POST | `/api/loans/in/:id/return` | Mark returned, on both sides of a linked loan |

---

## Trying changes on your computer first

Optional. You'll need Node.js. These commands run the whole app locally, with a separate local database that's empty to start with.

```bash
echo "JWT_SECRET=any-local-test-value" > .dev.vars          # once
npx wrangler d1 execute booktracker-db --local --file=schema.sql   # once
npx wrangler pages dev public --d1 DB=8d16d11e-5b0c-46f3-ac5e-c00f7c2335e1
```

Then open http://localhost:8788 and create an account. `.dev.vars` and the `.wrangler/` folder are local only; don't commit them.
