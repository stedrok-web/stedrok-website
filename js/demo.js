// Public demo page logic (no login required)

const DEMO_DATA_URL = 'data/demo_sample.json?v=20260227c';
const DEMO_SUMMARIES_URL = 'data/demo_ticker_summaries.json?v=20260227c';
const DEMO_FEATURED_TICKER = 'MSFT';
const DEMO_FEATURED_TICKERS = new Set(['MSFT', 'ACN', 'EVO.ST']);
const DEMO_QUERY = new URLSearchParams(window.location.search);
const DEMO_SCREENSHOT_MODE = DEMO_QUERY.get('screenshot') === '1';
const DEMO_SCREENSHOT_SHOT = String(DEMO_QUERY.get('shot') || '').trim().toLowerCase();

let demoRows = [];
let summaryMap = new Map();
let activeInsightTicker = '';
let lastTriggerEl = null;

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase();
}

function formatPct(value) {
  return `${toNumber(value).toFixed(1)}%`;
}

function formatPrice(value, currencySymbol = '$') {
  return `${currencySymbol}${toNumber(value).toFixed(2)}`;
}

function formatMarketCap(value, currencySymbol = '$') {
  const num = toNumber(value);
  const abs = Math.abs(num);
  if (abs >= 1e12) return `${currencySymbol}${(num / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${currencySymbol}${(num / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${currencySymbol}${(num / 1e6).toFixed(2)}M`;
  return `${currencySymbol}${num.toLocaleString()}`;
}

function decisionBadgeClass(decision) {
  const normalized = String(decision || '').toUpperCase();
  if (normalized === 'BUY') return 'badge-buy';
  if (normalized === 'AVOID') return 'badge-avoid';
  return 'badge-watch';
}

function formatDateTime(value) {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function normalizeForComparison(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeForLooseComparison(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}


function toIsoTimestampOrEmpty(value) {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString();
}

function formatNumericDataValue(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : '';
}

function updateDemoMachineReadableMetadata(meta, rows) {
  const asOf = String(meta?.demo_as_of_date || '').trim();
  const generatedIso = toIsoTimestampOrEmpty(meta?.generated_at_utc || '');
  const rowCount = Array.isArray(rows) ? rows.length : 0;

  const asOfMeta = document.getElementById('demoDataAsOfMeta');
  if (asOfMeta) {
    asOfMeta.setAttribute('content', asOf);
  }

  const generatedMeta = document.getElementById('demoDataGeneratedMeta');
  if (generatedMeta) {
    generatedMeta.setAttribute('content', generatedIso);
  }

  if (document.body) {
    if (asOf) {
      document.body.setAttribute('data-demo-as-of-date', asOf);
    } else {
      document.body.removeAttribute('data-demo-as-of-date');
    }

    if (generatedIso) {
      document.body.setAttribute('data-demo-generated-at-utc', generatedIso);
    } else {
      document.body.removeAttribute('data-demo-generated-at-utc');
    }
  }

  const datasetScript = document.getElementById('demoDatasetJsonLd');
  if (!datasetScript) return;

  try {
    const payload = JSON.parse(datasetScript.textContent || '{}');
    if (generatedIso) {
      payload.dateModified = generatedIso;
    } else {
      delete payload.dateModified;
    }

    if (asOf) {
      payload.temporalCoverage = `${asOf}/${asOf}`;
    }

    payload.additionalProperty = [
      {
        '@type': 'PropertyValue',
        name: 'demo_as_of_date',
        value: asOf || 'unknown'
      },
      {
        '@type': 'PropertyValue',
        name: 'row_count',
        value: rowCount
      },
      {
        '@type': 'PropertyValue',
        name: 'delay_policy',
        value: String(meta?.delay_policy || 'minimum 24 hours delayed')
      }
    ];

    datasetScript.textContent = JSON.stringify(payload, null, 2);
  } catch (error) {
    console.warn('Could not update demo dataset JSON-LD metadata:', error);
  }
}

function stripPrimaryNewsLine(text) {
  return String(text || '')
    .replace(/(^|\n)\s*Primary news line:\s*[^\n]*(\n|$)/gi, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanupInsightSummary(rawText, headlineText) {
  const stripped = stripPrimaryNewsLine(rawText);
  if (!stripped) return '';

  const headlineNorm = normalizeForComparison(headlineText);
  const headlineLooseNorm = normalizeForLooseComparison(headlineText);
  const paragraphs = stripped
    .split(/\n\s*\n+/)
    .map(value => value.trim())
    .filter(Boolean);

  const cleaned = [];
  for (let i = 0; i < paragraphs.length; i += 1) {
    const paragraph = paragraphs[i];
    const norm = normalizeForComparison(paragraph);
    const looseNorm = normalizeForLooseComparison(paragraph);
    if (!norm) continue;

    if (headlineNorm && norm === headlineNorm) {
      continue;
    }
    if (headlineLooseNorm && (looseNorm === headlineLooseNorm || looseNorm.startsWith(`${headlineLooseNorm} `))) {
      continue;
    }

    if (/currently\s+sits\s+in\s+a\s+\w+\s+view/i.test(paragraph) && i < 2) {
      continue;
    }

    if (/^evaluating\s+/i.test(paragraph) || /headline is older and should be treated as background context/i.test(paragraph)) {
      continue;
    }

    if (cleaned.length > 0) {
      const previousNorm = normalizeForComparison(cleaned[cleaned.length - 1]);
      if (previousNorm === norm) {
        continue;
      }
    }

    cleaned.push(paragraph);
  }

  if (cleaned.length === 0) {
    return stripped;
  }
  return cleaned.join('\n\n');
}

function rowByTicker(ticker) {
  const symbol = normalizeTicker(ticker);
  return demoRows.find((row) => normalizeTicker(row.symbol) === symbol) || null;
}

function summaryByTicker(ticker) {
  return summaryMap.get(normalizeTicker(ticker)) || null;
}

function getFeaturedTicker() {
  const preferred = demoRows.find((row) => normalizeTicker(row.symbol) === DEMO_FEATURED_TICKER);
  if (preferred) return DEMO_FEATURED_TICKER;

  const secondary = demoRows.find((row) => DEMO_FEATURED_TICKERS.has(normalizeTicker(row.symbol)));
  if (secondary) return normalizeTicker(secondary.symbol);

  return demoRows.length ? normalizeTicker(demoRows[0].symbol) : '';
}


function configureScreenshotMode(featuredTicker) {
  if (!DEMO_SCREENSHOT_MODE) return false;

  document.body.classList.add('demo-screenshot-mode');
  if (DEMO_SCREENSHOT_SHOT) {
    document.body.setAttribute('data-shot', DEMO_SCREENSHOT_SHOT);
  } else {
    document.body.removeAttribute('data-shot');
  }

  if (DEMO_SCREENSHOT_SHOT === 'insight' && featuredTicker) {
    showInsightForTicker(featuredTicker, null);
  } else {
    closeInsightPanel(true);
  }

  const anchorByShot = {
    table: 'demoTableShot',
    insight: 'demoInsightShot',
    pillars: 'demoPillarsShot'
  };
  const anchorId = anchorByShot[DEMO_SCREENSHOT_SHOT];
  if (anchorId) {
    document.getElementById(anchorId)?.scrollIntoView({ block: 'start' });
  }

  return true;
}

function buildFallbackSummary(row) {
  if (!row) return null;

  const decision = String(row.decision || 'WATCH').toUpperCase();
  return {
    symbol: row.symbol,
    company_name: row.companyName,
    decision,
    decision_display: decision,
    headline: `${row.companyName || row.symbol} remains in the delayed demo set based on current model context.`,
    summary_short:
      `Model context: Value ${formatPct(row.valueScore)}, Quality ${formatPct(row.qualityScore)}, ` +
      `Risk ${formatPct(row.riskScore)}, Dip ${formatPct(row.dipScore)}. ` +
      `Price ${formatPrice(row.price)} vs fair value ${formatPrice(row.estimatedValue)} ` +
      `implies ${formatPct(row.discountPct)} discount in this delayed sample.`,
    news_theme_display: 'Model-driven',
    news_tone_display: 'Neutral',
    news_freshness_display: 'Delayed demo',
    news_relevance_display: 'Illustrative only',
    news_guidance: 'Delayed demo fallback summary generated from sample row metrics.',
    updated_at_utc: ''
  };
}

function renderTable(rows) {
  const tbody = document.getElementById('demoTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  // Hide static fallback rows once real data loads
  document.querySelectorAll('.demo-fallback-row').forEach(r => r.style.display = 'none');

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    const badgeClass = decisionBadgeClass(row.decision);
    const discount = toNumber(row.discountPct);
    const symbol = normalizeTicker(row.symbol);
    const isFeatured = DEMO_FEATURED_TICKERS.has(symbol);
    const hasSummary = summaryMap.has(symbol);
    const canOpenInsight = isFeatured && hasSummary;
    const priceSymbol = String(row.currencySymbol || '$');

    tr.setAttribute('data-symbol', symbol);
    tr.classList.add(isFeatured ? 'demo-row-featured' : 'demo-row-blur');

    tr.innerHTML = `
      <td>
        <button
          type="button"
          class="ticker-insight-trigger${canOpenInsight ? '' : ' ticker-insight-trigger--locked'}"
          data-ticker="${row.symbol}"
          aria-label="View insight for ${row.symbol}"
          ${canOpenInsight ? '' : 'disabled aria-disabled="true" tabindex="-1" title="Quick insight is unavailable for this row in the public demo."'}
        >
          ${row.symbol}
        </button>
      </td>
      <td>${row.companyName || '-'}</td>
      <td>${row.country || '-'}</td>
      <td>${row.sector || '-'}</td>
      <td><span class="badge ${badgeClass}">${row.decision || 'WATCH'}</span></td>
      <td data-value="${formatNumericDataValue(row.confidence)}">${formatPct(row.confidence)}</td>
      <td data-value="${formatNumericDataValue(row.valueScore)}">${formatPct(row.valueScore)}</td>
      <td data-value="${formatNumericDataValue(row.qualityScore)}">${formatPct(row.qualityScore)}</td>
      <td data-value="${formatNumericDataValue(row.riskScore)}">${formatPct(row.riskScore)}</td>
      <td data-value="${formatNumericDataValue(row.dipScore)}">${formatPct(row.dipScore)}</td>
      <td data-value="${formatNumericDataValue(row.price)}">${formatPrice(row.price, priceSymbol)}</td>
      <td data-value="${formatNumericDataValue(row.estimatedValue)}">${formatPrice(row.estimatedValue, priceSymbol)}</td>
      <td class="${discount >= 0 ? 'positive' : 'negative'}" data-value="${formatNumericDataValue(discount)}">${formatPct(discount)}</td>
    `;

    tbody.appendChild(tr);
  });
}


function renderInsight(summary, row) {
  if (!summary && !row) return;

  const payload = summary;
  if (!payload) return;

  const symbol = payload.symbol || row?.symbol || '';
  const company = payload.company_name || row?.companyName || '';
  const decisionLabel = String(payload.decision_display || payload.decision || row?.decision || 'WATCH').trim() || 'WATCH';
  const decisionNormalized = decisionLabel.toUpperCase();

  setText('tickerInsightTitle', symbol || 'Ticker detail');
  setText('tickerInsightSubhead', company || 'Ticker detail');

  const decisionEl = document.getElementById('tickerInsightDecision');
  if (decisionEl) {
    decisionEl.textContent = decisionLabel;
    decisionEl.classList.remove('badge-buy', 'badge-watch', 'badge-avoid');
    decisionEl.classList.add(decisionBadgeClass(decisionNormalized));
  }

  setText('tickerInsightTheme', `Theme: ${payload.news_theme_display || payload.news_theme || 'model-driven'}`);
  setText('tickerInsightNewsTone', `Tone: ${payload.news_tone_display || payload.news_tone || 'neutral'}`);
  setText('tickerInsightNewsFreshness', `Freshness: ${payload.news_freshness_display || payload.news_freshness || 'delayed demo'}`);
  setText('tickerInsightNewsRelevance', `Relevance: ${payload.news_relevance_display || payload.news_relevance || 'illustrative only'}`);

  const headlineEl = document.getElementById('tickerInsightHeadline');
  if (headlineEl) {
    const headline = String(payload.headline || '').trim();
    headlineEl.textContent = headline;
    headlineEl.style.display = headline ? 'block' : 'none';
  }

  const rawText = payload.dashboard_story || payload.summary_short || payload.summary_300w || '';
  const summaryText = cleanupInsightSummary(rawText, headlineEl?.textContent || '');
  const summaryEl = document.getElementById('tickerInsightSummary');
  if (summaryEl) {
    summaryEl.textContent = summaryText;
    summaryEl.style.display = summaryEl.textContent ? 'block' : 'none';
  }

  const guidanceEl = document.getElementById('tickerInsightNewsGuidance');
  if (guidanceEl) {
    const guidanceText = stripPrimaryNewsLine(String(payload.news_guidance || '').trim());
    const summaryComparable = normalizeForComparison(summaryText);
    const guidanceComparable = normalizeForComparison(guidanceText);
    const shouldShowGuidance = Boolean(guidanceText) &&
      (!guidanceComparable || !summaryComparable.includes(guidanceComparable));

    guidanceEl.textContent = shouldShowGuidance
      ? guidanceText
      : 'This public demo uses delayed and limited rows.';
    guidanceEl.style.display = guidanceEl.textContent ? 'block' : 'none';
  }

  const newsHeadlineEl = document.getElementById('tickerInsightNewsHeadline');
  if (newsHeadlineEl) {
    // Keep demo output clean and avoid appending a duplicate trailing headline line.
    newsHeadlineEl.textContent = '';
    newsHeadlineEl.style.display = 'none';
  }

  const updatedEl = document.getElementById('tickerInsightUpdated');
  if (updatedEl) {
    const formatted = formatDateTime(payload.updated_at_utc || '');
    updatedEl.textContent = formatted ? `Updated: ${formatted}` : '';
    updatedEl.style.display = formatted ? 'block' : 'none';
  }
}

function openInsightPanel() {
  const panel = document.getElementById('tickerInsightPanel');
  if (!panel) return;
  panel.removeAttribute('hidden');
  panel.removeAttribute('inert');
  panel.classList.add('is-open');
  panel.setAttribute('aria-hidden', 'false');
  document.body.classList.add('ticker-insight-open');
}

function closeInsightPanel(reset = false) {
  const panel = document.getElementById('tickerInsightPanel');
  if (panel) {
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    panel.setAttribute('inert', '');
    panel.setAttribute('hidden', '');
  }
  document.body.classList.remove('ticker-insight-open');

  if (reset) {
    activeInsightTicker = '';
    if (lastTriggerEl && typeof lastTriggerEl.focus === 'function') {
      lastTriggerEl.focus({ preventScroll: true });
    }
    lastTriggerEl = null;
  }
}

function showInsightForTicker(ticker, triggerEl = null) {
  const symbol = normalizeTicker(ticker);
  if (!symbol) return;

  const row = rowByTicker(symbol);
  if (!row) return;

  if (!DEMO_FEATURED_TICKERS.has(symbol)) {
    const hintEl = document.getElementById('tickerInsightHint');
    if (hintEl) {
      hintEl.textContent = 'Quick Ticker Insight in this public demo is enabled for MSFT, ACN, and EVO.ST.';
      hintEl.style.display = 'block';
    }
    return;
  }

  const summary = summaryByTicker(symbol);
  if (!summary) {
    const hintEl = document.getElementById('tickerInsightHint');
    if (hintEl) {
      hintEl.textContent = 'Insight data is temporarily unavailable. Please refresh shortly.';
      hintEl.style.display = 'block';
    }
    return;
  }

  activeInsightTicker = symbol;
  lastTriggerEl = triggerEl || lastTriggerEl;

  renderInsight(summary, row);
  openInsightPanel();
}


function bindInsightInteractions() {
  const tbody = document.getElementById('demoTableBody');
  if (tbody) {
    tbody.addEventListener('click', (event) => {
      const trigger = event.target.closest('.ticker-insight-trigger');
      if (!trigger) return;
      const symbol = trigger.getAttribute('data-ticker') || '';
      showInsightForTicker(symbol, trigger);
    });
  }

  const panel = document.getElementById('tickerInsightPanel');
  panel?.addEventListener('click', (event) => {
    if (event.target === panel) {
      closeInsightPanel(true);
    }
  });

  document.getElementById('closeTickerInsightBtn')?.addEventListener('click', () => closeInsightPanel(true));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeInsightPanel(true);
    }
  });

  document.getElementById('openFirstInsightBtn')?.addEventListener('click', () => {
    const featured = getFeaturedTicker();
    if (featured) {
      showInsightForTicker(featured, null);
    }
  });
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url} (${res.status})`);
  }
  return res.json();
}

async function loadDemo() {
  const [demoPayload, summaryPayload] = await Promise.all([
    fetchJson(DEMO_DATA_URL),
    fetchJson(DEMO_SUMMARIES_URL)
  ]);

  const meta = demoPayload?.meta || {};
  const rows = Array.isArray(demoPayload?.rows) ? demoPayload.rows : [];
  const summaries = summaryPayload?.summaries_by_symbol || {};

  demoRows = rows;
  summaryMap = new Map(
    Object.entries(summaries).map(([symbol, summary]) => [normalizeTicker(symbol), summary])
  );

  if (!demoRows.length) {
    throw new Error('Demo rows are empty');
  }

  setText('demoAsOfDate', meta.demo_as_of_date || 'N/A');
  updateDemoMachineReadableMetadata(meta, demoRows);

  renderTable(demoRows);

  const loadingEl = document.getElementById('demoLoadingState');
  if (loadingEl) loadingEl.textContent = '';

  const featuredTicker = getFeaturedTicker();
  if (featuredTicker) {
    showInsightForTicker(featuredTicker, null);
  }

  const openInsightBtn = document.getElementById('openFirstInsightBtn');
  if (openInsightBtn) {
    openInsightBtn.textContent = featuredTicker === DEMO_FEATURED_TICKER
      ? `Open ${DEMO_FEATURED_TICKER} Insight`
      : 'Open Featured Insight';
  }

  if (!configureScreenshotMode(featuredTicker)) {
    const hash = String(window.location.hash || '');
    if (!hash.includes('demoInsightShot')) {
      closeInsightPanel(true);
    }
  }

  document.body.setAttribute('data-demo-ready', '1');
}


document.addEventListener('DOMContentLoaded', async () => {
  bindInsightInteractions();

  try {
    await loadDemo();
  } catch (error) {
    console.error('Demo load failed:', error);
    const loadingEl = document.getElementById('demoLoadingState');
    if (loadingEl) {
      loadingEl.textContent = 'The public demo is temporarily unavailable. Please refresh shortly.';
    }
    document.body.setAttribute('data-demo-ready', 'error');
  }
});
