// src/js/app.js
// BookTracker — main application logic

// ── State ──────────────────────────────────────────────────
let state = {
  user: null,
  books: [],
  loansOut: [],
  loansIn: [],
  editingBookId: null,
};

// ── API helpers ────────────────────────────────────────────
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'same-origin',
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) {
    window.location.href = '/login';
    return null;
  }
  return res.json().then(data => ({ ok: res.ok, status: res.status, data }));
}

// ── Tab routing ────────────────────────────────────────────
function showTab(tab) {
  ['books', 'loans-out', 'loans-in'].forEach(t => {
    document.getElementById(`tab-${t}`).style.display = t === tab ? '' : 'none';
  });
  document.querySelectorAll('.nav-link').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
}

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    showTab(link.dataset.tab);
  });
});

// ── Auth ───────────────────────────────────────────────────
document.getElementById('logout-btn').addEventListener('click', async () => {
  await api('/auth/logout', { method: 'POST' });
  window.location.href = '/login';
});

// ── Helpers ────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isOverdue(due) {
  if (!due) return false;
  return new Date(due) < new Date();
}

function coverImg(url, title, cls = '') {
  if (url) return `<img src="${url}" alt="${escHtml(title)}" class="${cls || 'book-cover'}" loading="lazy">`;
  return `<div class="${cls || 'book-cover-placeholder'}">${escHtml(title)}</div>`;
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showAlert(id, msg, type = 'error') {
  const el = document.getElementById(id);
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.style.display = 'flex';
}

function hideAlert(id) {
  document.getElementById(id).style.display = 'none';
}

// ── Modal helpers ──────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
  }
});

// Close modal when clicking backdrop
document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) backdrop.classList.remove('open');
  });
});

// ── Stats ──────────────────────────────────────────────────
function updateStats() {
  document.getElementById('stat-total').textContent = state.books.length;
  document.getElementById('stat-loaned').textContent =
    state.loansOut.filter(l => !l.returned_at).length;
  document.getElementById('stat-borrowed').textContent =
    state.loansIn.filter(l => !l.returned_at).length;
}

document.querySelectorAll('.stats-bar .stat').forEach(el => {
  el.addEventListener('click', () => showTab(el.dataset.tab));
});

// ── Books ──────────────────────────────────────────────────
async function loadBooks() {
  const res = await api('/api/books');
  if (!res) return;
  state.books = res.data.books || [];
  renderBooks();
  updateStats();
}

function renderBooks(filter = '') {
  const grid = document.getElementById('book-grid');
  let books = state.books;
  if (filter) {
    const q = filter.toLowerCase();
    books = books.filter(b =>
      b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)
    );
  }
  if (!books.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <div class="empty-icon">📖</div>
      <h3>${filter ? 'No books match your search' : 'Your library is empty'}</h3>
      <p>${filter ? 'Try a different search.' : 'Add your first book to get started.'}</p>
    </div>`;
    return;
  }
  grid.innerHTML = books.map(book => `
    <div class="book-card" data-id="${book.id}">
      ${book.cover_url
        ? `<img src="${escHtml(book.cover_url)}" alt="${escHtml(book.title)}" class="book-cover" loading="lazy">`
        : `<div class="book-cover-placeholder">${escHtml(book.title)}</div>`}
      <div class="book-info">
        <div class="book-title">${escHtml(book.title)}</div>
        <div class="book-author">${escHtml(book.author)}</div>
        ${book.on_loan ? `<div style="margin-top:6px"><span class="badge badge-on-loan">Loaned to ${escHtml(book.borrower_name)}</span></div>` : ''}
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.book-card').forEach(card => {
    card.addEventListener('click', () => openEditBook(card.dataset.id));
  });
}

document.getElementById('book-search').addEventListener('input', e => {
  renderBooks(e.target.value);
});

// ── Add / Edit Book modal ──────────────────────────────────
document.getElementById('add-book-btn').addEventListener('click', () => {
  state.editingBookId = null;
  document.getElementById('book-modal-title').textContent = 'Add book';
  document.getElementById('book-isbn').value = '';
  document.getElementById('book-title').value = '';
  document.getElementById('book-author').value = '';
  document.getElementById('book-notes').value = '';
  document.getElementById('book-cover-url').value = '';
  document.getElementById('book-modal-loan').style.display = '';
  document.getElementById('book-modal-delete').style.display = 'none';
  hideAlert('book-modal-alert');
  openModal('book-modal');
});

function openEditBook(id) {
  const book = state.books.find(b => b.id === id);
  if (!book) return;
  state.editingBookId = id;
  document.getElementById('book-modal-title').textContent = 'Edit book';
  document.getElementById('book-isbn').value = book.isbn || '';
  document.getElementById('book-title').value = book.title;
  document.getElementById('book-author').value = book.author;
  document.getElementById('book-notes').value = book.notes || '';
  document.getElementById('book-cover-url').value = book.cover_url || '';
  document.getElementById('book-modal-loan').style.display = book.on_loan ? 'none' : '';
  document.getElementById('book-modal-delete').style.display = '';
  hideAlert('book-modal-alert');
  openModal('book-modal');
}

['book-modal-close', 'book-modal-cancel'].forEach(id => {
  document.getElementById(id).addEventListener('click', () => closeModal('book-modal'));
});

document.getElementById('book-modal-delete').addEventListener('click', () => {
  if (state.editingBookId) deleteBook(state.editingBookId);
});

async function saveBookData() {
  hideAlert('book-modal-alert');
  const title = document.getElementById('book-title').value.trim();
  const author = document.getElementById('book-author').value.trim();
  const isbn = document.getElementById('book-isbn').value.trim();
  const notes = document.getElementById('book-notes').value.trim();
  const cover_url = document.getElementById('book-cover-url').value.trim();

  if (!title || !author) {
    showAlert('book-modal-alert', 'Title and author are required');
    return null;
  }

  const btn = document.getElementById('book-modal-save');
  btn.disabled = true;

  const body = { title, author, isbn: isbn || null, notes: notes || null, cover_url: cover_url || null };
  const isEdit = !!state.editingBookId;
  const res = await api(
    isEdit ? `/api/books/${state.editingBookId}` : '/api/books',
    { method: isEdit ? 'PUT' : 'POST', body }
  );
  btn.disabled = false;

  if (!res || !res.ok) {
    showAlert('book-modal-alert', res?.data?.error || 'Failed to save book');
    return null;
  }

  return res.data.book;
}

document.getElementById('book-modal-loan').addEventListener('click', async () => {
  let bookId = state.editingBookId;

  if (!bookId) {
    const book = await saveBookData();
    if (!book) return;
    bookId = book.id;
    await loadBooks();
  }

  const available = state.books.filter(b => !b.on_loan);
  const select = document.getElementById('loan-out-book');
  select.innerHTML = available.map(b =>
    `<option value="${b.id}" ${b.id === bookId ? 'selected' : ''}>${escHtml(b.title)} — ${escHtml(b.author)}</option>`
  ).join('');
  document.getElementById('loan-out-borrower').value = '';
  document.getElementById('loan-out-email').value = '';
  document.getElementById('loan-out-due').value = '';
  hideAlert('loan-out-alert');
  closeModal('book-modal');
  openModal('loan-out-modal');
});

// ISBN lookup via Open Library
document.getElementById('isbn-lookup-btn').addEventListener('click', async () => {
  const isbn = document.getElementById('book-isbn').value.trim().replace(/[-\s]/g, '');
  if (!isbn) return;
  const btn = document.getElementById('isbn-lookup-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
    const data = await res.json();
    const key = `ISBN:${isbn}`;
    if (data[key]) {
      const book = data[key];
      document.getElementById('book-title').value = book.title || '';
      document.getElementById('book-author').value =
        (book.authors || []).map(a => a.name).join(', ') || '';
      if (book.cover?.medium) {
        document.getElementById('book-cover-url').value = book.cover.medium;
      }
    } else {
      showAlert('book-modal-alert', 'No book found for that ISBN', 'error');
    }
  } catch {
    showAlert('book-modal-alert', 'ISBN lookup failed — fill in manually', 'error');
  }
  btn.disabled = false;
  btn.textContent = 'Look up';
});

document.getElementById('book-isbn').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('isbn-lookup-btn').click();
  }
});

document.getElementById('book-modal-save').addEventListener('click', async () => {
  const book = await saveBookData();
  if (!book) return;
  closeModal('book-modal');
  await loadBooks();
});

// Delete book — exposed via edit modal (we add a delete btn dynamically)
async function deleteBook(id) {
  if (!confirm('Remove this book from your library?')) return;
  const res = await api(`/api/books/${id}`, { method: 'DELETE' });
  if (!res || !res.ok) {
    alert(res?.data?.error || 'Could not delete book');
    return;
  }
  closeModal('book-modal');
  await loadBooks();
}

// ── Loans out ──────────────────────────────────────────────
async function loadLoansOut() {
  const res = await api('/api/loans/out');
  if (!res) return;
  state.loansOut = res.data.loans || [];
  renderLoansOut();
  updateStats();
}

function renderLoansOut() {
  const container = document.getElementById('loans-out-list');
  const active = state.loansOut.filter(l => !l.returned_at);
  const returned = state.loansOut.filter(l => l.returned_at);

  if (!state.loansOut.length) {
    container.innerHTML = `<div class="empty">
      <div class="empty-icon">🤝</div>
      <h3>No loans recorded</h3>
      <p>When you lend a book, it will appear here.</p>
    </div>`;
    return;
  }

  function loanRow(loan) {
    const due = loan.due_at ? fmtDate(loan.due_at) : null;
    const overdue = !loan.returned_at && isOverdue(loan.due_at);
    return `
      <div class="loan-row" data-id="${loan.id}">
        ${loan.cover_url
          ? `<img src="${escHtml(loan.cover_url)}" class="loan-cover-thumb" alt="">`
          : `<div class="loan-cover-thumb-placeholder"></div>`}
        <div class="loan-details">
          <div class="loan-title">${escHtml(loan.title)}</div>
          <div class="loan-meta">
            by ${escHtml(loan.author)} · loaned to <strong>${escHtml(loan.borrower_name)}</strong>
            ${loan.returned_at
              ? ` · returned ${fmtDate(loan.returned_at)}`
              : due ? ` · due <span style="color:${overdue ? 'var(--danger)' : 'inherit'}">${due}${overdue ? ' ⚠' : ''}</span>` : ''}
          </div>
        </div>
        <div class="loan-actions">
          ${!loan.returned_at
            ? `<button class="btn btn-secondary btn-sm mark-returned" data-id="${loan.id}">Mark returned</button>`
            : `<span class="badge badge-returned">Returned</span>`}
        </div>
      </div>`;
  }

  let html = '';
  if (active.length) {
    html += active.map(loanRow).join('');
  }
  if (returned.length) {
    html += `<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
      <div style="font-size:12px;color:var(--text3);font-weight:500;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.05em">Returned</div>
      ${returned.map(loanRow).join('')}
    </div>`;
  }
  container.innerHTML = html;

  container.querySelectorAll('.mark-returned').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const res = await api(`/api/loans/out/${btn.dataset.id}/return`, { method: 'POST' });
      if (res?.ok) {
        await Promise.all([loadLoansOut(), loadBooks()]);
      }
    });
  });
}

document.getElementById('add-loan-out-btn').addEventListener('click', () => {
  const available = state.books.filter(b => !b.on_loan);
  const select = document.getElementById('loan-out-book');
  if (!available.length) {
    alert('All your books are either already on loan or your library is empty.');
    return;
  }
  select.innerHTML = available.map(b =>
    `<option value="${b.id}">${escHtml(b.title)} — ${escHtml(b.author)}</option>`
  ).join('');
  document.getElementById('loan-out-borrower').value = '';
  document.getElementById('loan-out-email').value = '';
  document.getElementById('loan-out-due').value = '';
  hideAlert('loan-out-alert');
  openModal('loan-out-modal');
});

['loan-out-modal-close', 'loan-out-cancel'].forEach(id => {
  document.getElementById(id).addEventListener('click', () => closeModal('loan-out-modal'));
});

document.getElementById('loan-out-save').addEventListener('click', async () => {
  hideAlert('loan-out-alert');
  const book_id = document.getElementById('loan-out-book').value;
  const borrower_name = document.getElementById('loan-out-borrower').value.trim();
  const borrower_email = document.getElementById('loan-out-email').value.trim();
  const due_at = document.getElementById('loan-out-due').value;

  if (!book_id || !borrower_name) {
    return showAlert('loan-out-alert', 'Book and borrower name are required');
  }

  const btn = document.getElementById('loan-out-save');
  btn.disabled = true;
  const res = await api('/api/loans/out', {
    method: 'POST',
    body: { book_id, borrower_name, borrower_email: borrower_email || null, due_at: due_at || null }
  });
  btn.disabled = false;

  if (!res || !res.ok) {
    return showAlert('loan-out-alert', res?.data?.error || 'Failed to log loan');
  }
  closeModal('loan-out-modal');
  await Promise.all([loadBooks(), loadLoansOut()]);
});

// ── Loans in ───────────────────────────────────────────────
async function loadLoansIn() {
  const res = await api('/api/loans/in');
  if (!res) return;
  state.loansIn = res.data.loans || [];
  renderLoansIn();
  updateStats();
}

function renderLoansIn() {
  const container = document.getElementById('loans-in-list');
  const active = state.loansIn.filter(l => !l.returned_at);
  const returned = state.loansIn.filter(l => l.returned_at);

  if (!state.loansIn.length) {
    container.innerHTML = `<div class="empty">
      <div class="empty-icon">📬</div>
      <h3>No borrowed books recorded</h3>
      <p>When someone lends you a book, log it here.</p>
    </div>`;
    return;
  }

  function loanRow(loan) {
    const due = loan.due_at ? fmtDate(loan.due_at) : null;
    const overdue = !loan.returned_at && isOverdue(loan.due_at);
    return `
      <div class="loan-row" data-id="${loan.id}">
        <div class="loan-cover-thumb-placeholder"></div>
        <div class="loan-details">
          <div class="loan-title">${escHtml(loan.title)}</div>
          <div class="loan-meta">
            by ${escHtml(loan.author)} · from <strong>${escHtml(loan.lender_name)}</strong>
            ${loan.returned_at
              ? ` · returned ${fmtDate(loan.returned_at)}`
              : due ? ` · due <span style="color:${overdue ? 'var(--danger)' : 'inherit'}">${due}${overdue ? ' ⚠' : ''}</span>` : ''}
          </div>
        </div>
        <div class="loan-actions">
          ${!loan.returned_at
            ? `<button class="btn btn-secondary btn-sm mark-returned-in" data-id="${loan.id}">Mark returned</button>`
            : `<span class="badge badge-returned">Returned</span>`}
        </div>
      </div>`;
  }

  let html = '';
  if (active.length) html += active.map(loanRow).join('');
  if (returned.length) {
    html += `<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
      <div style="font-size:12px;color:var(--text3);font-weight:500;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.05em">Returned</div>
      ${returned.map(loanRow).join('')}
    </div>`;
  }
  container.innerHTML = html;

  container.querySelectorAll('.mark-returned-in').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const res = await api(`/api/loans/in/${btn.dataset.id}/return`, { method: 'POST' });
      if (res?.ok) await loadLoansIn();
    });
  });
}

document.getElementById('add-loan-in-btn').addEventListener('click', () => {
  document.getElementById('loan-in-title').value = '';
  document.getElementById('loan-in-author').value = '';
  document.getElementById('loan-in-lender').value = '';
  document.getElementById('loan-in-email').value = '';
  document.getElementById('loan-in-due').value = '';
  hideAlert('loan-in-alert');
  openModal('loan-in-modal');
});

['loan-in-modal-close', 'loan-in-cancel'].forEach(id => {
  document.getElementById(id).addEventListener('click', () => closeModal('loan-in-modal'));
});

document.getElementById('loan-in-save').addEventListener('click', async () => {
  hideAlert('loan-in-alert');
  const title = document.getElementById('loan-in-title').value.trim();
  const author = document.getElementById('loan-in-author').value.trim();
  const lender_name = document.getElementById('loan-in-lender').value.trim();
  const lender_email = document.getElementById('loan-in-email').value.trim();
  const due_at = document.getElementById('loan-in-due').value;

  if (!title || !author || !lender_name) {
    return showAlert('loan-in-alert', 'Title, author and lender name are required');
  }

  const btn = document.getElementById('loan-in-save');
  btn.disabled = true;
  const res = await api('/api/loans/in', {
    method: 'POST',
    body: { title, author, lender_name, lender_email: lender_email || null, due_at: due_at || null }
  });
  btn.disabled = false;

  if (!res || !res.ok) {
    return showAlert('loan-in-alert', res?.data?.error || 'Failed to log loan');
  }
  closeModal('loan-in-modal');
  await loadLoansIn();
});

// ── Init ───────────────────────────────────────────────────
async function init() {
  const res = await api('/api/users/me');
  if (!res) return;
  state.user = res.data.user;
  document.getElementById('nav-user').textContent = state.user.name;

  await Promise.all([loadBooks(), loadLoansOut(), loadLoansIn()]);
}

init();
