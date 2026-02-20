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

// API URL from central config (js/config.js must be loaded before this file)
const API_URL = CONFIG.API_BASE_URL;

const EXCHANGE_COORDINATES = {
  'USA (NYSE/NASDAQ)': { lat: 40.706, lng: -74.011 },
  'Hong Kong': { lat: 22.285, lng: 114.158 },
  'London (UK)': { lat: 51.507, lng: -0.128 },
  'Australia (ASX)': { lat: -33.868, lng: 151.209 },
  'Paris (France)': { lat: 48.856, lng: 2.352 },
  'Amsterdam (Netherlands)': { lat: 52.372, lng: 4.899 },
  'Frankfurt (Germany)': { lat: 50.111, lng: 8.682 },
  'Madrid (Spain)': { lat: 40.416, lng: -3.703 },
  'Copenhagen (Denmark)': { lat: 55.676, lng: 12.568 },
  'Oslo (Norway)': { lat: 59.913, lng: 10.752 },
  'Toronto (Canada)': { lat: 43.653, lng: -79.383 },
  'SIX (Switzerland)': { lat: 47.376, lng: 8.541 },
  'Stockholm (Sweden)': { lat: 59.329, lng: 18.068 },
  'Tokyo (Japan)': { lat: 35.676, lng: 139.650 }
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
        <td><strong>${stock.ticker}</strong></td>
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

function getCoordinatesForExchange(exchange, country) {
  if (EXCHANGE_COORDINATES[exchange]) {
    return EXCHANGE_COORDINATES[exchange];
  }
  if (country && COUNTRY_COORDINATES[country]) {
    return COUNTRY_COORDINATES[country];
  }
  return null;
}

function buildExchangePoints(stocks) {
  const grouped = new Map();

  stocks.forEach(stock => {
    const exchange = (stock.exchange || '').trim();
    if (!exchange) return;

    const country = (stock.country || '').trim();
    if (!grouped.has(exchange)) {
      grouped.set(exchange, { exchange, count: 0, countries: new Set() });
    }
    const item = grouped.get(exchange);
    item.count += 1;
    if (country) item.countries.add(country);
  });

  return Array.from(grouped.values())
    .map(item => {
      const firstCountry = Array.from(item.countries)[0] || '';
      const coords = getCoordinatesForExchange(item.exchange, firstCountry);
      if (!coords) return null;

      return {
        exchange: item.exchange,
        count: item.count,
        country: firstCountry,
        lat: coords.lat,
        lng: coords.lng,
        size: Math.min(1.7, 0.55 + item.count / 24)
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.count - a.count);
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
    globeView
      .pointAltitude(point => (point.exchange === selectedExchange ? 0.19 : 0.1))
      .pointColor(point => (point.exchange === selectedExchange ? '#22c55e' : '#7dd3fc'));
    globeView.pointsData([...exchangePoints]);
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

  clearBtn?.addEventListener('click', () => {
    selectedExchange = '';
    updateExchangeFilterUI();
    applyFilters();
  });

  if (typeof window.Globe !== 'function') {
    globeEl.innerHTML = '<p style="padding:16px;color:var(--text-secondary);">Globe unavailable. Use exchange chips to filter.</p>';
    return;
  }

  if (!globeView) {
    globeView = window.Globe()(globeEl)
      .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-night.jpg')
      .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
      .backgroundColor('rgba(0,0,0,0)')
      .showAtmosphere(true)
      .atmosphereColor('#7dd3fc')
      .atmosphereAltitude(0.12)
      .pointLat('lat')
      .pointLng('lng')
      .pointRadius('size')
      .pointLabel(point => `${point.exchange}<br/><strong>${point.count} stocks</strong>`)
      .onPointClick(point => setExchangeFilter(point.exchange));

    const controls = globeView.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = true;
    controls.minDistance = 140;
    controls.maxDistance = 320;

    if (!globeResizeBound) {
      globeResizeBound = true;
      window.addEventListener('resize', () => {
        if (!globeView || !globeEl.clientWidth) return;
        globeView.width(globeEl.clientWidth);
        globeView.height(globeEl.clientHeight);
      });
    }
  }

  globeView
    .width(globeEl.clientWidth)
    .height(globeEl.clientHeight)
    .pointsData([...exchangePoints]);

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
    filtered = filtered.filter(s => s.exchange === selectedExchange);
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
