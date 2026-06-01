# BookTracker

A personal book library and loan tracker. Built for Cloudflare Pages + D1 — no separate backend required.

## Stack

| Layer | Service |
|-------|---------|
| Frontend | Cloudflare Pages (static) |
| API | Cloudflare Pages Functions |
| Database | Cloudflare D1 (SQLite) |
| Auth | In-house — PBKDF2 + JWT in httpOnly cookies |

---

## First-time setup

### 1. Install Wrangler

```bash
npm install -g wrangler
wrangler login
```

### 2. Create the D1 database

```bash
npx wrangler d1 create booktracker-db
```

Copy the `database_id` from the output and paste it into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "booktracker-db"
database_id = "PASTE_YOUR_ID_HERE"
```

### 3. Run the schema

```bash
npx wrangler d1 execute booktracker-db --file=schema.sql
```

### 4. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/booktracker.git
git push -u origin main
```

### 5. Connect to Cloudflare Pages

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create**
2. Connect your GitHub repo
3. Set build settings:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `public`
4. Click **Save and Deploy**

### 6. Add the D1 binding in Pages

1. In your Pages project → **Settings** → **Functions**
2. Under **D1 database bindings** → Add binding:
   - Variable name: `DB`
   - D1 database: `booktracker-db`

### 7. Add the JWT secret

1. In your Pages project → **Settings** → **Environment variables**
2. Add a variable (mark as **Secret**):
   - Name: `JWT_SECRET`
   - Value: a long random string — generate one with:
     ```bash
     openssl rand -base64 48
     ```
3. Add it to both **Production** and **Preview** environments

### 8. Redeploy

Trigger a new deployment from the Cloudflare Pages dashboard so the binding and secret take effect.

---

## Project structure

```
booktracker/
├── functions/              # Pages Functions — auto-routed as API
│   ├── _middleware.js      # JWT auth check for all /api/* routes
│   ├── _lib/
│   │   ├── crypto.js       # PBKDF2 + JWT (Web Crypto API, zero deps)
│   │   └── helpers.js      # Response helpers, cookie utilities
│   ├── auth/
│   │   ├── signup.js       # POST /auth/signup
│   │   ├── login.js        # POST /auth/login
│   │   └── logout.js       # POST /auth/logout
│   └── api/
│       ├── books/
│       │   ├── index.js    # GET /api/books, POST /api/books
│       │   └── [id].js     # GET / PUT / DELETE /api/books/:id
│       ├── loans/
│       │   ├── out.js      # GET / POST /api/loans/out
│       │   ├── in.js       # GET / POST /api/loans/in
│       │   ├── out/[id]/return.js   # POST /api/loans/out/:id/return
│       │   └── in/[id]/return.js    # POST /api/loans/in/:id/return
│       └── users/
│           └── me.js       # GET /api/users/me
├── public/                 # Static files served by Pages
│   ├── login.html
│   ├── signup.html
│   ├── app.html
│   ├── css/style.css
│   ├── js/app.js
│   └── _redirects
├── src/                    # Source files (edit these, then copy to public/)
│   ├── pages/
│   ├── css/
│   └── js/
├── schema.sql              # D1 database schema
└── wrangler.toml           # D1 binding config
```

---

## API reference

### Auth
| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/auth/signup` | `{name, email, password}` | Create account, set session cookie |
| POST | `/auth/login` | `{email, password}` | Login, set session cookie |
| POST | `/auth/logout` | — | Clear session cookie |

### Books *(auth required)*
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/books` | All books (includes active loan info) |
| POST | `/api/books` | Add a book |
| GET | `/api/books/:id` | Single book |
| PUT | `/api/books/:id` | Update book |
| DELETE | `/api/books/:id` | Delete book (fails if on loan) |

### Loans *(auth required)*
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/loans/out` | Books loaned to others |
| POST | `/api/loans/out` | Log a new loan out |
| POST | `/api/loans/out/:id/return` | Mark as returned |
| GET | `/api/loans/in` | Books borrowed from others |
| POST | `/api/loans/in` | Log a borrowed book |
| POST | `/api/loans/in/:id/return` | Mark as returned |

---

## Local development

```bash
npx wrangler pages dev public --d1=DB=booktracker-db
```

This runs the full Pages + Functions stack locally with your D1 database.
