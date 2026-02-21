// Dashboard - Updated for Option 1 Architecture
// Loads picks from Cloudflare Worker API instead of static JSON
// Updated: 2026-02-14

let currentUser = null;
let userProfile = null;
let allStocks = [];
let currentSortColumn = 'value_score';
let currentSortDirection = 'desc';
let selectedExchange = '';
let exchangePoints = [];
let globeView = null;
let globeResizeBound = false;
let globeResizeObserver = null;
let tickerSummaryCache = new Map();
let tickerSummaryInFlight = new Map();
let tickerInsightUiBound = false;
let activeInsightTicker = '';
let currentAccessToken = '';
let lastInsightTriggerEl = null;

// API URL from central config (js/config.js must be loaded before this file)
const API_URL = CONFIG.API_BASE_URL;

const EXCHANGE_COORDINATES = {
  'USA (NYSE/NASDAQ)': { lat: 40.757, lng: -73.985 }, // Nasdaq MarketSite (NYC)
  'Hong Kong': { lat: 22.285, lng: 114.158 }, // HKEX
  'London (UK)': { lat: 51.514, lng: -0.088 }, // London Stock Exchange
  'Australia (ASX)': { lat: -33.866, lng: 151.209 }, // ASX Sydney
  'Paris (France)': { lat: 48.868, lng: 2.347 }, // Euronext Paris
  'Amsterdam (Netherlands)': { lat: 52.372, lng: 4.893 }, // Euronext Amsterdam
  'Frankfurt (Germany)': { lat: 50.114, lng: 8.678 }, // Frankfurt Stock Exchange
  'Madrid (Spain)': { lat: 40.415, lng: -3.694 }, // Bolsa de Madrid
  'Copenhagen (Denmark)': { lat: 55.676, lng: 12.568 }, // Nasdaq Copenhagen
  'Oslo (Norway)': { lat: 59.913, lng: 10.739 }, // Oslo Bors
  'Milan (Italy)': { lat: 45.464, lng: 9.191 }, // Borsa Italiana
  'Stockholm (Sweden)': { lat: 59.334, lng: 18.066 }, // Nasdaq Stockholm
  'Brussels (Belgium)': { lat: 50.850, lng: 4.352 }, // Euronext Brussels
  'Helsinki (Finland)': { lat: 60.170, lng: 24.941 }, // Nasdaq Helsinki
  'SIX (Switzerland)': { lat: 47.376, lng: 8.541 }, // SIX Swiss Exchange
  'Lisbon (Portugal)': { lat: 38.722, lng: -9.139 }, // Euronext Lisbon
  'Vienna (Austria)': { lat: 48.208, lng: 16.373 }, // Wiener Borse
  'Warsaw (Poland)': { lat: 52.229, lng: 21.012 }, // Warsaw Stock Exchange
  'Athens (Greece)': { lat: 37.983, lng: 23.727 }, // Athens Exchange
  'Abu Dhabi (UAE)': { lat: 24.453, lng: 54.377 }, // ADX
  'Singapore': { lat: 1.290, lng: 103.851 }, // SGX
  'Toronto (Canada)': { lat: 43.653, lng: -79.383 }, // TSX
  'Tokyo (Japan)': { lat: 35.676, lng: 139.650 }, // JPX
  'Prague (Czech Republic)': { lat: 50.076, lng: 14.427 } // Prague Stock Exchange
};

const COUNTRY_COORDINATES = {
  'United States': { lat: 39.828, lng: -98.579 },
  'China': { lat: 35.861, lng: 104.195 },
  'United Kingdom': { lat: 55.378, lng: -3.436 },
  'Canada': { lat: 56.130, lng: -106.346 },
  'France': { lat: 46.227, lng: 2.213 },
  'Singapore': { lat: 1.352, lng: 103.820 },
  'Australia': { lat: -25.274, lng: 133.775 },
  'Germany': { lat: 51.165, lng: 10.451 },
  'Ireland': { lat: 53.412, lng: -8.243 },
  'Denmark': { lat: 56.263, lng: 9.502 },
  'Spain': { lat: 40.464, lng: -3.749 },
  'Norway': { lat: 60.472, lng: 8.468 },
  'Netherlands': { lat: 52.132, lng: 5.291 },
  'Switzerland': { lat: 46.818, lng: 8.227 },
  'Japan': { lat: 36.205, lng: 138.252 }
};

const EXCHANGE_COORDINATE_RULES = [
  { regex: /(nyse|nasdaq|usa)/i, key: 'USA (NYSE/NASDAQ)' },
  { regex: /hong\s*kong/i, key: 'Hong Kong' },
  { regex: /(frankfurt|xetra)/i, key: 'Frankfurt (Germany)' },
  { regex: /(copenhagen|nasdaq\s*copenhagen)/i, key: 'Copenhagen (Denmark)' },
  { regex: /(stockholm|nasdaq\s*stockholm)/i, key: 'Stockholm (Sweden)' },
  { regex: /(amsterdam|euronext\s*amsterdam)/i, key: 'Amsterdam (Netherlands)' },
  { regex: /(paris|euronext\s*paris)/i, key: 'Paris (France)' },
  { regex: /(madrid|bolsa\s*de\s*madrid)/i, key: 'Madrid (Spain)' },
  { regex: /(oslo|bors)/i, key: 'Oslo (Norway)' },
  { regex: /(london|lse)/i, key: 'London (UK)' }
];

// Derived from the 2026-02-21 scored CSV universe where exchange can be blank.
const EXCHANGE_FROM_SUFFIX = {
  AX: 'Australia (ASX)',
  L: 'London (UK)',
  HK: 'Hong Kong',
  OL: 'Oslo (Norway)',
  DE: 'Frankfurt (Germany)',
  PA: 'Paris (France)',
  MI: 'Milan (Italy)',
  ST: 'Stockholm (Sweden)',
  MC: 'Madrid (Spain)',
  AE: 'Abu Dhabi (UAE)',
  BR: 'Brussels (Belgium)',
  HE: 'Helsinki (Finland)',
  CO: 'Copenhagen (Denmark)',
  AS: 'Amsterdam (Netherlands)',
  SW: 'SIX (Switzerland)',
  LS: 'Lisbon (Portugal)',
  VI: 'Vienna (Austria)',
  WA: 'Warsaw (Poland)',
  AT: 'Athens (Greece)',
  TO: 'Toronto (Canada)',
  T: 'Tokyo (Japan)',
  PR: 'Prague (Czech Republic)'
};

const EXCHANGE_DEFAULT_BY_COUNTRY = {
  'United States': 'USA (NYSE/NASDAQ)',
  'Australia': 'Australia (ASX)',
  'United Kingdom': 'London (UK)',
  'China': 'Hong Kong',
  'Canada': 'Toronto (Canada)',
  'Germany': 'Frankfurt (Germany)',
  'France': 'Paris (France)',
  'Norway': 'Oslo (Norway)',
  'Italy': 'Milan (Italy)',
  'Netherlands': 'Amsterdam (Netherlands)',
  'Switzerland': 'SIX (Switzerland)',
  'Spain': 'Madrid (Spain)',
  'Israel': 'USA (NYSE/NASDAQ)',
  'Sweden': 'Stockholm (Sweden)',
  'Ireland': 'London (UK)',
  'United Arab Emirates': 'Abu Dhabi (UAE)',
  'Hong Kong': 'Hong Kong',
  'Denmark': 'Copenhagen (Denmark)',
  'Belgium': 'Brussels (Belgium)',
  'Finland': 'Helsinki (Finland)',
  'Brazil': 'USA (NYSE/NASDAQ)',
  'Luxembourg': 'Paris (France)',
  'Singapore': 'Singapore',
  'New Zealand': 'Australia (ASX)',
  'Greece': 'Athens (Greece)',
  'Japan': 'Tokyo (Japan)',
  'Mexico': 'USA (NYSE/NASDAQ)',
  'Argentina': 'USA (NYSE/NASDAQ)',
  'Portugal': 'Lisbon (Portugal)',
  'South Africa': 'London (UK)',
  'Austria': 'Vienna (Austria)',
  'India': 'USA (NYSE/NASDAQ)',
  'Taiwan': 'USA (NYSE/NASDAQ)',
  'Poland': 'Warsaw (Poland)',
  'South Korea': 'USA (NYSE/NASDAQ)',
  'Chile': 'USA (NYSE/NASDAQ)',
  'Jersey': 'London (UK)',
  'Bermuda': 'USA (NYSE/NASDAQ)',
  'Cayman Islands': 'USA (NYSE/NASDAQ)'
};

document.addEventListener('DOMContentLoaded', async () => {
  // Use the shared Supabase client initialized in js/config.js
  const client = window.supabaseClient;
  if (!client || !client.auth) {
    console.error('Supabase client not initialized or auth unavailable.');
    window.location.href = 'login.html';
    return;
  }

  // Compatibility helper: supabase-js has changed APIs across versions.
  // Try multiple methods to obtain the current session.
  async function fetchSessionCompat() {
    try {
      if (client.auth && typeof client.auth.getSession === 'function') {
        const res = await client.auth.getSession();
        return (res && res.data && res.data.session) ? res.data.session : res.session || null;
      }
      if (client.auth && typeof client.auth.session === 'function') {
        // older builds may return a session object directly
        const res = await client.auth.session();
        return (res && res.data && res.data.session) ? res.data.session : res.session || res || null;
      }
      if (client.auth && typeof client.auth.getUser === 'function') {
        const res = await client.auth.getUser();
        return (res && res.data && res.data.user) ? { user: res.data.user } : null;
      }
    } catch (e) {
      console.warn('fetchSessionCompat error:', e);
    }
    return null;
  }

  // Check authentication
  const session = await fetchSessionCompat();

  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  currentUser = session.user;
  const userToken = session.access_token;
  setupTickerInsightUI(userToken);

  // Show loading state
  showLoading(true);

  try {
    // Call Worker API to get picks (automatically filtered by subscription status)
    const response = await fetch(`${API_URL}/api/picks`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();
    
    // Extract data from response
    allStocks = data.picks || [];
    userProfile = data.user;
    const meta = data.meta;

    // Show appropriate UI based on subscription status
    const isFreeUser = userProfile.subscription_status === 'free';
    setTickerInsightAvailability(!isFreeUser);
    
    if (isFreeUser) {
      showFreeUserBanner(meta.count);
    } else {
      showPaidUserStatus(userProfile.paid_until, meta.count);
    }

    // Build exchange globe filter from current picks.
    setupExchangeGlobe(allStocks);

    // Render table
    renderTable(allStocks);
    
    // Update last updated timestamp
    document.getElementById('lastUpdated').textContent = 
      formatDate(meta.last_updated);

  } catch (error) {
    console.error('Failed to load picks:', error);
    setTickerInsightAvailability(false);
    showError('Failed to load stock picks. Please refresh the page.');
  } finally {
    showLoading(false);
  }

  // Setup event listeners
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
      if (!client || !client.auth || typeof client.auth.signOut !== 'function') {
        throw new Error('Supabase client not initialized or signOut unavailable');
      }
      await client.auth.signOut();
    } catch (e) {
      console.error('Logout failed:', e);
    }
    window.location.href = 'index.html';
  });

  document.getElementById('upgradeNowBtn')?.addEventListener('click', () => {
    window.location.href = 'pricing.html';
  });

  document.getElementById('exportCsvBtn')?.addEventListener('click', exportToCSV);

  // Setup filters and sorting
  setupFilters();
  setupSorting();
});

// ============================================================
// UI: Show loading state
// ============================================================
function showLoading(isLoading) {
  const loadingEl = document.getElementById('loadingState');
  const tableEl = document.getElementById('stocksTable');
  
  if (loadingEl) {
    loadingEl.style.display = isLoading ? 'block' : 'none';
  }
  if (tableEl) {
    tableEl.style.opacity = isLoading ? '0.5' : '1';
  }
}

// ============================================================
// UI: Show banner for free users
// ============================================================
function showFreeUserBanner(count) {
  const gate = document.getElementById('subscriptionGate');
  if (gate) {
    gate.style.display = 'block';
    gate.innerHTML = `
      <div style="background: rgba(102,126,234,0.1); border: 1px solid rgba(102,126,234,0.3);
                  color: var(--text-primary); padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h3 style="margin: 0 0 10px 0; color: var(--text-primary);">Free Tier Access</h3>
        <p style="margin: 0 0 15px 0; color: var(--text-secondary);">
          You're viewing a random sample of <strong>${count} stocks</strong> from the full research universe. 
          Pro membership provides access to 100+ ranked opportunities with full fundamental metrics, updated daily.
        </p>
        <a href="pricing.html" class="btn-primary" 
           style="display: inline-block; padding: 12px 24px; border-radius: 6px; text-decoration: none;">
          View Pricing
        </a>
      </div>
    `;
  }

  // Hide export button for free users
  const exportBtn = document.getElementById('exportCsvBtn');
  if (exportBtn) {
    exportBtn.style.display = 'none';
  }
}

// ============================================================
// UI: Show status for paid users
// ============================================================
function showPaidUserStatus(paidUntil, count) {
  const gate = document.getElementById('subscriptionGate');
  if (gate && paidUntil) {
    const expiryDate = new Date(paidUntil);
    const daysLeft = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
    
    gate.style.display = 'block';
    gate.innerHTML = `
      <div style="background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); 
                  color: var(--text-primary); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        <strong>Pro Membership Active</strong> - Full research universe (${count} stocks) | 
        Subscription renews in ${daysLeft} days
      </div>
    `;
  }
}

// ============================================================
// UI: Show error message
// ============================================================
function showError(message) {
  const gate = document.getElementById('subscriptionGate');
  if (gate) {
    gate.style.display = 'block';
    gate.innerHTML = `
      <div style="background: #ef4444; color: white; padding: 15px; border-radius: 8px;">
        ⚠️ ${message}
      </div>
    `;
  }
}

function normalizeTickerKey(value) {
  return String(value || '').trim().toUpperCase();
}

function decisionClassFromValue(decision) {
  const normalized = String(decision || '').toUpperCase();
  if (normalized === 'BUY') return 'badge-buy';
  if (normalized === 'AVOID') return 'badge-avoid';
  return 'badge-watch';
}

function formatDateTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function setTickerInsightAvailability(isPaidUser) {
  const hint = document.getElementById('tickerInsightHint');
  if (hint) {
    hint.style.display = isPaidUser ? 'block' : 'none';
  }

  if (!isPaidUser) {
    hideTickerInsight(true);
  }
}

function enforceTickerInsightModalLayout() {
  const panel = document.getElementById('tickerInsightPanel');
  const card = panel?.querySelector('.ticker-insight-card');
  if (!panel || !card) return;

  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  const isOpen = panel.classList.contains('is-open');

  panel.style.position = 'fixed';
  panel.style.inset = '0';
  panel.style.zIndex = '1400';
  panel.style.display = 'flex';
  panel.style.alignItems = isMobile ? 'flex-end' : 'center';
  panel.style.justifyContent = 'center';
  panel.style.padding = isMobile ? '10px' : '18px';
  panel.style.margin = '0';
  panel.style.background = 'radial-gradient(110% 120% at 50% 0%, rgba(34, 197, 94, 0.16) 0%, rgba(2, 6, 23, 0.88) 55%), rgba(2, 6, 23, 0.78)';
  panel.style.backdropFilter = 'blur(10px)';
  panel.style.webkitBackdropFilter = 'blur(10px)';
  panel.style.transition = 'opacity 0.2s ease';
  panel.style.opacity = isOpen ? '1' : '0';
  panel.style.pointerEvents = isOpen ? 'auto' : 'none';

  card.style.width = isMobile ? '100%' : 'min(780px, calc(100vw - 36px))';
  card.style.maxHeight = isMobile ? 'calc(100vh - 20px)' : 'calc(100vh - 44px)';
  card.style.overflowY = 'auto';
  card.style.borderRadius = isMobile ? '14px 14px 12px 12px' : '16px';
}

function setupTickerInsightUI(accessToken) {
  currentAccessToken = accessToken || currentAccessToken;

  if (tickerInsightUiBound) return;
  tickerInsightUiBound = true;

  enforceTickerInsightModalLayout();
  window.addEventListener('resize', enforceTickerInsightModalLayout, { passive: true });
  window.addEventListener('orientationchange', enforceTickerInsightModalLayout, { passive: true });

  const panel = document.getElementById('tickerInsightPanel');
  panel?.addEventListener('click', event => {
    if (event.target === panel) {
      hideTickerInsight(true);
    }
  });

  const closeBtn = document.getElementById('closeTickerInsightBtn');
  closeBtn?.addEventListener('click', () => hideTickerInsight(true));

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      hideTickerInsight(true);
    }
  });

  const tbody = document.getElementById('stocksTableBody');
  tbody?.addEventListener('click', event => {
    const trigger = event.target.closest('.ticker-insight-trigger');
    if (!trigger) return;

    if (!userProfile || userProfile.subscription_status === 'free') {
      return;
    }

    const ticker = trigger.dataset.ticker || '';
    if (ticker) {
      showTickerInsight(ticker, trigger);
    }
  });
}

function syncActiveInsightRow() {
  const tbody = document.getElementById('stocksTableBody');
  if (!tbody) return;

  const normalizedActiveTicker = normalizeTickerKey(activeInsightTicker);
  tbody.querySelectorAll('tr').forEach(row => row.classList.remove('row-insight-active'));
  if (!normalizedActiveTicker) return;

  tbody.querySelectorAll('.ticker-insight-trigger').forEach(button => {
    if (normalizeTickerKey(button.dataset.ticker) === normalizedActiveTicker) {
      button.closest('tr')?.classList.add('row-insight-active');
    }
  });
}

function hideTickerInsight(resetSelection = false) {
  const panel = document.getElementById('tickerInsightPanel');
  if (panel) {
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('ticker-insight-open');
  enforceTickerInsightModalLayout();

  if (resetSelection) {
    activeInsightTicker = '';
    syncActiveInsightRow();
    if (lastInsightTriggerEl && typeof lastInsightTriggerEl.focus === 'function') {
      lastInsightTriggerEl.focus({ preventScroll: true });
    }
    lastInsightTriggerEl = null;
  }
}

function findStockByTicker(ticker) {
  const normalized = normalizeTickerKey(ticker);
  return allStocks.find(stock => normalizeTickerKey(stock.ticker) === normalized);
}

function buildFallbackSummary(stock) {
  if (!stock) {
    return {
      symbol: '',
      company_name: '',
      decision: 'WATCH',
      headline: 'Summary is not available yet for this ticker.',
      summary_short: 'No summary record was found. Please use the score columns and methodology page for details.',
      news_guidance: '',
      news_theme: '',
      news_tone: '',
      primary_news_headline: '',
      updated_at_utc: ''
    };
  }

  const decision = String(stock.decision || 'WATCH').toUpperCase();
  const discountText = stock.discount_pct != null
    ? `${stock.discount_pct.toFixed(1)}%`
    : 'n/a';
  const scoreText = [
    `Value ${stock.value_score != null ? stock.value_score.toFixed(1) + '%' : 'n/a'}`,
    `Quality ${stock.quality_score != null ? stock.quality_score.toFixed(1) + '%' : 'n/a'}`,
    `Risk ${stock.risk_score != null ? stock.risk_score.toFixed(1) + '%' : 'n/a'}`,
    `Dip ${stock.dip_score != null ? stock.dip_score.toFixed(1) + '%' : 'n/a'}`
  ].join(' | ');

  const valuationLine = stock.discount_pct != null && stock.discount_pct > 0
    ? `Current discount to estimated fair value is ${discountText}.`
    : `Current discount to estimated fair value is ${discountText}. Valuation is less favorable than other top picks.`;

  return {
    symbol: stock.ticker || '',
    company_name: stock.company_name || '',
    decision,
    headline: `${stock.company_name || stock.ticker} is currently rated ${decision} by the model.`,
    summary_short: `${valuationLine} Pillar scores: ${scoreText}.`,
    news_guidance: '',
    news_theme: '',
    news_tone: '',
    primary_news_headline: '',
    updated_at_utc: stock.data_date || ''
  };
}

async function fetchTickerSummary(ticker) {
  const normalizedTicker = normalizeTickerKey(ticker);
  if (!normalizedTicker) return null;

  if (tickerSummaryCache.has(normalizedTicker)) {
    return tickerSummaryCache.get(normalizedTicker);
  }

  if (tickerSummaryInFlight.has(normalizedTicker)) {
    return tickerSummaryInFlight.get(normalizedTicker);
  }

  const fetchPromise = (async () => {
    const response = await fetch(
      `${API_URL}/api/ticker-summary?symbol=${encodeURIComponent(normalizedTicker)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${currentAccessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Ticker summary endpoint returned ${response.status}`);
    }

    const payload = await response.json();
    return payload?.summary || null;
  })();

  tickerSummaryInFlight.set(normalizedTicker, fetchPromise);

  try {
    const summary = await fetchPromise;
    if (summary) {
      tickerSummaryCache.set(normalizedTicker, summary);
    }
    return summary;
  } finally {
    tickerSummaryInFlight.delete(normalizedTicker);
  }
}

function renderTickerInsight(summary, stock) {
  const titleEl = document.getElementById('tickerInsightTitle');
  const subheadEl = document.getElementById('tickerInsightSubhead');
  const decisionEl = document.getElementById('tickerInsightDecision');
  const themeEl = document.getElementById('tickerInsightTheme');
  const toneEl = document.getElementById('tickerInsightNewsTone');
  const freshnessEl = document.getElementById('tickerInsightNewsFreshness');
  const relevanceEl = document.getElementById('tickerInsightNewsRelevance');
  const headlineEl = document.getElementById('tickerInsightHeadline');
  const summaryEl = document.getElementById('tickerInsightSummary');
  const guidanceEl = document.getElementById('tickerInsightNewsGuidance');
  const newsHeadlineEl = document.getElementById('tickerInsightNewsHeadline');
  const updatedEl = document.getElementById('tickerInsightUpdated');

  const symbol = summary?.symbol || stock?.ticker || activeInsightTicker || '';
  const company = summary?.company_name || stock?.company_name || '';
  const decision = String(summary?.decision_display || summary?.decision || stock?.decision || 'WATCH').toUpperCase();

  if (titleEl) titleEl.textContent = symbol;
  if (subheadEl) subheadEl.textContent = company || 'Ticker detail';

  if (decisionEl) {
    decisionEl.textContent = decision;
    decisionEl.classList.remove('badge-buy', 'badge-watch', 'badge-avoid');
    decisionEl.classList.add(decisionClassFromValue(decision));
  }

  if (themeEl) {
    const value = String(summary?.news_theme_display || summary?.news_theme || '').trim();
    themeEl.textContent = value ? `Theme: ${value}` : 'Theme: model-driven';
  }

  if (toneEl) {
    const value = String(summary?.news_tone_display || summary?.news_tone || '').trim();
    toneEl.textContent = value ? `Tone: ${value}` : 'Tone: neutral';
  }

  if (freshnessEl) {
    const value = String(summary?.news_freshness_display || summary?.news_freshness || '').trim();
    freshnessEl.textContent = value ? `Freshness: ${value}` : 'Freshness: n/a';
  }

  if (relevanceEl) {
    const value = String(summary?.news_relevance_display || summary?.news_relevance || '').trim();
    relevanceEl.textContent = value ? `Relevance: ${value}` : 'Relevance: n/a';
  }

  if (headlineEl) {
    headlineEl.textContent = String(summary?.headline || '').trim();
    headlineEl.style.display = headlineEl.textContent ? 'block' : 'none';
  }

  if (summaryEl) {
    summaryEl.textContent = String(summary?.dashboard_story || summary?.summary_short || summary?.summary_300w || '').trim();
    summaryEl.style.display = summaryEl.textContent ? 'block' : 'none';
  }

  if (guidanceEl) {
    guidanceEl.textContent = String(summary?.news_guidance || '').trim();
    guidanceEl.style.display = guidanceEl.textContent ? 'block' : 'none';
  }

  if (newsHeadlineEl) {
    const primaryHeadline = String(summary?.primary_news_headline || '').trim();
    newsHeadlineEl.textContent = primaryHeadline ? `Primary news line: ${primaryHeadline}` : '';
    newsHeadlineEl.style.display = primaryHeadline ? 'block' : 'none';
  }

  if (updatedEl) {
    const updatedValue = summary?.updated_at_utc || '';
    const formatted = formatDateTime(updatedValue);
    updatedEl.textContent = formatted ? `Updated: ${formatted}` : '';
    updatedEl.style.display = formatted ? 'block' : 'none';
  }
}

async function showTickerInsight(ticker, triggerEl = null) {
  const normalizedTicker = normalizeTickerKey(ticker);
  if (!normalizedTicker) return;

  lastInsightTriggerEl = triggerEl || lastInsightTriggerEl;
  activeInsightTicker = normalizedTicker;
  syncActiveInsightRow();

  const panel = document.getElementById('tickerInsightPanel');
  if (panel) {
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
  }
  document.body.classList.add('ticker-insight-open');
  enforceTickerInsightModalLayout();
  document.getElementById('closeTickerInsightBtn')?.focus({ preventScroll: true });

  const stock = findStockByTicker(normalizedTicker);
  renderTickerInsight(
    {
      symbol: normalizedTicker,
      company_name: stock?.company_name || '',
      decision: stock?.decision || 'WATCH',
      headline: 'Loading summary...',
      summary_short: 'Fetching secured paid-user insight from the server.',
      news_guidance: '',
      news_theme: '',
      news_tone: '',
      primary_news_headline: '',
      updated_at_utc: ''
    },
    stock
  );

  try {
    const summary = await fetchTickerSummary(normalizedTicker);

    if (activeInsightTicker !== normalizedTicker) {
      return;
    }

    const finalSummary = summary || buildFallbackSummary(stock);
    renderTickerInsight(finalSummary, stock);
  } catch (error) {
    console.error(`Failed to load ticker summary for ${normalizedTicker}:`, error);
    if (activeInsightTicker !== normalizedTicker) {
      return;
    }
    const fallback = buildFallbackSummary(stock);
    fallback.headline = 'Summary is temporarily unavailable.';
    fallback.summary_short = 'The paid insight service could not be reached. Try again in a moment.';
    renderTickerInsight(fallback, stock);
  }
}

// ============================================================
// Render stocks table
// ============================================================
function renderTable(stocks) {
  const tbody = document.getElementById('stocksTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = '';

  if (stocks.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="14" style="text-align:center; padding:40px; color:#999;">
          No stocks available right now. Check back later!
        </td>
      </tr>
    `;
    return;
  }

  // Use profile subscription status, not missing fields
  const isFreeUser = userProfile && userProfile.subscription_status === 'free';

  stocks.forEach(stock => {
    const tr = document.createElement('tr');
    const decisionClass = stock.decision === 'BUY' ? 'badge-buy' : 
                         stock.decision === 'WATCH' ? 'badge-watch' : 'badge-avoid';

    if (isFreeUser) {
      // Free user: Show only ticker, company, country, sector, then upgrade prompt
      tr.innerHTML = `
        <td><strong>${stock.ticker}</strong></td>
        <td>${stock.company_name || '-'}</td>
        <td>${stock.country || '-'}</td>
        <td>${stock.sector || '-'}</td>
        <td colspan="10" style="text-align:center; color:var(--text-secondary);">
          <a href="pricing.html" style="color:var(--accent-green); font-weight:bold;">
            Upgrade to Pro for full metrics →
          </a>
        </td>
      `;
    } else {
      // Paid user: Show all columns matching header order
      // 1. Symbol, 2. Company, 3. Country, 4. Sector, 5. Rating, 6. Mkt Cap, 7. Confidence,
      // 8. Value, 9. Quality, 10. Risk, 11. Dip, 12. Price, 13. Fair Value, 14. Discount
      tr.innerHTML = `
        <td>
          <button type="button" class="ticker-insight-trigger" data-ticker="${stock.ticker}" aria-label="View insight for ${stock.ticker}">
            ${stock.ticker}
          </button>
        </td>
        <td>${stock.company_name || '-'}</td>
        <td>${stock.country || '-'}</td>
        <td>${stock.sector || '-'}</td>
        <td><span class="badge ${decisionClass}">${stock.decision || '-'}</span></td>
        <td>${formatMarketCap(stock.market_cap)}</td>
        <td>${stock.confidence != null ? stock.confidence.toFixed(1) + '%' : '-'}</td>
        <td>${stock.value_score != null ? stock.value_score.toFixed(1) + '%' : '-'}</td>
        <td>${stock.quality_score != null ? stock.quality_score.toFixed(1) + '%' : '-'}</td>
        <td>${stock.risk_score != null ? stock.risk_score.toFixed(1) + '%' : '-'}</td>
        <td>${stock.dip_score != null ? stock.dip_score.toFixed(1) + '%' : '-'}</td>
        <td>$${stock.current_price != null ? stock.current_price.toFixed(2) : '-'}</td>
        <td>$${stock.fair_value != null ? stock.fair_value.toFixed(2) : '-'}</td>
        <td class="${stock.discount_pct > 0 ? 'positive' : 'negative'}">
          ${stock.discount_pct != null ? stock.discount_pct.toFixed(1) + '%' : '-'}
        </td>
      `;
    }

    tbody.appendChild(tr);
  });

  syncActiveInsightRow();
}

// ============================================================
// Export to CSV (paid users only)
// ============================================================
function exportToCSV() {
  if (!allStocks || allStocks.length === 0) {
    alert('No stocks to export');
    return;
  }

  // Check if user has full data (paid)
  if (!allStocks[0].fair_value) {
    alert('Export is only available for Pro members');
    window.location.href = 'pricing.html';
    return;
  }

  // Generate CSV
  const headers = ['Ticker', 'Company', 'Country', 'Sector', 'Market Cap', 'Confidence', 'Price', 'Fair Value', 
                   'Discount %', 'Value Score', 'Quality Score', 'Risk Score', 'Dip Score', 
                   'Decision'];
  
  const rows = allStocks.map(s => [
    s.ticker,
    s.company_name,
    s.country,
    s.sector,
    s.market_cap || 0,
    s.confidence || 0,
    s.current_price,
    s.fair_value,
    s.discount_pct,
    s.value_score,
    s.quality_score,
    s.risk_score,
    s.dip_score,
    s.decision
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  // Download
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stedrok-picks-${formatDate(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function normalizeExchangeLabel(exchange) {
  return String(exchange || '')
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function normalizeCountryName(country) {
  return String(country || '')
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function extractTickerSuffix(symbol) {
  const value = String(symbol || '').trim().toUpperCase();
  if (!value.includes('.')) return '';
  const parts = value.split('.');
  return parts[parts.length - 1];
}

function deriveExchangeLabel(stock) {
  const explicitExchange = normalizeExchangeLabel(stock.exchange);
  if (explicitExchange) return explicitExchange;

  const suffix = extractTickerSuffix(stock.ticker || stock.symbol);
  if (suffix && EXCHANGE_FROM_SUFFIX[suffix]) {
    return EXCHANGE_FROM_SUFFIX[suffix];
  }

  const country = normalizeCountryName(stock.country);
  if (country && EXCHANGE_DEFAULT_BY_COUNTRY[country]) {
    return EXCHANGE_DEFAULT_BY_COUNTRY[country];
  }

  return '';
}

function getCoordinatesForExchange(exchange, country) {
  const normalized = normalizeExchangeLabel(exchange);

  if (EXCHANGE_COORDINATES[normalized]) {
    return EXCHANGE_COORDINATES[normalized];
  }

  for (const rule of EXCHANGE_COORDINATE_RULES) {
    if (rule.regex.test(normalized)) {
      return EXCHANGE_COORDINATES[rule.key];
    }
  }

  if (country && COUNTRY_COORDINATES[country]) {
    return COUNTRY_COORDINATES[country];
  }
  return null;
}

function buildExchangePoints(stocks) {
  const grouped = new Map();

  stocks.forEach(stock => {
    const exchange = normalizeExchangeLabel(deriveExchangeLabel(stock));
    if (!exchange) return;

    const country = normalizeCountryName(stock.country);
    if (!grouped.has(exchange)) {
      grouped.set(exchange, {
        exchange,
        count: 0,
        countries: new Set(),
        marketCapSum: 0
      });
    }
    const item = grouped.get(exchange);
    item.count += 1;
    if (country) item.countries.add(country);
    const marketCap = Number(stock.market_cap);
    if (Number.isFinite(marketCap) && marketCap > 0) {
      item.marketCapSum += marketCap;
    }
  });

  return Array.from(grouped.values())
    .map(item => {
      const firstCountry = Array.from(item.countries).sort()[0] || '';
      const coords = getCoordinatesForExchange(item.exchange, firstCountry);
      if (!coords) return null;

      let size;
      let metricLabel;
      if (item.marketCapSum > 0) {
        const logCap = Math.log10(item.marketCapSum + 1);
        size = Math.max(9, Math.min(22, 9 + (logCap - 8) * 4.2));
        metricLabel = `Total market cap: ${formatMarketCap(item.marketCapSum)}`;
      } else {
        size = Math.max(9, Math.min(18, 8 + item.count * 0.18));
        metricLabel = `Stocks: ${item.count}`;
      }

      return {
        exchange: item.exchange,
        count: item.count,
        country: firstCountry,
        lat: coords.lat,
        lng: coords.lng,
        size,
        metricLabel
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.count - a.count);
}

function getExchangeMarkerData() {
  return exchangePoints.map(point => ({
    ...point,
    active: point.exchange === selectedExchange
  }));
}

function createExchangeDot(point) {
  const dot = document.createElement('button');
  dot.type = 'button';
  dot.className = `exchange-marker${point.active ? ' exchange-marker--active' : ''}`;
  dot.style.setProperty('--orb-size', `${Math.round(point.size)}px`);
  dot.style.setProperty('--orb-halo-size', `${Math.max(18, Math.round(point.size * 2.5))}px`);
  dot.title = `${point.exchange} (${point.count} stocks)\n${point.metricLabel || ''}`;
  dot.setAttribute('aria-label', `${point.exchange} exchange filter`);
  let lastActivationMs = 0;
  const activateFilter = event => {
    const now = Date.now();
    if (now - lastActivationMs < 220) return;
    lastActivationMs = now;
    event.preventDefault();
    event.stopPropagation();
    setExchangeFilter(point.exchange);
  };

  // Prevent orbit controls from hijacking marker taps/drags.
  dot.addEventListener('pointerdown', event => {
    event.stopPropagation();
  });

  // Pointer-up is more reliable than click on mobile inside draggable canvases.
  dot.addEventListener('pointerup', activateFilter);
  dot.addEventListener('click', activateFilter);

  // Keyboard support for accessibility.
  dot.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      activateFilter(event);
    }
  });

  return dot;
}

function updateExchangeFilterUI() {
  const label = document.getElementById('selectedExchangeLabel');
  if (label) {
    label.textContent = selectedExchange || 'All Exchanges';
  }

  document.querySelectorAll('.exchange-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.exchange === selectedExchange);
  });

  if (globeView) {
    globeView.htmlElementsData(getExchangeMarkerData());
  }
}

function setExchangeFilter(exchangeName) {
  selectedExchange = selectedExchange === exchangeName ? '' : exchangeName;
  updateExchangeFilterUI();
  applyFilters();
}

function renderExchangeChips() {
  const chipList = document.getElementById('exchangeChipList');
  if (!chipList) return;

  chipList.innerHTML = '';
  exchangePoints.forEach(point => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'exchange-chip';
    chip.dataset.exchange = point.exchange;
    chip.textContent = `${point.exchange} (${point.count})`;
    chip.addEventListener('click', () => setExchangeFilter(point.exchange));
    chipList.appendChild(chip);
  });
}

function setupExchangeGlobe(stocks) {
  const panel = document.getElementById('exchangeGlobePanel');
  const globeEl = document.getElementById('exchangeGlobe');
  const clearBtn = document.getElementById('clearExchangeFilterBtn');
  if (!panel || !globeEl) return;

  selectedExchange = '';
  exchangePoints = buildExchangePoints(stocks);

  if (exchangePoints.length === 0) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  renderExchangeChips();
  updateExchangeFilterUI();

  if (clearBtn) {
    clearBtn.onclick = () => {
      selectedExchange = '';
      updateExchangeFilterUI();
      applyFilters();
    };
  }

  if (typeof window.Globe !== 'function') {
    globeEl.innerHTML = '<p style="padding:16px;color:var(--text-secondary);">Globe unavailable. Use exchange chips to filter.</p>';
    return;
  }

  const syncGlobeSize = () => {
    if (!globeView) return;
    const width = Math.max(220, Math.floor(globeEl.clientWidth || 220));
    const height = Math.max(220, Math.floor(globeEl.clientHeight || 220));
    globeView.width(width).height(height);
  };

  const isMobileViewport = window.matchMedia('(max-width: 768px)').matches;

  if (!globeView) {
    globeView = window.Globe()(globeEl)
      .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
      .backgroundColor('rgba(0,0,0,0)')
      .enablePointerInteraction(true)
      .showAtmosphere(true)
      .atmosphereColor('#7dd3fc')
      .atmosphereAltitude(0.12)
      .showGraticules(true)
      .htmlLat('lat')
      .htmlLng('lng')
      .htmlAltitude(point => (point.active ? 0.07 : 0.05))
      .htmlElement(point => createExchangeDot(point))
      .htmlTransitionDuration(200);

    const controls = globeView.controls();
    controls.autoRotate = !isMobileViewport;
    controls.autoRotateSpeed = isMobileViewport ? 0 : 0.45;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = !isMobileViewport;
    controls.enableZoom = true;
    controls.rotateSpeed = isMobileViewport ? 0.65 : 1.0;
    controls.zoomSpeed = isMobileViewport ? 0.8 : 1.0;
    controls.minDistance = isMobileViewport ? 170 : 140;
    controls.maxDistance = isMobileViewport ? 360 : 320;

    if (!globeResizeBound) {
      globeResizeBound = true;
      const onResize = () => requestAnimationFrame(syncGlobeSize);
      window.addEventListener('resize', onResize, { passive: true });
      window.addEventListener('orientationchange', onResize, { passive: true });

      if ('ResizeObserver' in window) {
        globeResizeObserver = new ResizeObserver(() => onResize());
        globeResizeObserver.observe(globeEl);
      }
    }
  }

  globeView.htmlElementsData(getExchangeMarkerData());
  syncGlobeSize();
  setTimeout(syncGlobeSize, 80);
  setTimeout(syncGlobeSize, 280);

  // Start from a neutral view near Europe/Atlantic so key exchanges are visible quickly.
  globeView.pointOfView({ lat: 30, lng: 0, altitude: isMobileViewport ? 2.35 : 2.1 }, 700);

  updateExchangeFilterUI();
}

// ============================================================
// Filters and sorting
// ============================================================
function setupFilters() {
  // Search filter
  document.getElementById('searchInput')?.addEventListener('input', applyFilters);
  
  // Country filter
  document.getElementById('countryFilter')?.addEventListener('input', applyFilters);
  
  // Sector filter
  document.getElementById('sectorFilter')?.addEventListener('input', applyFilters);
  
  // Min score filter
  document.getElementById('minScoreFilter')?.addEventListener('input', applyFilters);
  
  // Decision filter
  document.getElementById('decisionFilter')?.addEventListener('change', applyFilters);
}

function setupSorting() {
  // Add click handlers to all sortable column headers
  const headers = document.querySelectorAll('#stocksTable th[data-sort]');
  headers.forEach(header => {
    header.style.cursor = 'pointer';
    header.addEventListener('click', () => {
      const column = header.getAttribute('data-sort');
      
      // Toggle direction if same column, otherwise default to descending
      if (currentSortColumn === column) {
        currentSortDirection = currentSortDirection === 'desc' ? 'asc' : 'desc';
      } else {
        currentSortColumn = column;
        currentSortDirection = 'desc';
      }
      
      // Update visual indicators
      headers.forEach(h => {
        const col = h.getAttribute('data-sort');
        const text = h.textContent.replace(' ↑', '').replace(' ↓', '').replace(' ↕', '');
        if (col === currentSortColumn) {
          h.textContent = text + (currentSortDirection === 'desc' ? ' ↓' : ' ↑');
          h.style.color = 'var(--accent-green)';
        } else {
          h.textContent = text + ' ↕';
          h.style.color = '';
        }
      });
      
      applyFilters();
    });
  });
}

function applyFilters() {
  let filtered = [...allStocks];

  // Apply search filter (ticker or company name)
  const searchTerm = document.getElementById('searchInput')?.value?.toLowerCase();
  if (searchTerm) {
    filtered = filtered.filter(s => 
      (s.ticker && s.ticker.toLowerCase().includes(searchTerm)) ||
      (s.company_name && s.company_name.toLowerCase().includes(searchTerm))
    );
  }

  // Apply country filter
  const countryTerm = document.getElementById('countryFilter')?.value?.toLowerCase();
  if (countryTerm) {
    filtered = filtered.filter(s => 
      s.country && s.country.toLowerCase().includes(countryTerm)
    );
  }

  // Apply sector filter
  const sectorTerm = document.getElementById('sectorFilter')?.value?.toLowerCase();
  if (sectorTerm) {
    filtered = filtered.filter(s => 
      s.sector && s.sector.toLowerCase().includes(sectorTerm)
    );
  }

  // Apply minimum score filter (uses Value Score)
  const minScore = document.getElementById('minScoreFilter')?.value;
  if (minScore && !isNaN(minScore)) {
    const threshold = parseFloat(minScore);
    filtered = filtered.filter(s => 
      s.value_score != null && s.value_score >= threshold
    );
  }

  // Apply decision/rating filter
  const decisionFilter = document.getElementById('decisionFilter')?.value;
  if (decisionFilter) {
    filtered = filtered.filter(s => s.decision === decisionFilter);
  }

  // Apply exchange filter from globe/chips
  if (selectedExchange) {
    filtered = filtered.filter(s => normalizeExchangeLabel(deriveExchangeLabel(s)) === selectedExchange);
  }

  // Apply sorting
  filtered.sort((a, b) => {
    let aVal = a[currentSortColumn];
    let bVal = b[currentSortColumn];
    
    // Handle null/undefined values
    if (aVal == null) aVal = currentSortDirection === 'desc' ? -Infinity : Infinity;
    if (bVal == null) bVal = currentSortDirection === 'desc' ? -Infinity : Infinity;
    
    // String comparison for text columns
    if (typeof aVal === 'string') {
      return currentSortDirection === 'desc' 
        ? bVal.localeCompare(aVal)
        : aVal.localeCompare(bVal);
    }
    
    // Numeric comparison
    return currentSortDirection === 'desc' ? bVal - aVal : aVal - bVal;
  });

  renderTable(filtered);
}

// ============================================================
// Utility: Format market cap
// ============================================================
function formatMarketCap(value) {
  if (value == null) return '-';
  if (value === 0) return '$0';
  
  const absValue = Math.abs(value);
  
  if (absValue >= 1e12) {
    return '$' + (value / 1e12).toFixed(2) + 'T';
  } else if (absValue >= 1e9) {
    return '$' + (value / 1e9).toFixed(2) + 'B';
  } else if (absValue >= 1e6) {
    return '$' + (value / 1e6).toFixed(2) + 'M';
  } else {
    return '$' + value.toLocaleString();
  }
}

// ============================================================
// Utility: Format date
// ============================================================
function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}
