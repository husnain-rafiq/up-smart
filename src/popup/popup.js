// UpSmart Popup Logic

const $ = id => document.getElementById(id);
let keywords = [];
let blockedKeywords = [];

// ── Load Settings ─────────────────────────────────────────────────────────
function loadAll() {
  chrome.storage.local.get(null, (data) => {
    // Extension master switch
    const enabled = data.extension_enabled !== false;
    $('extension_enabled').checked = enabled;
    updateExtensionStatusLabel(enabled);

    // Setup
    $('openai_api_key').value = data.openai_api_key || '';
    $('freelancer_profile').value = data.freelancer_profile || '';
    $('proposal_custom_instructions').value = data.proposal_custom_instructions || '';
    $('quote_custom_instructions').value = data.quote_custom_instructions || '';
    $('min_score_filter').value = data.min_score_filter || '';

    // Features
    $('auto_analyze').checked = !!data.auto_analyze;
    $('show_verified_badge').checked = data.show_verified_badge !== false;
    $('alerts_enabled').checked = !!data.alerts_enabled;
    $('poll_interval').value = data.poll_interval || '15';

    // Keywords
    keywords = data.keywords || [];
    blockedKeywords = data.blocked_keywords || [];
    renderKeywords();
    renderBlockedKeywords();

    // API status
    updateApiStatus(data.openai_api_key);

    // Stats
    const apps = data.applications || [];
    $('stat-apps').textContent = apps.length;
    $('stat-keywords').textContent = keywords.length + blockedKeywords.length;
  });
}

function updateExtensionStatusLabel(enabled) {
  const label = $('extension-status-label');
  label.textContent = enabled ? 'ON' : 'OFF';
  label.className = 'master-toggle-label ' + (enabled ? 'on' : 'off');
}

function updateApiStatus(key) {
  const el = $('api-status-indicator');
  const txt = $('api-status-text');
  if (key && key.startsWith('sk-')) {
    el.className = 'api-status connected';
    txt.textContent = '● Connected';
  } else {
    el.className = 'api-status disconnected';
    txt.textContent = '○ No API Key';
  }
}

// ── Extension Enable/Disable ────────────────────────────────────────────
$('extension_enabled').addEventListener('change', () => {
  const enabled = $('extension_enabled').checked;
  chrome.storage.local.set({ extension_enabled: enabled }, () => {
    updateExtensionStatusLabel(enabled);
    chrome.runtime.sendMessage({ type: 'EXTENSION_TOGGLED', enabled });
  });
});

// ── Save Setup ────────────────────────────────────────────────────────────
$('save-setup').addEventListener('click', () => {
  const key = $('openai_api_key').value.trim();
  const profile = $('freelancer_profile').value.trim();
  const proposalInstructions = $('proposal_custom_instructions').value.trim();
  const quoteInstructions = $('quote_custom_instructions').value.trim();
  const minScore = parseInt($('min_score_filter').value) || 0;

  chrome.storage.local.set({
    openai_api_key: key,
    freelancer_profile: profile,
    proposal_custom_instructions: proposalInstructions,
    quote_custom_instructions: quoteInstructions,
    min_score_filter: minScore
  }, () => {
    updateApiStatus(key);
    flashSaved('setup-saved');
  });
});

// ── Save Filters ──────────────────────────────────────────────────────────
$('save-filters').addEventListener('click', () => {
  chrome.storage.local.set({
    keywords,
    blocked_keywords: blockedKeywords
  }, () => flashSaved('filters-saved'));
});

// ── Save Features ─────────────────────────────────────────────────────────
$('save-features').addEventListener('click', () => {
  const alertsEnabled = $('alerts_enabled').checked;
  chrome.storage.local.set({
    auto_analyze: $('auto_analyze').checked,
    show_verified_badge: $('show_verified_badge').checked,
    alerts_enabled: alertsEnabled,
    poll_interval: parseInt($('poll_interval').value) || 15
  }, () => {
    // Restart or stop alarm
    chrome.runtime.sendMessage({
      type: alertsEnabled ? 'RESTART_ALARM' : 'STOP_ALARM'
    });
    flashSaved('features-saved');
  });
});

// ── Keywords ──────────────────────────────────────────────────────────────
$('kw-add').addEventListener('click', () => addKeyword());
$('kw-input').addEventListener('keydown', e => { if (e.key === 'Enter') addKeyword(); });

function addKeyword() {
  const val = $('kw-input').value.trim();
  if (!val || keywords.includes(val)) return;
  keywords.push(val);
  $('kw-input').value = '';
  renderKeywords();
}

function renderKeywords() {
  const list = $('kw-list');
  list.innerHTML = '';
  keywords.forEach((kw, i) => {
    const tag = document.createElement('div');
    tag.className = 'tag keyword';
    tag.innerHTML = `${kw} <span class="tag-remove" data-i="${i}">✕</span>`;
    tag.querySelector('.tag-remove').addEventListener('click', () => {
      keywords.splice(i, 1);
      renderKeywords();
    });
    list.appendChild(tag);
  });
}

// ── Blocked Keywords ──────────────────────────────────────────────────────
$('block-add').addEventListener('click', () => addBlocked());
$('block-input').addEventListener('keydown', e => { if (e.key === 'Enter') addBlocked(); });

function addBlocked() {
  const val = $('block-input').value.trim();
  if (!val || blockedKeywords.includes(val)) return;
  blockedKeywords.push(val);
  $('block-input').value = '';
  renderBlockedKeywords();
}

function renderBlockedKeywords() {
  const list = $('block-list');
  list.innerHTML = '';
  blockedKeywords.forEach((kw, i) => {
    const tag = document.createElement('div');
    tag.className = 'tag blocked';
    tag.innerHTML = `${kw} <span class="tag-remove" data-i="${i}">✕</span>`;
    tag.querySelector('.tag-remove').addEventListener('click', () => {
      blockedKeywords.splice(i, 1);
      renderBlockedKeywords();
    });
    list.appendChild(tag);
  });
}

// ── Tabs ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// ── Export / Import ───────────────────────────────────────────────────────
$('export-settings').addEventListener('click', () => {
  chrome.storage.local.get(null, (data) => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'upsmart-settings.json';
    a.click();
  });
});

$('import-settings').addEventListener('click', () => $('import-file').click());

$('import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      chrome.storage.local.set(data, () => {
        loadAll();
        alert('Settings imported!');
      });
    } catch {
      alert('Invalid settings file');
    }
  };
  reader.readAsText(file);
});

// ── Clear All ─────────────────────────────────────────────────────────────
$('clear-all').addEventListener('click', () => {
  if (confirm('Clear ALL UpSmart data? This cannot be undone.')) {
    chrome.storage.local.clear(() => {
      loadAll();
      alert('All data cleared.');
    });
  }
});

// ── Utils ─────────────────────────────────────────────────────────────────
function flashSaved(id) {
  const el = $(id);
  el.textContent = '✓ Saved!';
  setTimeout(() => el.textContent = '', 2000);
}

// ── Init ──────────────────────────────────────────────────────────────────
loadAll();
