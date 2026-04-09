(function initStedrokGptReportLab() {
  const form = document.getElementById('tickerForm');
  const tickerInput = document.getElementById('tickerInput');
  const analyzeButton = document.getElementById('analyzeButton');
  const uiStatus = document.getElementById('uiStatus');
  const stageFast = document.getElementById('stageFast');
  const stageDeep = document.getElementById('stageDeep');
  const snapshotMeta = document.getElementById('snapshotMeta');
  const snapshotCards = document.getElementById('snapshotCards');
  const reportShell = document.getElementById('reportShell');
  const reportSummary = document.getElementById('reportSummary');
  const reportSections = document.getElementById('reportSections');
  const rawOutput = document.getElementById('rawOutput');
  const rawCommand = document.getElementById('rawCommand');
  const accessNotice = document.getElementById('accessNotice');

  if (!form || !tickerInput || !analyzeButton || !uiStatus || !stageFast || !stageDeep || !snapshotMeta || !snapshotCards || !reportShell || !reportSummary || !reportSections || !rawOutput || !rawCommand) {
    return;
  }

  const SYMBOL_RE = /^[A-Za-z][A-Za-z0-9.-]{0,9}$/;
  let activeAccessToken = '';
  let hasPaidAccess = false;

  function setStatus(message, kind) {
    uiStatus.textContent = message || '';
    uiStatus.classList.toggle('error', kind === 'error');
  }

  function setStage(el, state) {
    el.classList.remove('loading', 'done', 'error');
    if (state) {
      el.classList.add(state);
    }
  }

  function setFormEnabled(enabled) {
    tickerInput.disabled = !enabled;
    analyzeButton.disabled = !enabled;
    if (enabled) {
      tickerInput.placeholder = 'Enter ticker (e.g., AAPL)';
      return;
    }
    tickerInput.placeholder = 'Pro access required';
  }

  function setAccessNotice(message, tone) {
    if (!accessNotice) return;
    accessNotice.classList.remove('success', 'warn', 'error');
    if (tone === 'success' || tone === 'warn' || tone === 'error') {
      accessNotice.classList.add(tone);
    }
    accessNotice.innerHTML = message || '';
  }

  function isActivePaidProfile(profile) {
    if (!profile) return false;
    if (String(profile.subscription_status || '').toLowerCase() !== 'active') return false;

    if (profile.is_lifetime === true) return true;
    if (String(profile.subscription_type || '').toLowerCase() === 'lifetime') return true;

    if (!profile.paid_until) return false;
    const expiry = new Date(profile.paid_until);
    if (Number.isNaN(expiry.getTime())) return false;
    return expiry.getTime() >= Date.now();
  }

  async function fetchSessionCompat(client) {
    try {
      if (client?.auth && typeof client.auth.getSession === 'function') {
        const res = await client.auth.getSession();
        return (res && res.data && res.data.session) ? res.data.session : res.session || null;
      }
      if (client?.auth && typeof client.auth.session === 'function') {
        const res = await client.auth.session();
        return (res && res.data && res.data.session) ? res.data.session : res.session || res || null;
      }
      if (client?.auth && typeof client.auth.getUser === 'function') {
        const res = await client.auth.getUser();
        return (res && res.data && res.data.user) ? { user: res.data.user } : null;
      }
    } catch (_error) {
      return null;
    }
    return null;
  }

  async function fetchProfileViaWorker(accessToken) {
    if (!accessToken) return null;
    const data = await fetchJson(buildApiUrl('/api/picks'), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }, 18000);

    return data && data.user ? data.user : null;
  }

  async function fetchProfileDirect(client, userId) {
    if (!client || !userId) return { profile: null, error: null };

    let { data: profile, error } = await client
      .from('profiles')
      .select('subscription_status, paid_until, subscription_type, is_lifetime')
      .eq('id', userId)
      .single();

    const errorText = `${String(error?.message || '')} ${String(error?.details || '')}`.toLowerCase();
    if (error && (errorText.includes('subscription_type') || errorText.includes('is_lifetime'))) {
      ({ data: profile, error } = await client
        .from('profiles')
        .select('subscription_status, paid_until')
        .eq('id', userId)
        .single());
    }

    return { profile: profile || null, error: error || null };
  }

  async function enforcePaidAccess() {
    hasPaidAccess = false;
    setFormEnabled(false);
    setAccessNotice('Checking Pro access...', 'warn');
    setStatus('Checking account access...', 'info');

    const client = window.supabaseClient;
    if (!client || !client.auth) {
      setAccessNotice('Access check is unavailable right now. Please refresh, then sign in again.', 'error');
      setStatus('Unable to verify access.', 'error');
      return false;
    }

    const session = await fetchSessionCompat(client);
    if (!session || !session.user) {
      setAccessNotice('Sign in to continue. This page is available to Pro members only. <a href="login.html">Log in</a> or <a href="register.html">create a free account</a>.', 'warn');
      setStatus('Sign in required.', 'error');
      return false;
    }

    activeAccessToken = String(session.access_token || '');
    if (!activeAccessToken && client?.auth && typeof client.auth.getSession === 'function') {
      try {
        const latest = await client.auth.getSession();
        const recoveredToken = latest?.data?.session?.access_token || latest?.session?.access_token || '';
        activeAccessToken = String(recoveredToken || '');
      } catch (_tokenError) {
      }
    }

    let profile = null;
    let checkError = null;

    if (activeAccessToken) {
      try {
        profile = await fetchProfileViaWorker(activeAccessToken);
      } catch (workerError) {
        checkError = workerError;
      }
    }

    if (!profile) {
      const direct = await fetchProfileDirect(client, session.user.id);
      profile = direct.profile;
      if (direct.error) {
        checkError = direct.error;
      }
    }

    if (!profile) {
      setAccessNotice('We could not verify your subscription right now. Please refresh and try again.', 'error');
      setStatus('Subscription check failed.', 'error');
      if (checkError) {
        console.warn('[stedrokgpt access-check] subscription verification failed:', checkError);
      }
      return false;
    }

    if (!isActivePaidProfile(profile)) {
      setAccessNotice('Pro feature: StedrokGPT Research Lab is available on active Pro plans. <a href="pricing.html">Upgrade to Pro</a> to unlock this tool.', 'warn');
      setStatus('Upgrade to Pro to run research analysis.', 'error');
      return false;
    }

    hasPaidAccess = true;
    setFormEnabled(true);
    setAccessNotice('<strong>Pro access active.</strong> This lab can be stricter than Core/AI Hybrid because additional structural hard-stop checks are enforced before output is accepted.', 'success');
    setStatus('Ready. Enter a ticker to start analysis.', 'info');
    return true;
  }

  function resetUi() {
    setStage(stageFast, '');
    setStage(stageDeep, '');
    snapshotMeta.textContent = 'Awaiting ticker input.';
    snapshotCards.innerHTML = '';
    reportShell.classList.remove('visible');
    reportSummary.innerHTML = '';
    reportSections.innerHTML = '';
    rawOutput.textContent = '';
    rawCommand.textContent = '$ /stock --';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatCurrency(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: numeric >= 100 ? 2 : 3
    }).format(numeric);
  }

  function formatMarketCap(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 'N/A';
    if (Math.abs(numeric) >= 1e12) return `${(numeric / 1e12).toFixed(2)}T`;
    if (Math.abs(numeric) >= 1e9) return `${(numeric / 1e9).toFixed(2)}B`;
    if (Math.abs(numeric) >= 1e6) return `${(numeric / 1e6).toFixed(2)}M`;
    return `${numeric.toLocaleString('en-US')}`;
  }

  function formatPercent(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 'N/A';
    const sign = numeric > 0 ? '+' : '';
    return `${sign}${numeric.toFixed(2)}%`;
  }

  function parseApiBase() {
    const pageUrl = new URL(window.location.href);
    const override = pageUrl.searchParams.get('api');
    if (override) {
      return override.replace(/\/$/, '');
    }

    if (typeof CONFIG !== 'undefined' && CONFIG && typeof CONFIG.API_BASE_URL === 'string' && CONFIG.API_BASE_URL) {
      return CONFIG.API_BASE_URL.replace(/\/$/, '');
    }

    return '';
  }

  function buildApiUrl(path) {
    const base = parseApiBase();
    if (base) return `${base}${path}`;
    return path;
  }

  function normalizeApiErrorMessage(error) {
    const status = Number(error && error.status);
    const raw = String((error && error.message) || '').trim();
    if (status === 401) return 'Session expired. Please log in again and retry.';
    if (status === 403) return 'Pro plan required for StedrokGPT Research Lab.';
    if (status === 409 && /account setup incomplete|log out and sign in/i.test(raw)) {
      return 'Account setup is still syncing. Please log out and sign in once, then retry.';
    }
    if (status === 404 && /account not found/i.test(raw)) {
      return 'Profile lookup failed for this account. Please log out/in once. If it persists, contact support.';
    }
    if (status === 404) return 'Resource not found. Please refresh and try again.';
    return raw || 'Analysis failed.';
  }

  async function fetchJson(url, init, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(function onTimeout() {
      controller.abort();
    }, timeoutMs || 120000);

    try {
      const response = await fetch(url, { ...(init || {}), signal: controller.signal });
      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        const message = data && data.error ? data.error : `Request failed (HTTP ${response.status})`;
        const err = new Error(message);
        err.status = response.status;
        err.payload = data;
        throw err;
      }

      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function renderSnapshot(snapshot) {
    const cards = [
      { label: 'Company', value: `${snapshot.name || 'N/A'} (${snapshot.symbol || 'N/A'})` },
      { label: 'Price', value: formatCurrency(snapshot.price) },
      { label: 'Change', value: formatPercent(snapshot.change_percent) },
      { label: '52W Range', value: `${formatCurrency(snapshot.week52_low)} - ${formatCurrency(snapshot.week52_high)}` },
      { label: 'Market Cap', value: formatMarketCap(snapshot.market_cap) },
      { label: 'P/E (TTM)', value: Number.isFinite(Number(snapshot.trailing_pe)) ? Number(snapshot.trailing_pe).toFixed(2) : 'N/A' },
      { label: 'Forward P/E', value: Number.isFinite(Number(snapshot.forward_pe)) ? Number(snapshot.forward_pe).toFixed(2) : 'N/A' },
      { label: 'Exchange', value: `${snapshot.exchange || 'N/A'} / ${snapshot.currency || 'USD'}` }
    ];

    snapshotCards.innerHTML = cards.map(function buildCard(item) {
      return `<article class="metric-card"><span class="metric-label">${escapeHtml(item.label)}</span><span class="metric-value">${escapeHtml(item.value)}</span></article>`;
    }).join('');

    snapshotMeta.textContent = `Live snapshot loaded for ${snapshot.symbol || 'N/A'} at ${snapshot.as_of_utc || 'N/A'}.`;
  }

  function parseVerdictSummary(text) {
    const lines = String(text || '').split(/\r?\n/);
    const verdictLine = lines.filter(function pick(line) {
      return line.indexOf('VERDICT=') !== -1;
    }).pop();

    if (!verdictLine) {
      return null;
    }

    const kv = {};
    verdictLine.split('|').forEach(function eachPart(part) {
      const chunk = String(part || '').trim();
      const eq = chunk.indexOf('=');
      if (eq <= 0) {
        return;
      }
      const key = chunk.slice(0, eq).trim().toUpperCase();
      const value = chunk.slice(eq + 1).trim();
      if (key) {
        kv[key] = value;
      }
    });

    if (!kv.VERDICT) {
      return null;
    }

    return {
      verdict: kv.VERDICT || 'N/A',
      buyBelow: kv.BUY_BELOW || 'N/A',
      fairValue: kv.FAIR_VALUE_BEAR_BASE_BULL || 'N/A',
      premiumOrMosLabel: kv.PREM_TO_FV ? 'Premium to FV' : (kv.MOS ? 'MOS (Margin of Safety)' : 'Premium/MOS'),
      premiumOrMosValue: kv.PREM_TO_FV || kv.MOS || 'N/A',
      confidence: kv.CONFIDENCE || 'N/A',
      date: kv.DATE || 'N/A',
      rawLine: verdictLine.trim()
    };
  }

  function isNoiseSeparator(line) {
    const trimmed = String(line || '').trim();
    if (!trimmed) return false;
    return /^[-=]{5,}$/.test(trimmed) || /^[!#=_*\u2500\u2550]{6,}$/.test(trimmed);
  }

  function isStandaloneVerdictLabel(line) {
    const normalized = String(line || '').trim().toUpperCase();
    return /^(OVERVALUED|WATCH|BUY|STRONG BUY|AVOID|STRONG AVOID|HOLD)$/.test(normalized);
  }

  function isLikelyUppercaseHeading(line) {
    const trimmed = String(line || '').trim();
    if (!trimmed || isStandaloneVerdictLabel(trimmed)) return false;
    if (trimmed.includes('|')) return false;
    if (!/^[A-Z][A-Z0-9\s&()\/+\-—:]{6,}$/.test(trimmed)) return false;
    const words = trimmed.split(/\s+/).filter(Boolean);
    return words.length >= 2 && words.length <= 14;
  }

  function normalizeHardStopReason(line) {
    let out = String(line || '').trim();
    out = out.replace(/^\s*(?:[!#=_*\-]{2,}\s*)+/, '').trim();
    out = out.replace(/^\s*⚠\s*/, '⚠ ').trim();
    out = out.replace(/^\s*Δ\s*/, 'Δ ').trim();
    return out;
  }

  function stripAnsi(text) {
    return String(text || '').replace(/\x1b\[[0-9;]*m/g, '');
  }

  function normalizeStructuralText(text) {
    let cleaned = stripAnsi(text).replace(/\r/g, '');

    cleaned = cleaned.replace(/^\s*[!#=_*\-]{8,}\s*$/gm, '');
    cleaned = cleaned.replace(/^\s*[!\-=_*]{3,}\s*/gm, '');
    cleaned = cleaned.replace(/^\s*([!#=_*]{3,})\s*(.+?)\s*\1\s*$/gm, '$2');
    cleaned = cleaned.replace(/^\s*!+\s*/gm, '');
    cleaned = cleaned.replace(/^\s*(?:[!#=_*\-]{2,}\s*)+([A-Za-z].*)$/gm, '$1');
    cleaned = cleaned.replace(/^\s*VERDICT:\s*[A-Z ]+\s*$/gim, '');

    cleaned = cleaned.replace(
      /^\s*(?:!+\s*)?ANALYSIS ABORTED\s*[—-]\s*STRUCTURAL HARD STOP TRIGGERED\s*$/gim,
      '### Structural Hard Stop Triggered'
    );
    cleaned = cleaned.replace(
      /(Forward projections SUPPRESSED\s*[—-]\s*structural halt)/gi,
      '### $1'
    );

    cleaned = cleaned.replace(
      /^\s*Hard Stops:\s*(.+)$/gim,
      function hardStopsToList(_m, reasons) {
        const items = String(reasons || '')
          .split(/\s*;\s*/)
          .map(function each(part) {
            return part.trim();
          })
          .filter(Boolean)
          .map(function asBullet(part) {
            return `- ${normalizeHardStopReason(part)}`;
          });
        return items.length ? `Hard Stops:\n${items.join('\n')}` : 'Hard Stops:';
      }
    );

    cleaned = cleaned.replace(
      /^\s*⚠\s+([^\n]+)$/gim,
      function warningBullet(_m, body) {
        return `- ⚠ ${normalizeHardStopReason(body)}`;
      }
    );
    cleaned = cleaned.replace(/^\s*⚠\s+/gm, '- ⚠ ');
    cleaned = cleaned.replace(/^\s*Δ\s+/gm, '- Δ ');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    return cleaned.trim();
  }

  function titleCaseLabel(token) {
    const map = {
      DATA: 'Data',
      VALUATION: 'Valuation',
      FORENSIC: 'Forensic',
      ACTION: 'Action'
    };
    const key = String(token || '').trim().toUpperCase();
    if (map[key]) return map[key];
    return key ? key.charAt(0) + key.slice(1).toLowerCase() : 'Metric';
  }

  function getVerdictTone(verdict) {
    const v = String(verdict || '').trim().toUpperCase();
    if (v.includes('AVOID')) return 'avoid';
    if (v.includes('BUY')) return 'buy';
    if (v.includes('OVERVALUED')) return 'overvalued';
    if (v.includes('WATCH')) return 'watch';
    if (v.includes('HOLD')) return 'hold';
    return 'neutral';
  }

  function cleanHeadingText(text) {
    return String(text || '')
      .replace(/^#{1,6}\s*/, '')
      .trim();
  }

  function parseConfidenceChips(confidenceText) {
    const chips = [];
    const source = String(confidenceText || '').trim();
    if (!source) return chips;

    source.split('/').forEach(function eachSegment(segment) {
      const part = String(segment || '').trim();
      if (!part) return;
      const idx = part.indexOf(':');
      if (idx <= 0) return;
      const rawLabel = part.slice(0, idx).trim();
      const rawValue = part.slice(idx + 1).trim();
      const level = rawValue.toUpperCase();
      chips.push({
        label: titleCaseLabel(rawLabel),
        value: rawValue,
        tone: level === 'HIGH' ? 'high' : (level === 'MEDIUM' ? 'medium' : (level === 'LOW' ? 'low' : 'neutral'))
      });
    });

    return chips;
  }

  function splitSections(text) {
    const sections = [];
    const lines = String(text || '').split(/\r?\n/);
    let currentTitle = '';
    let bucket = [];

    function pushCurrent() {
      const content = bucket.join('\n').trim();
      if (currentTitle && content) {
        sections.push({ title: currentTitle, body: content });
      }
      bucket = [];
    }

    for (let i = 0; i < lines.length; i += 1) {
      const line = String(lines[i] || '');
      const trimmed = line.trim();

      if (!trimmed || isNoiseSeparator(trimmed)) {
        if (currentTitle) {
          bucket.push('');
        }
        continue;
      }

      if (/^#{1,6}\s*/.test(trimmed)) {
        pushCurrent();
        const headingText = cleanHeadingText(trimmed);
        let inlineBody = '';

        const upperInline = headingText.match(/^([A-Z0-9+&()\/\-—:\s]{4,}?)(\s+)([A-Z][a-z][^\n]*\s+[a-z].*)$/);
        if (upperInline) {
          currentTitle = String(upperInline[1] || '').trim();
          inlineBody = String(upperInline[3] || '').trim();
        } else {
          const subsectionInline = headingText.match(/^(\([a-z]\)\s+[A-Za-z][A-Za-z\s]{2,60})(\s+)([A-Z][a-z][^\n]*\s+[a-z].*)$/i);
          if (subsectionInline) {
            currentTitle = String(subsectionInline[1] || '').trim();
            inlineBody = String(subsectionInline[3] || '').trim();
          } else {
            currentTitle = headingText;
          }
        }

        if (inlineBody) {
          bucket.push(inlineBody);
        }
        continue;
      }

      if (isLikelyUppercaseHeading(trimmed)) {
        pushCurrent();
        currentTitle = trimmed;
        continue;
      }

      if (!currentTitle) {
        continue;
      }

      if (/^VERDICT=/.test(trimmed) || /^VERDICT:/i.test(trimmed)) {
        continue;
      }

      bucket.push(trimmed);
    }

    pushCurrent();
    return sections;
  }

  function formatInlineMarkup(text) {
    let html = escapeHtml(text);
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\[(LIVE|CALC|DATA|EST|RISK)\]/g, '<span class="inline-tag">$1</span>');
    return html;
  }

  function normalizeListSpacing(text) {
    let normalized = String(text || '').replace(/\r/g, '');
    normalized = normalized.replace(/([^\n])\s+(?=#{1,3}\s+)/g, '$1\n');
    normalized = normalized.replace(/^(##\s+[A-Z0-9+&()\/\-—:\s]{4,}?)(\s+)(?=[A-Z][a-z])/gm, '$1\n');

    normalized = normalized.replace(/:\s+(?=\d+\.\s+)/g, ':\n');
    normalized = normalized.replace(/:\s+(?=-\s+)/g, ':\n');
    normalized = normalized.replace(/([.?!])\s+(?=-\s+\*\*|-\s+[A-Za-z0-9]|\d+\.\s+)/g, '$1\n');

    normalized = normalized.replace(/(\d+\.\s+[^\n]+?)(?=\s+\d+\.\s+)/g, '$1\n');
    normalized = normalized.replace(/(-\s+[^\n]+?)(?=\s+-\s+)/g, '$1\n');

    normalized = normalized.replace(/(###\s+\([a-z]\)\s+[A-Za-z][A-Za-z\s]{2,45})(\s+)(?=[A-Z][a-z][^\n]*\s+[a-z])/gi, '$1\n');
    normalized = normalized.replace(/(\*\*[^*]{2,80}\*\*:)\s+(?=[^\n])/g, '$1\n');
    normalized = normalized.replace(/^\s*[!#=_*\u2500\u2550]{6,}\s*$/gm, '');
    normalized = normalized.replace(/^\s*!+\s*/gm, '');

    normalized = normalized.replace(/\n{3,}/g, '\n\n');
    return normalized.trim();
  }

  function renderBodyRich(body) {
    const lines = normalizeListSpacing(body).split(/\r?\n/);
    const html = [];
    let paragraphLines = [];
    let listType = '';
    let listItems = [];

    function flushParagraph() {
      if (!paragraphLines.length) return;
      const merged = paragraphLines.join(' ');
      html.push(`<p>${formatInlineMarkup(merged)}</p>`);
      paragraphLines = [];
    }

    function flushList() {
      if (!listItems.length || !listType) return;
      const tag = listType;
      html.push(`<${tag}>${listItems.map(function item(line) {
        return `<li>${formatInlineMarkup(line)}</li>`;
      }).join('')}</${tag}>`);
      listItems = [];
      listType = '';
    }

    function openList(type) {
      if (listType === type) return;
      flushList();
      listType = type;
    }

    for (let i = 0; i < lines.length; i += 1) {
      const rawLine = String(lines[i] || '');
      const line = rawLine.trim();
      if (!line) {
        flushParagraph();
        if (listType) {
          let j = i + 1;
          while (j < lines.length && !String(lines[j] || '').trim()) {
            j += 1;
          }
          const nextLine = j < lines.length ? String(lines[j] || '').trim() : '';
          const continuesOrdered = listType === 'ol' && /^\d+\.\s+/.test(nextLine);
          const continuesUnordered = listType === 'ul' && /^[-*]\s+/.test(nextLine);
          if (continuesOrdered || continuesUnordered) {
            continue;
          }
        }
        flushList();
        continue;
      }

      if (isNoiseSeparator(line)) {
        flushParagraph();
        flushList();
        continue;
      }

      if (/^#{1,6}\s*/.test(line)) {
        flushParagraph();
        flushList();
        html.push(`<h4>${formatInlineMarkup(cleanHeadingText(line))}</h4>`);
        continue;
      }

      if (/^\d+\.\s+/.test(line)) {
        flushParagraph();
        openList('ol');
        listItems.push(line.replace(/^\d+\.\s+/, '').trim());
        continue;
      }

      if (/^[-*]\s+/.test(line)) {
        flushParagraph();
        openList('ul');
        listItems.push(line.replace(/^[-*]\s+/, '').trim());
        continue;
      }

      if (listType && listItems.length) {
        const isIndentedContinuation = /^\s{2,}\S/.test(rawLine);
        if (isIndentedContinuation) {
          const last = listItems.length - 1;
          listItems[last] = `${listItems[last]} ${line}`.trim();
          continue;
        }
      }

      if (isLikelyUppercaseHeading(line)) {
        flushParagraph();
        flushList();
        html.push(`<h4>${formatInlineMarkup(line)}</h4>`);
        continue;
      }

      if (/hard stop|analysis aborted|suppressed/i.test(line)) {
        flushParagraph();
        flushList();
        html.push(`<h4>${formatInlineMarkup(line)}</h4>`);
        continue;
      }

      if (/^VERDICT:/i.test(line)) {
        continue;
      }

      if (listType) {
        flushList();
      }
      paragraphLines.push(line.replace(/^#{1,6}\s*/, '').trim());
    }

    flushParagraph();
    flushList();
    return html.join('');
  }

  function renderDecisionSnapshotCard(verdict) {
    const rows = [
      { key: 'VERDICT', value: verdict.verdict || 'N/A' },
      { key: 'BUY BELOW', value: verdict.buyBelow || 'N/A' },
      { key: 'FAIR VALUE (BEAR/BASE/BULL)', value: verdict.fairValue || 'N/A' },
      { key: verdict.premiumOrMosLabel || 'PREMIUM/MOS', value: verdict.premiumOrMosValue || 'N/A' },
      { key: 'CONFIDENCE', value: verdict.confidence || 'N/A' },
      { key: 'DATE', value: verdict.date || 'N/A' }
    ];

    return `<article class="section-card decision-snapshot-card"><h3>Verdict Snapshot</h3><div class="snapshot-kv-grid">${rows.map(function mapRow(row) {
      return `<div class="snapshot-kv"><span class="snapshot-k">${escapeHtml(row.key)}</span><span class="snapshot-v">${escapeHtml(row.value)}</span></div>`;
    }).join('')}</div></article>`;
  }

  function renderAnalysis(text, meta) {
    const plainText = stripAnsi(text);
    const verdict = parseVerdictSummary(plainText);
    const normalizedText = normalizeListSpacing(normalizeStructuralText(plainText));
    const sections = splitSections(normalizedText);

    reportShell.classList.add('visible');
    rawOutput.textContent = plainText;
    rawCommand.textContent = `$ /stock ${String(meta.symbol || '--').toUpperCase()}`;

    if (verdict) {
      const tone = getVerdictTone(verdict.verdict);
      const confidenceChips = parseConfidenceChips(verdict.confidence);
      const confidenceHtml = confidenceChips.length
        ? confidenceChips.map(function renderChip(chip) {
          return `<span class="confidence-chip level-${escapeHtml(chip.tone)}"><span>${escapeHtml(chip.label)}</span><strong>${escapeHtml(chip.value)}</strong></span>`;
        }).join('')
        : `<span class="confidence-chip">${escapeHtml(verdict.confidence)}</span>`;

      reportSummary.innerHTML = `
        <article class="decision-hub tone-${escapeHtml(tone)}">
          <div class="decision-top">
            <div>
              <p class="decision-kicker">Investment Verdict</p>
              <h3 class="decision-symbol">${escapeHtml(meta.symbol || 'N/A')}</h3>
            </div>
            <span class="verdict-pill verdict-${escapeHtml(tone)}">${escapeHtml(verdict.verdict)}</span>
          </div>
          <div class="decision-metric-grid">
            <article class="decision-metric"><span class="label">Buy Below</span><span class="value">${escapeHtml(verdict.buyBelow)}</span></article>
            <article class="decision-metric"><span class="label">Fair Value (Bear/Base/Bull)</span><span class="value">${escapeHtml(verdict.fairValue)}</span></article>
            <article class="decision-metric"><span class="label">${escapeHtml(verdict.premiumOrMosLabel)}</span><span class="value">${escapeHtml(verdict.premiumOrMosValue)}</span></article>
            <article class="decision-metric"><span class="label">Report Date</span><span class="value">${escapeHtml(verdict.date)}</span></article>
          </div>
          <div class="confidence-wrap">
            <p class="title">Confidence Breakdown</p>
            <div class="confidence-grid">${confidenceHtml}</div>
          </div>
        </article>
      `;
    } else {
      reportSummary.innerHTML = `<article class="decision-hub tone-neutral"><div class="decision-top"><div><p class="decision-kicker">Investment Verdict</p><h3 class="decision-symbol">${escapeHtml(meta.symbol || 'N/A')}</h3></div><span class="verdict-pill verdict-neutral">Unavailable</span></div></article>`;
    }

    const renderedSections = sections.map(function section(entry) {
      const combined = `${entry.title}\n${entry.body}`.toLowerCase();
      const isHardStop = /hard stop|analysis aborted|structural halt/.test(combined);
      const cardClass = isHardStop ? 'section-card hard-stop' : 'section-card';
      return `<article class="${cardClass}"><h3>${escapeHtml(cleanHeadingText(entry.title))}</h3>${renderBodyRich(entry.body)}</article>`;
    }).join('');

    const decisionSection = verdict ? renderDecisionSnapshotCard(verdict) : '';

    reportSections.innerHTML = `${decisionSection}${renderedSections}`;

    if (!sections.length) {
      reportSections.innerHTML = `${decisionSection}<article class="section-card"><h3>Analysis</h3><p>Structured sections were not detected. Use raw output for full details.</p></article>`;
    }
  }

  async function loadSnapshot(symbol) {
    const url = `${buildApiUrl('/api/stedrokgpt-quote-snapshot')}?symbol=${encodeURIComponent(symbol)}`;
    const headers = {};
    if (activeAccessToken) {
      headers.Authorization = `Bearer ${activeAccessToken}`;
    }
    return fetchJson(url, { method: 'GET', headers }, 15000);
  }

  function sleep(ms) {
    return new Promise(function resolveSleep(resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function loadDeepAnalysis(symbol) {
    const endpoint = buildApiUrl('/api/stedrokgpt-cli-stock');
    const payload = { symbol };

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (activeAccessToken) {
          headers.Authorization = `Bearer ${activeAccessToken}`;
        }
        return await fetchJson(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        }, 220000);
      } catch (error) {
        if (error && error.status === 429 && attempt < 3) {
          setStatus('Analysis engine is busy. Retrying...', 'info');
          await sleep(1600 * attempt);
          continue;
        }
        throw error;
      }
    }

    throw new Error('Deep analysis request failed after retries.');
  }

  function normalizeSymbol(rawValue) {
    const symbol = String(rawValue || '').trim().toUpperCase();
    if (!SYMBOL_RE.test(symbol)) {
      return null;
    }
    return symbol;
  }

  form.addEventListener('submit', async function onSubmit(event) {
    event.preventDefault();
    if (!hasPaidAccess) {
      setStatus('Upgrade to Pro to run StedrokGPT Research Lab.', 'error');
      return;
    }
    const symbol = normalizeSymbol(tickerInput.value);

    if (!symbol) {
      setStatus('Invalid ticker format. Example: AAPL', 'error');
      return;
    }

    tickerInput.value = symbol;
    analyzeButton.disabled = true;
    analyzeButton.textContent = 'Running...';
    resetUi();

    try {
      setStage(stageFast, 'loading');
      setStatus(`Stage 1: loading live snapshot for ${symbol}...`, 'info');
      const snap = await loadSnapshot(symbol);
      renderSnapshot(snap.snapshot || {});
      setStage(stageFast, 'done');

      setStage(stageDeep, 'loading');
      setStatus('Stage 2: building deep report...', 'info');
      const deep = await loadDeepAnalysis(symbol);
      const output = String(deep.output || '').trim();
      if (!output) {
        throw new Error('No deep analysis output returned.');
      }

      renderAnalysis(output, {
        symbol,
        cached: Boolean(deep.cached)
      });

      setStage(stageDeep, 'done');
      const cacheNote = deep.cached ? ' (cached)' : '';
      setStatus(`Deep analysis ready for ${symbol}${cacheNote}.`, 'info');
    } catch (error) {
      setStage(stageDeep, 'error');
      if (!stageFast.classList.contains('done')) {
        setStage(stageFast, 'error');
      }
      setStatus(normalizeApiErrorMessage(error), 'error');
    } finally {
      analyzeButton.disabled = !hasPaidAccess;
      analyzeButton.textContent = 'Analyze';
    }
  });

  resetUi();
  setFormEnabled(false);
  enforcePaidAccess();
})();
