// Public demo page logic (no login required)

const DEMO_DATA_URL = 'data/demo_sample.json?v=20260226a';

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function formatPct(value) {
  return `${toNumber(value).toFixed(1)}%`;
}

function formatPrice(value) {
  return `$${toNumber(value).toFixed(2)}`;
}

function formatMarketCap(value) {
  const num = toNumber(value);
  const abs = Math.abs(num);
  if (abs >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  return `$${num.toLocaleString()}`;
}

function decisionBadgeClass(decision) {
  const normalized = String(decision || '').toUpperCase();
  if (normalized === 'BUY') return 'badge-buy';
  if (normalized === 'AVOID') return 'badge-avoid';
  return 'badge-watch';
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function renderDemoTable(rows) {
  const tbody = document.getElementById('demoTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    const badgeClass = decisionBadgeClass(row.decision);
    const discount = toNumber(row.discountPct);

    tr.innerHTML = `
      <td><strong>${row.symbol || '-'}</strong></td>
      <td>${row.companyName || '-'}</td>
      <td>${row.country || '-'}</td>
      <td>${row.sector || '-'}</td>
      <td><span class="badge ${badgeClass}">${row.decision || 'WATCH'}</span></td>
      <td>${formatPct(row.confidence)}</td>
      <td>${formatPct(row.valueScore)}</td>
      <td>${formatPct(row.qualityScore)}</td>
      <td>${formatPct(row.riskScore)}</td>
      <td>${formatPct(row.dipScore)}</td>
      <td>${formatPrice(row.price)}</td>
      <td>${formatPrice(row.estimatedValue)}</td>
      <td class="${discount >= 0 ? 'positive' : 'negative'}">${formatPct(discount)}</td>
    `;

    tbody.appendChild(tr);
  });
}

function renderInsight(sample) {
  if (!sample) return;

  setText('demoInsightSymbol', sample.symbol || 'N/A');
  setText('demoInsightCompany', sample.companyName || 'Sample Company');

  const decisionEl = document.getElementById('demoInsightDecision');
  if (decisionEl) {
    decisionEl.textContent = sample.decision || 'WATCH';
    decisionEl.classList.remove('badge-buy', 'badge-watch', 'badge-avoid');
    decisionEl.classList.add(decisionBadgeClass(sample.decision));
  }

  setText(
    'demoInsightHeadline',
    `${sample.companyName || sample.symbol} remains in the delayed demo set due to a strong blend of valuation and balance-sheet resilience.`
  );

  setText(
    'demoInsightSummary',
    `Model context: Value ${formatPct(sample.valueScore)}, Quality ${formatPct(sample.qualityScore)}, ` +
      `Risk ${formatPct(sample.riskScore)}, Dip ${formatPct(sample.dipScore)}. ` +
      `Price ${formatPrice(sample.price)} versus estimated fair value ${formatPrice(sample.estimatedValue)} ` +
      `implies a ${formatPct(sample.discountPct)} discount in this delayed sample.`
  );

  setText('demoInsightTheme', 'Theme: value with resilience');
  setText('demoInsightTone', 'Tone: neutral');
  setText('demoInsightFreshness', 'Freshness: delayed demo');
  setText('demoInsightRelevance', 'Relevance: illustrative only');
}

async function loadDemoData() {
  const res = await fetch(DEMO_DATA_URL, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to load demo sample (${res.status})`);
  }
  return res.json();
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const payload = await loadDemoData();
    const meta = payload?.meta || {};
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];

    if (!rows.length) {
      throw new Error('Demo sample has no rows');
    }

    setText('demoAsOfDate', meta.demo_as_of_date || 'N/A');
    setText('demoRowCount', String(rows.length));
    setText('demoDelayPolicy', meta.delay_policy || 'minimum 24 hours delayed');

    renderDemoTable(rows);
    renderInsight(rows[0]);

    // Optional market-cap note in hero stats for credibility.
    const totalCap = rows.reduce((sum, row) => sum + toNumber(row.marketCap), 0);
    setText('demoTotalCap', formatMarketCap(totalCap));
  } catch (error) {
    console.error('Demo page failed to load data:', error);

    const loading = document.getElementById('demoLoadingState');
    if (loading) {
      loading.textContent = 'Demo data is temporarily unavailable. Please refresh shortly.';
    }
  }
});
