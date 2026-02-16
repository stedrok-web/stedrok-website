// Dashboard - Updated for Option 1 Architecture
// Loads picks from Cloudflare Worker API instead of static JSON
// Updated: 2026-02-14

let currentUser = null;
let userProfile = null;
let allStocks = [];

// API URL from central config (js/config.js must be loaded before this file)
const API_URL = CONFIG.API_BASE_URL;

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
        <td colspan="13" style="text-align:center; padding:40px; color:#999;">
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
        <td colspan="8" style="text-align:center; color:var(--text-secondary);">
          <a href="pricing.html" style="color:var(--accent-green); font-weight:bold;">
            Upgrade to Pro for full metrics →
          </a>
        </td>
      `;
    } else {
      // Paid user: Show all columns matching header order
      // 1. Symbol, 2. Company, 3. Country, 4. Sector, 5. Rating,
      // 6. Value, 7. Quality, 8. Risk, 9. Dip, 10. Price, 11. Fair Value, 12. Discount
      tr.innerHTML = `
        <td><strong>${stock.ticker}</strong></td>
        <td>${stock.company_name || '-'}</td>
        <td>${stock.country || '-'}</td>
        <td>${stock.sector || '-'}</td>
        <td><span class="badge ${decisionClass}">${stock.decision || '-'}</span></td>
        <td>${stock.value_score != null ? stock.value_score.toFixed(1) : '-'}</td>
        <td>${stock.quality_score != null ? stock.quality_score.toFixed(1) : '-'}</td>
        <td>${stock.risk_score != null ? stock.risk_score.toFixed(1) : '-'}</td>
        <td>${stock.dip_score != null ? stock.dip_score.toFixed(1) : '-'}</td>
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
  const headers = ['Ticker', 'Company', 'Country', 'Sector', 'Price', 'Fair Value', 
                   'Discount %', 'Value Score', 'Quality Score', 'Risk Score', 'Dip Score', 
                   'Decision'];
  
  const rows = allStocks.map(s => [
    s.ticker,
    s.company_name,
    s.country,
    s.sector,
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

  renderTable(filtered);
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
