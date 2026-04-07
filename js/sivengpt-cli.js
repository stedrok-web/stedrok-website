(function initSivenGptReportLab() {
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

  if (!form || !tickerInput || !analyzeButton || !uiStatus || !stageFast || !stageDeep || !snapshotMeta || !snapshotCards || !reportShell || !reportSummary || !reportSections || !rawOutput || !rawCommand) {
    return;
  }

  const SYMBOL_RE = /^[A-Za-z][A-Za-z0-9.-]{0,9}$/;

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

      if (!trimmed || /^[-=]{5,}$/.test(trimmed)) {
        if (currentTitle) {
          bucket.push('');
        }
        continue;
      }

      if (/^#{1,6}\s*/.test(trimmed)) {
        pushCurrent();
        currentTitle = cleanHeadingText(trimmed);
        continue;
      }

      if (!currentTitle && /^[A-Z][A-Z\s&()\/-]{8,}$/.test(trimmed)) {
        pushCurrent();
        currentTitle = trimmed;
        continue;
      }

      if (!currentTitle) {
        continue;
      }

      if (/^VERDICT=/.test(trimmed)) {
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
    normalized = normalized.replace(/([^\n])\s+(?=[A-Z][A-Z\s&()\/-]{8,}\s*$)/gm, '$1\n');

    normalized = normalized.replace(/:\s+(?=\d+\.\s+)/g, ':\n');
    normalized = normalized.replace(/:\s+(?=-\s+)/g, ':\n');
    normalized = normalized.replace(/([.?!])\s+(?=-\s+\*\*|-\s+[A-Za-z0-9]|\d+\.\s+)/g, '$1\n');

    normalized = normalized.replace(/(\d+\.\s+[^\n]+?)(?=\s+\d+\.\s+)/g, '$1\n');
    normalized = normalized.replace(/(-\s+[^\n]+?)(?=\s+-\s+)/g, '$1\n');

    normalized = normalized.replace(/(###\s+\([a-z]\)\s+[A-Za-z][A-Za-z\s]{2,45})(\s+)(?=[A-Z][a-z])/gi, '$1\n');
    normalized = normalized.replace(/(\*\*[^*]{2,80}\*\*:)\s+(?=[^\n])/g, '$1\n');

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
      const line = String(lines[i] || '').trim();
      if (!line) {
        flushParagraph();
        flushList();
        continue;
      }

      if (/^[-=]{5,}$/.test(line) || /^[\u2500\u2550]{5,}$/.test(line)) {
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

      if (/^[A-Z][A-Z\s&()\/-]{8,}$/.test(line)) {
        flushParagraph();
        flushList();
        html.push(`<h4>${formatInlineMarkup(line)}</h4>`);
        continue;
      }

      paragraphLines.push(line.replace(/^#{1,6}\s*/, '').trim());
    }

    flushParagraph();
    flushList();
    return html.join('');
  }

  function renderAnalysis(text, meta) {
    const verdict = parseVerdictSummary(text);
    const normalizedText = normalizeListSpacing(text);
    const sections = splitSections(normalizedText);

    reportShell.classList.add('visible');
    rawOutput.textContent = text;
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
      return `<article class="section-card"><h3>${escapeHtml(cleanHeadingText(entry.title))}</h3>${renderBodyRich(entry.body)}</article>`;
    }).join('');

    const decisionSection = verdict
      ? `<article class="section-card"><h3>Decision Snapshot</h3><p class="decision-raw-line">${escapeHtml(verdict.rawLine)}</p></article>`
      : '';

    reportSections.innerHTML = `${decisionSection}${renderedSections}`;

    if (!sections.length) {
      reportSections.innerHTML = `${decisionSection}<article class="section-card"><h3>Analysis</h3><p>Structured sections were not detected. Use raw output for full details.</p></article>`;
    }
  }

  async function loadSnapshot(symbol) {
    const url = `${buildApiUrl('/api/sivengpt-quote-snapshot')}?symbol=${encodeURIComponent(symbol)}`;
    return fetchJson(url, { method: 'GET' }, 15000);
  }

  function sleep(ms) {
    return new Promise(function resolveSleep(resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function loadDeepAnalysis(symbol) {
    const endpoint = buildApiUrl('/api/sivengpt-cli-stock');
    const payload = { symbol };

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await fetchJson(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
      setStatus(error.message || 'Analysis failed.', 'error');
    } finally {
      analyzeButton.disabled = false;
      analyzeButton.textContent = 'Analyze';
    }
  });
})();
