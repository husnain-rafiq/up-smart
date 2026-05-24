// UpSmart Sidebar — Job Tracker

let allApps = [];
let currentFilter = 'all';
let searchQuery = '';

const $ = id => document.getElementById(id);

// ── Load ──────────────────────────────────────────────────────────────────
function loadApplications() {
  chrome.runtime.sendMessage({ type: 'GET_APPLICATIONS' }, (response) => {
    allApps = response?.applications || [];
    updateCounts();
    renderList();
  });
}

// ── Counts ────────────────────────────────────────────────────────────────
function updateCounts() {
  const counts = { all: allApps.length, saved: 0, applied: 0, interviewing: 0, won: 0, lost: 0 };
  allApps.forEach(a => { if (counts[a.status] !== undefined) counts[a.status]++; });

  $('count-all').textContent = counts.all;
  $('count-saved').textContent = counts.saved;
  $('count-applied').textContent = counts.applied;
  $('count-interviewing').textContent = counts.interviewing;
  $('count-won').textContent = counts.won;
}

// ── Filter ────────────────────────────────────────────────────────────────
function getFiltered() {
  return allApps.filter(app => {
    const matchFilter = currentFilter === 'all' || app.status === currentFilter;
    const matchSearch = !searchQuery ||
      app.title?.toLowerCase().includes(searchQuery) ||
      app.budget?.toLowerCase().includes(searchQuery);
    return matchFilter && matchSearch;
  });
}

// ── Render ────────────────────────────────────────────────────────────────
function renderList() {
  const list = $('job-list');
  const empty = $('empty-state');
  const apps = getFiltered();

  // Remove old cards
  list.querySelectorAll('.job-card').forEach(c => c.remove());

  if (apps.length === 0) {
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  // Sort by savedAt desc
  apps.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));

  apps.forEach(app => {
    const card = createCard(app);
    list.appendChild(card);
  });
}

function createCard(app) {
  const card = document.createElement('div');
  card.className = 'job-card';
  card.dataset.id = app.id;

  const date = app.savedAt ? new Date(app.savedAt).toLocaleDateString() : '';
  const titleHTML = app.url
    ? `<a href="${app.url}" target="_blank">${escape(app.title || 'Untitled Job')}</a>`
    : escape(app.title || 'Untitled Job');

  card.innerHTML = `
    <div class="job-card-header">
      <div class="job-title">${titleHTML}</div>
      <button class="job-delete" title="Remove" data-id="${app.id}">✕</button>
    </div>
    <div class="job-meta">
      ${app.budget ? `<span class="job-budget">${escape(app.budget)}</span>` : ''}
      <span class="job-date">${date}</span>
    </div>
    <select class="status-select ${app.status}" data-id="${app.id}">
      <option value="saved"    ${app.status === 'saved'        ? 'selected' : ''}>📌 Saved</option>
      <option value="applied"  ${app.status === 'applied'      ? 'selected' : ''}>📤 Applied</option>
      <option value="interviewing" ${app.status === 'interviewing' ? 'selected' : ''}>💬 Interviewing</option>
      <option value="won"      ${app.status === 'won'          ? 'selected' : ''}>🏆 Won</option>
      <option value="lost"     ${app.status === 'lost'         ? 'selected' : ''}>❌ Lost</option>
    </select>
  `;

  card.querySelector('.job-delete').addEventListener('click', () => deleteApp(app.id));
  card.querySelector('.status-select').addEventListener('change', (e) => {
    updateStatus(app.id, e.target.value);
    e.target.className = `status-select ${e.target.value}`;
  });

  return card;
}

function escape(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Actions ───────────────────────────────────────────────────────────────
function updateStatus(id, status) {
  chrome.runtime.sendMessage({ type: 'UPDATE_APPLICATION_STATUS', id, status }, () => {
    const app = allApps.find(a => a.id === id);
    if (app) app.status = status;
    updateCounts();
  });
}

function deleteApp(id) {
  chrome.runtime.sendMessage({ type: 'DELETE_APPLICATION', id }, () => {
    allApps = allApps.filter(a => a.id !== id);
    updateCounts();
    renderList();
  });
}

// ── Event Listeners ───────────────────────────────────────────────────────
document.querySelectorAll('.status-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.status-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderList();
  });
});

$('search-input').addEventListener('input', (e) => {
  searchQuery = e.target.value.toLowerCase().trim();
  renderList();
});

$('close-btn').addEventListener('click', () => {
  // Tell parent frame to close
  window.parent.document.getElementById('upsmart-sidebar-frame')?.remove();
});

$('clear-won').addEventListener('click', () => {
  if (!confirm('Remove all Won jobs from tracker?')) return;
  const ids = allApps.filter(a => a.status === 'won').map(a => a.id);
  ids.forEach(id => chrome.runtime.sendMessage({ type: 'DELETE_APPLICATION', id }));
  allApps = allApps.filter(a => a.status !== 'won');
  updateCounts();
  renderList();
});

$('clear-all').addEventListener('click', () => {
  if (!confirm('Clear ALL tracked jobs? This cannot be undone.')) return;
  chrome.storage.local.set({ applications: [] }, () => {
    allApps = [];
    updateCounts();
    renderList();
  });
});

// ── Init ──────────────────────────────────────────────────────────────────
loadApplications();

// Auto-refresh every 30s
setInterval(loadApplications, 30000);
