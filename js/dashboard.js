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
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                  color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h3 style="margin: 0 0 10px 0;">🎁 Free Tier Preview</h3>
        <p style="margin: 0 0 15px 0;">
          You're viewing <strong>${count} random stocks</strong> from our screener. 
          Upgrade to see <strong>100+ carefully selected opportunities</strong> with full metrics!
        </p>
        <a href="pricing.html" class="btn-primary" 
           style="display: inline-block; background: white; color: #667eea; 
                  padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
          ⚡ Upgrade to Pro - Only $3/month
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
      <div style="background: #10b981; color: white; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        ✓ <strong>Pro Member</strong> - Viewing ${count} stocks | 
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

  stocks.forEach(stock => {
    const tr = document.createElement('tr');
    const decisionClass = stock.decision === 'BUY' ? 'badge-buy' : 
                         stock.decision === 'WATCH' ? 'badge-watch' : 'badge-avoid';

    // Check if this is a free user (limited fields)
    const isFree = !stock.fair_value;

    if (isFree) {
      // Free user: Show only basic info
      tr.innerHTML = `
        <td><strong>${stock.ticker}</strong></td>
        <td>${stock.company_name || '-'}</td>
        <td>${stock.sector || '-'}</td>
        <td>${stock.total_score ? stock.total_score.toFixed(1) : '-'}</td>
        <td colspan="9" style="text-align:center; color:#999;">
          <a href="pricing.html" style="color:#667eea; font-weight:bold;">
            Upgrade to see full metrics →
          </a>
        </td>
      `;
    } else {
      // Paid user: Show full data
      tr.innerHTML = `
        <td><strong>${stock.ticker}</strong></td>
        <td>${stock.company_name || '-'}</td>
        <td>${stock.country || '-'}</td>
        <td>${stock.sector || '-'}</td>
        <td>${stock.exchange || '-'}</td>
        <td>$${stock.current_price ? stock.current_price.toFixed(2) : '-'}</td>
        <td>$${stock.fair_value ? stock.fair_value.toFixed(2) : '-'}</td>
        <td class="${stock.discount_pct < 0 ? 'negative' : 'positive'}">
          ${stock.discount_pct ? stock.discount_pct.toFixed(1) : '-'}%
        </td>
        <td>${stock.value_score ? stock.value_score.toFixed(1) : '-'}</td>
        <td>${stock.quality_score ? stock.quality_score.toFixed(1) : '-'}</td>
        <td>${stock.risk_score ? stock.risk_score.toFixed(1) : '-'}</td>
        <td>${stock.total_score ? stock.total_score.toFixed(1) : '-'}</td>
        <td><span class="badge ${decisionClass}">${stock.decision || '-'}</span></td>
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
                   'Discount %', 'Value Score', 'Quality Score', 'Risk Score', 
                   'Total Score', 'Decision'];
  
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
    s.total_score,
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
  // Sector filter
  document.getElementById('sectorFilter')?.addEventListener('change', applyFilters);
  
  // Decision filter
  document.getElementById('decisionFilter')?.addEventListener('change', applyFilters);
  
  // Sort options
  document.getElementById('sortBy')?.addEventListener('change', applyFilters);
}

function applyFilters() {
  let filtered = [...allStocks];

  // Apply sector filter
  const sectorFilter = document.getElementById('sectorFilter')?.value;
  if (sectorFilter && sectorFilter !== 'all') {
    filtered = filtered.filter(s => s.sector === sectorFilter);
  }

  // Apply decision filter
  const decisionFilter = document.getElementById('decisionFilter')?.value;
  if (decisionFilter && decisionFilter !== 'all') {
    filtered = filtered.filter(s => s.decision === decisionFilter);
  }

  // Apply sorting
  const sortBy = document.getElementById('sortBy')?.value;
  if (sortBy === 'score') {
    filtered.sort((a, b) => (b.total_score || 0) - (a.total_score || 0));
  } else if (sortBy === 'discount') {
    filtered.sort((a, b) => (a.discount_pct || 0) - (b.discount_pct || 0));
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
