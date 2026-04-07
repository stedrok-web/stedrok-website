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

  if (!form || !tickerInput || !analyzeButton || !uiStatus || !stageFast || !stageDeep || !snapshotMeta || !snapshotCards || !reportShell || !reportSummary || !reportSections || !rawOutput) {
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
      premiumOrMosLabel: kv.PREM_TO_FV ? 'Premium to FV' : (kv.MOS ? 'MOS' : 'Premium/MOS'),
      premiumOrMosValue: kv.PREM_TO_FV || kv.MOS || 'N/A',
      confidence: kv.CONFIDENCE || 'N/A',
      date: kv.DATE || 'N/A',
      rawLine: verdictLine.trim()
    };
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
      const line = lines[i];
      if (/^##\s+/.test(line)) {
        pushCurrent();
        currentTitle = line.replace(/^##\s+/, '').trim();
        continue;
      }
      if (!currentTitle) {
        continue;
      }
      if (/^VERDICT=/.test(line)) {
        continue;
      }
      bucket.push(line);
    }

    pushCurrent();
    return sections;
  }

  function renderBodyRich(body) {
    const blocks = body.split(/\n{2,}/).map(function tidy(block) {
      return block.trim();
    }).filter(Boolean);

    return blocks.map(function renderBlock(block) {
      const lines = block.split(/\n/).map(function clean(line) { return line.trim(); }).filter(Boolean);
      if (lines.length > 1 && lines.every(function everyOrdered(line) { return /^\d+\.\s+/.test(line); })) {
        return `<ol>${lines.map(function listItem(line) {
          return `<li>${escapeHtml(line.replace(/^\d+\.\s+/, ''))}</li>`;
        }).join('')}</ol>`;
      }
      if (lines.length > 1 && lines.every(function everyBulleted(line) { return /^[-*]\s+/.test(line); })) {
        return `<ul>${lines.map(function bulletItem(line) {
          return `<li>${escapeHtml(line.replace(/^[-*]\s+/, ''))}</li>`;
        }).join('')}</ul>`;
      }

      return `<p>${escapeHtml(lines.join(' '))}</p>`;
    }).join('');
  }

  function renderAnalysis(text, meta) {
    const verdict = parseVerdictSummary(text);
    const sections = splitSections(text);

    reportShell.classList.add('visible');
    rawOutput.textContent = text;

    const summaryCards = [];
    summaryCards.push({ label: 'Symbol', value: meta.symbol || 'N/A' });
    if (verdict) {
      summaryCards.push({ label: 'Verdict', value: verdict.verdict });
      summaryCards.push({ label: 'Buy Below', value: verdict.buyBelow });
      summaryCards.push({ label: 'Fair Value (B/Bu)', value: verdict.fairValue });
      summaryCards.push({ label: verdict.premiumOrMosLabel, value: verdict.premiumOrMosValue });
      summaryCards.push({ label: 'Confidence', value: verdict.confidence });
      summaryCards.push({ label: 'Report Date', value: verdict.date });
    }
    summaryCards.push({ label: 'Runtime', value: `${meta.durationMs} ms` });
    summaryCards.push({ label: 'Source', value: meta.cached ? 'Cached' : 'Fresh' });

    reportSummary.innerHTML = summaryCards.map(function card(item) {
      return `<article class="summary-card"><span class="metric-label">${escapeHtml(item.label)}</span><span class="value">${escapeHtml(item.value)}</span></article>`;
    }).join('');

    const renderedSections = sections.map(function section(entry) {
      return `<article class="section-card"><h3>${escapeHtml(entry.title)}</h3>${renderBodyRich(entry.body)}</article>`;
    }).join('');

    const decisionSection = verdict
      ? `<article class="section-card"><h3>Decision Snapshot</h3><p>${escapeHtml(verdict.rawLine)}</p></article>`
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
        durationMs: Number(deep.duration_ms || 0),
        cached: Boolean(deep.cached)
      });

      setStage(stageDeep, 'done');
      const cacheNote = deep.cached ? ' (cached)' : '';
      setStatus(`Complete for ${symbol} in ${Number(deep.duration_ms || 0)} ms${cacheNote}.`, 'info');
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
