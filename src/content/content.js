// UpSmart Content Script
// Injects into Upwork job search pages

(function () {
  'use strict';

  let settings = {};
  let tooltip = null;
  let analyzedJobs = new Map();
  let observer = null;
  let isEnabled = true;
  let processTimer = null;
  let isProcessingCards = false;
  let observerPaused = false;
  const MAX_JOB_CARDS = 60;

  // ── Boot ──────────────────────────────────────────────────────────────────
  async function init() {
    settings = await loadSettings();
    isEnabled = settings.extensionEnabled;

    if (!isEnabled) {
      injectDisabledBar();
      console.log('[UpSmart] Disabled');
      return;
    }

    activateExtension();
  }

  function activateExtension() {
    injectToolbar();
    injectSidebarToggle();
    processJobCards();
    observeDOM();
    console.log('[UpSmart] Initialized');
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get([
        'openai_api_key', 'freelancer_profile', 'proposal_custom_instructions',
        'keywords', 'blocked_keywords',
        'auto_analyze', 'min_score_filter', 'show_verified_badge',
        'extension_enabled'
      ], (result) => {
        resolve({
          apiKey: result.openai_api_key || '',
          profile: result.freelancer_profile || '',
          proposalInstructions: result.proposal_custom_instructions || '',
          keywords: result.keywords || [],
          blockedKeywords: result.blocked_keywords || [],
          autoAnalyze: result.auto_analyze || false,
          minScoreFilter: result.min_score_filter || 0,
          showVerifiedBadge: result.show_verified_badge !== false,
          extensionEnabled: result.extension_enabled !== false
        });
      });
    });
  }

  // ── Toolbar ───────────────────────────────────────────────────────────────
  function injectToolbar() {
    if (document.getElementById('upsmart-toolbar')) return;

    const toolbar = document.createElement('div');
    toolbar.id = 'upsmart-toolbar';
    toolbar.innerHTML = `
      <span class="upsmart-logo">⚡ UPSMART</span>
      <span class="upsmart-sep">|</span>
      <button id="us-btn-analyze-all">Analyze All</button>
      <button id="us-btn-clear">Clear Filters</button>
      <span class="upsmart-sep">|</span>
      <input type="text" id="us-search-filter" placeholder="Filter keywords..." />
      <button id="us-btn-filter">Filter</button>
      <button id="us-btn-power" class="active" title="Disable UpSmart">ON</button>
      <span id="upsmart-status">Ready</span>
    `;

    document.body.insertBefore(toolbar, document.body.firstChild);

    document.getElementById('us-btn-analyze-all').addEventListener('click', analyzeAllVisible);
    document.getElementById('us-btn-clear').addEventListener('click', clearFilters);
    document.getElementById('us-btn-filter').addEventListener('click', () => {
      const val = document.getElementById('us-search-filter').value;
      filterByText(val);
    });
    document.getElementById('us-search-filter').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') filterByText(e.target.value);
    });
    document.getElementById('us-btn-power').addEventListener('click', () => setExtensionEnabled(false));
  }

  function injectDisabledBar() {
    if (document.getElementById('upsmart-toolbar')) return;

    const toolbar = document.createElement('div');
    toolbar.id = 'upsmart-toolbar';
    toolbar.className = 'upsmart-disabled-bar';
    toolbar.innerHTML = `
      <span class="upsmart-logo">⚡ UPSMART</span>
      <span class="upsmart-disabled-msg">Extension is off</span>
      <button id="us-btn-enable" class="active">Enable</button>
    `;

    document.body.insertBefore(toolbar, document.body.firstChild);
    document.getElementById('us-btn-enable').addEventListener('click', () => setExtensionEnabled(true));
  }

  function setExtensionEnabled(enabled) {
    chrome.storage.local.set({ extension_enabled: enabled });
  }

  function teardownExtension() {
    if (processTimer) {
      clearTimeout(processTimer);
      processTimer = null;
    }
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    closeModal();
    hideTooltip();
    if (tooltip) {
      tooltip.remove();
      tooltip = null;
    }

    document.getElementById('upsmart-toolbar')?.remove();
    document.getElementById('upsmart-sidebar-toggle')?.remove();
    document.getElementById('upsmart-sidebar-frame')?.remove();

    getJobCards().forEach(card => {
      card.querySelectorAll('.upsmart-job-header').forEach(el => el.remove());
      card.classList.remove('upsmart-dimmed');
      delete card.dataset.upsmartProcessed;
      card.querySelectorAll('mark.upsmart-keyword-highlight').forEach(mark => {
        mark.replaceWith(mark.textContent);
      });
    });

    analyzedJobs.clear();
  }

  function injectSidebarToggle() {
    if (document.getElementById('upsmart-sidebar-toggle')) return;
    const btn = document.createElement('button');
    btn.id = 'upsmart-sidebar-toggle';
    btn.textContent = 'TRACKER';
    btn.title = 'Open Job Tracker';
    btn.addEventListener('click', openSidebar);
    document.body.appendChild(btn);
  }

  // ── Job Card Parsing ──────────────────────────────────────────────────────
  function isJobCard(el) {
    if (!el || el.closest('#upsmart-toolbar, #upsmart-modal-overlay, #upsmart-sidebar-frame')) {
      return false;
    }
    const jobLink = el.querySelector(
      '[data-cy="job-title"] a, .job-title a, a[href*="/jobs/"]'
    );
    if (!jobLink) return false;
    const href = jobLink.getAttribute('href') || '';
    return /\/jobs\//.test(href) && !href.includes('/jobs/search');
  }

  function getJobCards() {
    const seen = new Set();
    const cards = [];

    const addCard = (card) => {
      if (!card || seen.has(card) || !isJobCard(card)) return;
      seen.add(card);
      cards.push(card);
    };

    const tileSelectors = [
      '[data-cy="job-tile"]',
      '[data-test="JobTile"]',
      'article.job-tile',
      '.job-tile',
      '[class*="JobTile"]'
    ];

    for (const sel of tileSelectors) {
      document.querySelectorAll(sel).forEach(addCard);
      if (cards.length) return cards.slice(0, MAX_JOB_CARDS);
    }

    const feedRoot =
      document.querySelector('[data-cy="job-tile-list"], [data-cy="job-feed"], main') ||
      document.body;

    feedRoot.querySelectorAll('section.air3-card, article.air3-card').forEach(addCard);
    if (cards.length) return cards.slice(0, MAX_JOB_CARDS);

    feedRoot.querySelectorAll('a[href*="/jobs/"]').forEach((link) => {
      const href = link.getAttribute('href') || '';
      if (href.includes('/jobs/search')) return;
      const card = link.closest('section, article, li, [role="listitem"]');
      addCard(card);
    });

    return cards.slice(0, MAX_JOB_CARDS);
  }

  function parseJobCard(card) {
    const getText = (selectors) => {
      for (const sel of selectors) {
        const el = card.querySelector(sel);
        if (el) return el.textContent.trim();
      }
      return '';
    };

    const getHref = (selectors) => {
      for (const sel of selectors) {
        const el = card.querySelector(sel);
        if (el) return el.href || el.getAttribute('href') || '';
      }
      return '';
    };

    return {
      id: card.dataset.jobId || card.id || Math.random().toString(36).slice(2),
      title: getText(['[data-cy="job-title"] a', '.job-title a', 'h2 a', 'h3 a', '[class*="title"] a']),
      description: getText(['[data-cy="job-description-text"]', '.job-description', '[class*="description"]', 'p']),
      budget: getText(['[data-cy="job-type-label"]', '.budget', '[class*="budget"]', '[class*="price"]']),
      skills: Array.from(card.querySelectorAll('[data-cy="badge"] span, .skill-badge, [class*="skill"]')).map(s => s.textContent.trim()).join(', '),
      clientInfo: getText(['[data-cy="client-country"]', '.client-info', '[class*="client"]']),
      paymentVerified: card.textContent.includes('Payment verified') || card.textContent.includes('payment method verified'),
      url: getHref(['[data-cy="job-title"] a', '.job-title a', 'h2 a', 'a[href*="/jobs/"]']),
      rawText: (card.textContent || '').slice(0, 4000)
    };
  }

  // ── Process Cards ─────────────────────────────────────────────────────────
  function processJobCards() {
    if (isProcessingCards || observerPaused) return;
    isProcessingCards = true;
    observerPaused = true;

    try {
      const cards = getJobCards();
      let newCount = 0;

      cards.forEach(card => {
        if (card.dataset.upsmartProcessed) return;
        card.dataset.upsmartProcessed = '1';
        newCount++;

        const job = parseJobCard(card);
        injectJobUI(card, job);

        if (settings.blockedKeywords.length > 0) {
          applyBlockFilter(card, job);
        }

        if (settings.keywords.length > 0) {
          highlightKeywords(card, job);
        }

        if (settings.autoAnalyze && settings.apiKey) {
          setTimeout(() => analyzeJob(card, job), Math.random() * 2000 + newCount * 400);
        }
      });

      if (newCount > 0 || cards.length > 0) {
        setStatus(`${cards.length} job${cards.length === 1 ? '' : 's'} found`);
      }
    } finally {
      isProcessingCards = false;
      requestAnimationFrame(() => {
        observerPaused = false;
      });
    }
  }

  function scheduleProcessJobCards() {
    if (processTimer) clearTimeout(processTimer);
    processTimer = setTimeout(() => {
      processTimer = null;
      processJobCards();
    }, 300);
  }

  // ── Inject Job UI ─────────────────────────────────────────────────────────
  function injectJobUI(card, job) {
    // Create wrapper at top of card
    const wrapper = document.createElement('div');
    wrapper.className = 'upsmart-job-header';
    wrapper.style.cssText = 'padding: 6px 0 4px; border-bottom: 1px solid #f1f5f9; margin-bottom: 6px;';

    // Score badge
    const badge = document.createElement('span');
    badge.className = 'upsmart-score-badge loading';
    badge.dataset.jobId = job.id;
    badge.textContent = '⚡ Analyze';
    badge.addEventListener('click', () => analyzeJob(card, job, badge));
    wrapper.appendChild(badge);

    // Payment verified badge
    if (settings.showVerifiedBadge) {
      const verified = document.createElement('span');
      verified.className = `upsmart-verified ${job.paymentVerified ? 'yes' : 'no'}`;
      verified.textContent = job.paymentVerified ? '✓ Verified' : '✗ Unverified';
      wrapper.appendChild(verified);
    }

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'upsmart-actions';

    const btnAnalyze = createBtn('✦ Score', 'upsmart-btn upsmart-btn-analyze', () => analyzeJob(card, job, badge));
    const btnProposal = createBtn('✍ Proposal', 'upsmart-btn upsmart-btn-proposal', () => generateProposal(job));
    const btnQuote = createBtn('$ Quote', 'upsmart-btn upsmart-btn-quote', () => generateQuote(job));
    const btnTrack = createBtn('+ Track', 'upsmart-btn upsmart-btn-track', () => trackJob(job));

    actions.append(btnAnalyze, btnProposal, btnQuote, btnTrack);
    wrapper.appendChild(actions);

    card.insertBefore(wrapper, card.firstChild);
  }

  function createBtn(text, className, onClick) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.className = className;
    btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return btn;
  }

  // ── Analyze Job (OpenAI) ──────────────────────────────────────────────────
  async function analyzeJob(card, job, badgeEl) {
    if (!settings.apiKey) {
      alert('UpSmart: Please set your OpenAI API key in the extension popup first!');
      return;
    }

    if (analyzedJobs.has(job.id)) {
      showAnalysisTooltip(card, analyzedJobs.get(job.id));
      return;
    }

    const badge = badgeEl || card.querySelector('.upsmart-score-badge');
    if (badge) {
      badge.className = 'upsmart-score-badge loading';
      badge.textContent = '⟳ Analyzing...';
    }

    setStatus('Analyzing job...');

    try {
      const analysis = await callOpenAI('analyze', job);
      analyzedJobs.set(job.id, analysis);

      if (badge) {
        const labelClass = analysis.scoreLabel?.toLowerCase() || 'fair';
        badge.className = `upsmart-score-badge ${labelClass}`;
        badge.textContent = `${getScoreEmoji(analysis.score)} ${analysis.score}/10 · ${analysis.scoreLabel}`;
        badge.addEventListener('mouseenter', (e) => showTooltipAt(e, analysis));
        badge.addEventListener('mouseleave', hideTooltip);
      }

      // Apply score filter
      if (settings.minScoreFilter > 0 && analysis.score < settings.minScoreFilter) {
        card.classList.add('upsmart-dimmed');
      }

      setStatus(`Analyzed: ${analysis.score}/10`);
    } catch (err) {
      if (badge) {
        badge.className = 'upsmart-score-badge poor';
        badge.textContent = '⚠ Error';
        badge.title = err.message;
      }
      setStatus('Error: ' + err.message);
    }
  }

  async function analyzeAllVisible() {
    const cards = getJobCards();
    setStatus(`Analyzing ${cards.length} jobs...`);
    let done = 0;

    for (const card of cards) {
      if (!card.dataset.upsmartProcessed) {
        card.dataset.upsmartProcessed = '1';
        const job = parseJobCard(card);
        injectJobUI(card, job);
      }
      const job = parseJobCard(card);
      if (!analyzedJobs.has(job.id)) {
        await analyzeJob(card, job);
        done++;
        setStatus(`Analyzed ${done}/${cards.length}...`);
        await sleep(500); // rate limit
      }
    }
    setStatus(`Done — ${done} jobs analyzed`);
  }

  // ── Generate Proposal ─────────────────────────────────────────────────────
  async function generateProposal(job) {
    if (!settings.apiKey) {
      alert('UpSmart: Please set your OpenAI API key in the extension popup first!');
      return;
    }

    showModal('✍ AI Proposal Generator', '<p style="color:#64748b;font-size:13px">Generating proposal...</p>');

    try {
      const proposal = await callOpenAI('proposal', job);
      updateModal(`
        <div style="margin-bottom:10px;font-size:12px;color:#64748b">
          Job: <strong>${job.title || 'Unknown'}</strong>
        </div>
        <textarea id="upsmart-proposal-text">${proposal}</textarea>
        <div class="upsmart-modal-actions">
          <button class="upsmart-regenerate-btn" onclick="window._upsmartRegenerateProposal()">↺ Regenerate</button>
          <button class="upsmart-copy-btn" onclick="window._upsmartCopyProposal()">Copy to Clipboard</button>
        </div>
      `);

      window._upsmartCopyProposal = () => {
        const ta = document.getElementById('upsmart-proposal-text');
        navigator.clipboard.writeText(ta.value);
        showToast('Copied!');
      };
      window._upsmartRegenerateProposal = () => generateProposal(job);

    } catch (err) {
      updateModal(`<p style="color:#dc2626">Error: ${err.message}</p>`);
    }
  }

  // ── Generate Quote ────────────────────────────────────────────────────────
  async function generateQuote(job) {
    if (!settings.apiKey) {
      alert('UpSmart: Please set your OpenAI API key in the extension popup first!');
      return;
    }

    showModal('$ Project Quote Estimator', '<p style="color:#64748b;font-size:13px">Estimating quote...</p>');

    try {
      const quote = await callOpenAI('quote', job);
      updateModal(`
        <div style="font-size:13px;line-height:1.8">
          <div style="background:#f8fafc;padding:14px;border-radius:8px;margin-bottom:12px">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:4px">Posted Budget</div>
            <div style="font-weight:700;color:#0f172a;font-size:16px">${job.budget || 'Not specified'}</div>
          </div>
          <div style="background:#ecfdf5;padding:14px;border-radius:8px;margin-bottom:12px">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#059669;margin-bottom:4px">Recommended Quote</div>
            <div style="font-weight:700;color:#065f46;font-size:20px">${quote.recommended || 'N/A'}</div>
            <div style="color:#047857;font-size:12px;margin-top:4px">Est. ${quote.hours || 'N/A'} hours</div>
          </div>
          <div style="margin-bottom:10px">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:4px">Rationale</div>
            <div style="color:#334155">${quote.rationale || ''}</div>
          </div>
          <div style="background:#fef3c7;padding:12px;border-radius:8px">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#92400e;margin-bottom:4px">💡 Negotiation Tip</div>
            <div style="color:#713f12">${quote.negotiationTip || ''}</div>
          </div>
        </div>
      `);
    } catch (err) {
      updateModal(`<p style="color:#dc2626">Error: ${err.message}</p>`);
    }
  }

  // ── Track Job ─────────────────────────────────────────────────────────────
  function trackJob(job) {
    chrome.runtime.sendMessage({
      type: 'SAVE_APPLICATION',
      data: {
        id: job.id,
        title: job.title,
        budget: job.budget,
        url: job.url || window.location.href,
        skills: job.skills,
        status: 'saved',
        savedAt: Date.now()
      }
    }, (response) => {
      showToast(response?.ok ? '✓ Job tracked!' : 'Error saving');
    });
  }

  // ── OpenAI API Call ───────────────────────────────────────────────────────
  async function callOpenAI(type, job) {
    const prompts = {
      analyze: `You are an Upwork job analyzer. Analyze this job for a freelancer and respond ONLY with valid JSON.

Freelancer Profile: ${settings.profile || 'General freelancer'}

Job Title: ${job.title}
Budget: ${job.budget}
Description: ${job.description?.slice(0, 800)}
Skills: ${job.skills}
Client Info: ${job.clientInfo}
Payment Verified: ${job.paymentVerified}

JSON structure (respond with ONLY this, no markdown):
{"score":8,"scoreLabel":"Good","summary":"One sentence","redFlags":["flag1"],"greenFlags":["flag1"],"matchReason":"why"}`,

      proposal: `Write a compelling Upwork cover letter. Under 200 words. Start with a hook about their problem, NOT "Hi I'm...". Sound human.

Profile: ${settings.profile || 'Experienced freelancer'}
Job: ${job.title}
Budget: ${job.budget}  
Description: ${job.description?.slice(0, 600)}
${settings.proposalInstructions ? `\nCustom Instructions (follow these closely):\n${settings.proposalInstructions}\n` : ''}
Write only the proposal, no commentary.`,

      quote: `Estimate a project quote for this Upwork job. Respond ONLY with valid JSON, no markdown.

Profile: ${settings.profile}
Job: ${job.title}
Budget: ${job.budget}
Description: ${job.description?.slice(0, 500)}

JSON: {"recommended":"$X-$Y","hours":"X-Y hours","rationale":"2 sentences","negotiationTip":"1 tip"}`
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: type === 'proposal' ? 400 : 500,
        temperature: type === 'proposal' ? 0.7 : 0.3,
        messages: [{ role: 'user', content: prompts[type] }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices[0].message.content.trim();

    if (type === 'proposal') return text;

    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  }

  // ── Keyword Filtering ─────────────────────────────────────────────────────
  function applyKeywordFilter() {
    if (settings.blockedKeywords.length === 0) return;
    getJobCards().forEach(card => {
      const text = card.textContent.toLowerCase();
      const blocked = settings.blockedKeywords.some(kw => text.includes(kw.toLowerCase()));
      if (blocked) card.classList.add('upsmart-dimmed');
    });
  }

  function highlightKeywords(card) {
    if (!settings.keywords.length) return;
    // Simple highlight via title text
    const titleEl = card.querySelector('[data-cy="job-title"] a, .job-title a, h2 a, h3 a');
    if (!titleEl) return;
    const html = titleEl.innerHTML;
    settings.keywords.forEach(kw => {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(${escaped})`, 'gi');
      titleEl.innerHTML = titleEl.innerHTML.replace(re, '<mark class="upsmart-keyword-highlight">$1</mark>');
    });
  }

  function filterByText(text) {
    if (!text.trim()) {
      getJobCards().forEach(c => c.classList.remove('upsmart-dimmed'));
      return;
    }
    const words = text.toLowerCase().split(/\s+/);
    getJobCards().forEach(card => {
      const cardText = card.textContent.toLowerCase();
      const match = words.every(w => cardText.includes(w));
      card.classList.toggle('upsmart-dimmed', !match);
    });
  }

  function applyBlockFilter(card, job) {
    const text = job.rawText.toLowerCase();
    const blocked = settings.blockedKeywords.some(kw => text.includes(kw.toLowerCase()));
    if (blocked) card.classList.add('upsmart-dimmed');
  }

  function clearFilters() {
    getJobCards().forEach(c => c.classList.remove('upsmart-dimmed'));
    const input = document.getElementById('us-search-filter');
    if (input) input.value = '';
    setStatus('Filters cleared');
  }

  // ── Tooltip ───────────────────────────────────────────────────────────────
  function showTooltipAt(e, analysis) {
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'upsmart-tooltip';
      document.body.appendChild(tooltip);
    }

    tooltip.innerHTML = `
      <div class="upsmart-tooltip-title">${getScoreEmoji(analysis.score)} Score: ${analysis.score}/10 — ${analysis.scoreLabel}</div>
      <div style="color:#94a3b8;font-size:11px;margin-bottom:6px">${analysis.summary || ''}</div>
      ${analysis.redFlags?.length ? `
        <div class="upsmart-tooltip-section">
          <div class="upsmart-tooltip-label">🔴 Red Flags</div>
          ${analysis.redFlags.map(f => `<div class="upsmart-flag red">• ${f}</div>`).join('')}
        </div>` : ''}
      ${analysis.greenFlags?.length ? `
        <div class="upsmart-tooltip-section">
          <div class="upsmart-tooltip-label">🟢 Green Flags</div>
          ${analysis.greenFlags.map(f => `<div class="upsmart-flag green">• ${f}</div>`).join('')}
        </div>` : ''}
      ${analysis.matchReason ? `
        <div class="upsmart-tooltip-section">
          <div class="upsmart-tooltip-label">Match</div>
          <div style="color:#cbd5e1;font-size:11px">${analysis.matchReason}</div>
        </div>` : ''}
    `;

    const rect = e.target.getBoundingClientRect();
    tooltip.style.left = Math.min(rect.left, window.innerWidth - 320) + 'px';
    tooltip.style.top = (rect.bottom + 8) + 'px';
    tooltip.classList.add('visible');
  }

  function hideTooltip() {
    if (tooltip) tooltip.classList.remove('visible');
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  let currentModal = null;

  function showModal(title, content) {
    closeModal();
    const overlay = document.createElement('div');
    overlay.className = 'upsmart-modal-overlay';
    overlay.id = 'upsmart-modal-overlay';
    overlay.innerHTML = `
      <div class="upsmart-modal">
        <div class="upsmart-modal-header">
          <span class="upsmart-modal-title">${title}</span>
          <button class="upsmart-modal-close" id="upsmart-modal-close-btn">✕</button>
        </div>
        <div id="upsmart-modal-body">${content}</div>
      </div>
    `;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    document.getElementById('upsmart-modal-close-btn')?.addEventListener('click', closeModal);
    document.body.appendChild(overlay);
    currentModal = overlay;
  }

  function updateModal(content) {
    const body = document.getElementById('upsmart-modal-body');
    if (body) body.innerHTML = content;
    // re-attach close button
    document.getElementById('upsmart-modal-close-btn')?.addEventListener('click', closeModal);
  }

  function closeModal() {
    if (currentModal) {
      currentModal.remove();
      currentModal = null;
    }
  }

  // ── Sidebar ───────────────────────────────────────────────────────────────
  function closeSidebar() {
    document.getElementById('upsmart-sidebar-frame')?.remove();
  }

  function openSidebar() {
    const existing = document.getElementById('upsmart-sidebar-frame');
    if (existing) { closeSidebar(); return; }

    const frame = document.createElement('iframe');
    frame.id = 'upsmart-sidebar-frame';
    frame.src = chrome.runtime.getURL('src/sidebar/sidebar.html');
    frame.style.cssText = `
      position: fixed; right: 0; top: 0; width: 400px; height: 100vh;
      border: none; z-index: 999998; border-left: 2px solid #0f172a;
      box-shadow: -4px 0 24px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(frame);
  }

  window.addEventListener('message', (event) => {
    if (event.data?.type !== 'UPSMART_CLOSE_SIDEBAR') return;
    const frame = document.getElementById('upsmart-sidebar-frame');
    if (!frame || event.source !== frame.contentWindow) return;
    closeSidebar();
  });

  // ── Toast ─────────────────────────────────────────────────────────────────
  function showToast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = `
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      background: #0f172a; color: white; padding: 10px 20px; border-radius: 8px;
      font-size: 13px; z-index: 9999999; font-family: monospace; font-weight: 600;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function setStatus(msg) {
    const el = document.getElementById('upsmart-status');
    if (el) el.textContent = msg;
  }

  function getScoreEmoji(score) {
    if (score >= 8) return '🟢';
    if (score >= 6) return '🔵';
    if (score >= 4) return '🟡';
    return '🔴';
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ── DOM Observer ─────────────────────────────────────────────────────────
  function observeDOM() {
    const feedRoot =
      document.querySelector('[data-cy="job-tile-list"], [data-cy="job-feed"], main') ||
      document.body;

    observer = new MutationObserver((mutations) => {
      if (observerPaused) return;

      const hasRelevantChange = mutations.some((m) => {
        const nodes = [...m.addedNodes];
        return nodes.some((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return false;
          return !node.closest?.(
            '#upsmart-toolbar, #upsmart-modal-overlay, .upsmart-tooltip, .upsmart-job-header'
          );
        });
      });

      if (hasRelevantChange) scheduleProcessJobCards();
    });

    observer.observe(feedRoot, { childList: true, subtree: true });
  }

  // ── Listen for settings changes ───────────────────────────────────────────
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;

    if (changes.extension_enabled) {
      const enabled = changes.extension_enabled.newValue !== false;
      if (enabled === isEnabled) return;

      isEnabled = enabled;
      settings = await loadSettings();

      if (enabled) {
        teardownExtension();
        activateExtension();
      } else {
        teardownExtension();
        injectDisabledBar();
      }
      return;
    }

    settings = await loadSettings();
  });

  // ── Start ─────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
