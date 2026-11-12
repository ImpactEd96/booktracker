// src/js/app.js
// BookTracker — main application logic

// ── State ──────────────────────────────────────────────────
let state = {
  user: null,
  books: [],
  loansOut: [],
  loansIn: [],
  editingBookId: null,
  editingLoanOutId: null,
  editingLoanInId: null,
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
    window.location.href = '/login.html';
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
  window.location.href = '/login.html';
});

// ── Helpers ────────────────────────────────────────────────
// Dates come in two forms: due dates are calendar days ("2026-11-12"), and
// timestamps from the database are in UTC ("2026-11-12 03:15:00")
function parseDate(value) {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (day) return new Date(+day[1], day[2] - 1, +day[3]); // that day, in local time
  const iso = value.replace(' ', 'T');
  return new Date(/Z|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z');
}

function fmtDate(value) {
  if (!value) return null;
  return parseDate(value).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Overdue once the due date has passed — a book due today isn't overdue yet
function isOverdue(due) {
  if (!due) return false;
  return due.slice(0, 10) < localToday();
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

  closeModal('book-modal');
  openLoanOutModal({ bookId });
});

// ── Barcode scanning from a photo ──────────────────────────
// The barcode reader (zxing-wasm, ~1 MB) is loaded from jsDelivr the first
// time someone taps Scan, so it doesn't slow down normal page loads.
const BARCODE_READER_SRC = 'https://cdn.jsdelivr.net/npm/zxing-wasm@3.1.6/dist/iife/reader/index.js';
const BARCODE_READER_SRI = 'sha384-WftrM7hFN3CZH1pg8fvonijN1mDx8lh1U3L267n+snjsk/o7oBdEbUx5R8P3uw9S';
let barcodeReaderPromise = null;

function loadBarcodeReader() {
  if (!barcodeReaderPromise) {
    barcodeReaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = BARCODE_READER_SRC;
      script.integrity = BARCODE_READER_SRI;
      script.crossOrigin = 'anonymous';
      script.onload = () => resolve(window.ZXingWASM);
      script.onerror = () => {
        barcodeReaderPromise = null; // allow a retry
        script.remove();
        reject(new Error('Could not load the barcode reader'));
      };
      document.head.appendChild(script);
    });
  }
  return barcodeReaderPromise;
}

// Draw the photo onto a canvas (shrinking big phone photos) and return its pixels
async function photoToImageData(file, maxSide = 2400) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Returns { isbn } if an ISBN barcode was found, or { isbn: null, sawOtherBarcode }
async function readIsbnFromPhoto(file) {
  const [reader, imageData] = await Promise.all([loadBarcodeReader(), photoToImageData(file)]);
  let results;
  try {
    results = await reader.readBarcodes(imageData, {
      formats: ['EAN13'],      // book barcodes are EAN-13; the small price add-on is ignored
      tryHarder: true,
      maxNumberOfSymbols: 4,   // some books also carry a separate price/retail barcode
    });
  } catch (e) {
    reader.purgeZXingModule(); // a failed download is cached otherwise — retry next time
    throw e;
  }
  // An ISBN-13 barcode always starts with 978 or 979
  const isbn = results.map(r => r.text).find(text => /^97[89]\d{10}$/.test(text)) || null;
  return { isbn, sawOtherBarcode: results.length > 0 };
}

// ISBN lookup via Open Library — shared by the "Add book" and "Log a borrowed book" modals
function setupIsbnLookup({ inputId, btnId, scanBtnId, photoInputId, alertId, titleId, authorId, coverId }) {
  const input = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  const scanBtn = document.getElementById(scanBtnId);
  const photoInput = document.getElementById(photoInputId);

  scanBtn.addEventListener('click', () => {
    // Start downloading the reader while the camera is open
    loadBarcodeReader()
      .then(reader => reader.prepareZXingModule({ fireImmediately: true }))
      .catch(() => {}); // any failure is reported when the photo is read
    photoInput.value = '';
    photoInput.click();
  });

  photoInput.addEventListener('change', async () => {
    const file = photoInput.files[0];
    if (!file) return;
    hideAlert(alertId);
    scanBtn.disabled = true;
    scanBtn.innerHTML = '<span class="spinner"></span>';
    try {
      const { isbn, sawOtherBarcode } = await readIsbnFromPhoto(file);
      if (isbn) {
        input.value = isbn;
        btn.click(); // look it up straight away
      } else if (sawOtherBarcode) {
        showAlert(alertId, "That barcode isn't an ISBN — use the one starting 978 or 979");
      } else {
        showAlert(alertId, "Couldn't find a barcode in that photo — try closer, in good light, or type the ISBN");
      }
    } catch {
      showAlert(alertId, "Couldn't scan the barcode — check your connection, or type the ISBN");
    }
    scanBtn.disabled = false;
    scanBtn.textContent = '📷 Scan';
  });

  btn.addEventListener('click', async () => {
    const isbn = input.value.trim().replace(/[-\s]/g, '');
    if (!isbn) return;
    hideAlert(alertId);
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    try {
      const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
      const data = await res.json();
      const book = data[`ISBN:${isbn}`];
      if (book) {
        document.getElementById(titleId).value = book.title || '';
        document.getElementById(authorId).value =
          (book.authors || []).map(a => a.name).join(', ') || '';
        if (coverId && book.cover?.medium) {
          document.getElementById(coverId).value = book.cover.medium;
        }
      } else {
        showAlert(alertId, 'No book found for that ISBN', 'error');
      }
    } catch {
      showAlert(alertId, 'ISBN lookup failed — fill in manually', 'error');
    }
    btn.disabled = false;
    btn.textContent = 'Look up';
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      btn.click();
    }
  });
}

setupIsbnLookup({
  inputId: 'book-isbn',
  btnId: 'isbn-lookup-btn',
  scanBtnId: 'book-isbn-scan-btn',
  photoInputId: 'book-isbn-photo',
  alertId: 'book-modal-alert',
  titleId: 'book-title',
  authorId: 'book-author',
  coverId: 'book-cover-url',
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

  onLoanRowTap(container, id => {
    const loan = state.loansOut.find(l => l.id === id);
    if (loan) openLoanOutModal({ loan });
  });
}

// Tapping a loan (anywhere except its button) opens it for editing
function onLoanRowTap(container, open) {
  container.querySelectorAll('.loan-row').forEach(row => {
    row.addEventListener('click', e => {
      if (!e.target.closest('button')) open(row.dataset.id);
    });
  });
}

// Log a new loan (optionally with a book preselected), or edit an existing one
function openLoanOutModal({ loan = null, bookId = null } = {}) {
  state.editingLoanOutId = loan?.id || null;
  const select = document.getElementById('loan-out-book');
  if (loan) {
    select.innerHTML = `<option value="${escHtml(loan.book_id)}">${escHtml(loan.title)} — ${escHtml(loan.author)}</option>`;
  } else {
    select.innerHTML = state.books.filter(b => !b.on_loan).map(b =>
      `<option value="${b.id}" ${b.id === bookId ? 'selected' : ''}>${escHtml(b.title)} — ${escHtml(b.author)}</option>`
    ).join('');
  }
  select.disabled = !!loan; // the book can't be changed on an existing loan
  document.getElementById('loan-out-modal-title').textContent = loan ? 'Edit loan' : 'Log a loan';
  document.getElementById('loan-out-borrower').value = loan?.borrower_name || '';
  document.getElementById('loan-out-email').value = loan?.borrower_email || '';
  document.getElementById('loan-out-due').value = loan?.due_at || '';
  document.getElementById('loan-out-delete').style.display = loan ? '' : 'none';
  document.getElementById('loan-out-save').textContent = loan ? 'Save' : 'Log loan';
  hideAlert('loan-out-alert');
  openModal('loan-out-modal');
}

document.getElementById('add-loan-out-btn').addEventListener('click', () => {
  if (!state.books.some(b => !b.on_loan)) {
    alert('All your books are either already on loan or your library is empty.');
    return;
  }
  openLoanOutModal();
});

document.getElementById('loan-out-delete').addEventListener('click', async () => {
  if (!confirm('Delete this loan record?')) return;
  const res = await api(`/api/loans/out/${state.editingLoanOutId}`, { method: 'DELETE' });
  if (!res || !res.ok) {
    return showAlert('loan-out-alert', res?.data?.error || 'Could not delete loan');
  }
  closeModal('loan-out-modal');
  await Promise.all([loadBooks(), loadLoansOut()]);
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
  const editId = state.editingLoanOutId;
  const body = { borrower_name, borrower_email: borrower_email || null, due_at: due_at || null };
  const res = editId
    ? await api(`/api/loans/out/${editId}`, { method: 'PUT', body })
    : await api('/api/loans/out', { method: 'POST', body: { book_id, ...body } });
  btn.disabled = false;

  if (!res || !res.ok) {
    return showAlert('loan-out-alert', res?.data?.error || 'Failed to save loan');
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
        ${loan.cover_url
          ? `<img src="${escHtml(loan.cover_url)}" class="loan-cover-thumb" alt="">`
          : `<div class="loan-cover-thumb-placeholder"></div>`}
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

  onLoanRowTap(container, id => {
    const loan = state.loansIn.find(l => l.id === id);
    if (loan) openLoanInModal(loan);
  });
}

// Log a newly borrowed book, or edit an existing one
function openLoanInModal(loan = null) {
  state.editingLoanInId = loan?.id || null;
  document.getElementById('loan-in-modal-title').textContent = loan ? 'Edit borrowed book' : 'Log a borrowed book';
  document.getElementById('loan-in-isbn').value = loan?.isbn || '';
  document.getElementById('loan-in-cover-url').value = loan?.cover_url || '';
  document.getElementById('loan-in-title').value = loan?.title || '';
  document.getElementById('loan-in-author').value = loan?.author || '';
  document.getElementById('loan-in-lender').value = loan?.lender_name || '';
  document.getElementById('loan-in-email').value = loan?.lender_email || '';
  document.getElementById('loan-in-due').value = loan?.due_at || '';
  document.getElementById('loan-in-delete').style.display = loan ? '' : 'none';
  document.getElementById('loan-in-save').textContent = loan ? 'Save' : 'Log book';
  hideAlert('loan-in-alert');
  openModal('loan-in-modal');
}

setupIsbnLookup({
  inputId: 'loan-in-isbn',
  btnId: 'loan-in-isbn-lookup-btn',
  scanBtnId: 'loan-in-isbn-scan-btn',
  photoInputId: 'loan-in-isbn-photo',
  alertId: 'loan-in-alert',
  titleId: 'loan-in-title',
  authorId: 'loan-in-author',
  coverId: 'loan-in-cover-url',
});

document.getElementById('add-loan-in-btn').addEventListener('click', () => openLoanInModal());

document.getElementById('loan-in-delete').addEventListener('click', async () => {
  if (!confirm('Delete this borrowed book record?')) return;
  const res = await api(`/api/loans/in/${state.editingLoanInId}`, { method: 'DELETE' });
  if (!res || !res.ok) {
    return showAlert('loan-in-alert', res?.data?.error || 'Could not delete record');
  }
  closeModal('loan-in-modal');
  await loadLoansIn();
});

['loan-in-modal-close', 'loan-in-cancel'].forEach(id => {
  document.getElementById(id).addEventListener('click', () => closeModal('loan-in-modal'));
});

document.getElementById('loan-in-save').addEventListener('click', async () => {
  hideAlert('loan-in-alert');
  const isbn = document.getElementById('loan-in-isbn').value.trim();
  const cover_url = document.getElementById('loan-in-cover-url').value.trim();
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
  const editId = state.editingLoanInId;
  const res = await api(editId ? `/api/loans/in/${editId}` : '/api/loans/in', {
    method: editId ? 'PUT' : 'POST',
    body: {
      title, author, lender_name,
      isbn: isbn || null, cover_url: cover_url || null,
      lender_email: lender_email || null, due_at: due_at || null,
    }
  });
  btn.disabled = false;

  if (!res || !res.ok) {
    return showAlert('loan-in-alert', res?.data?.error || 'Failed to save');
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
