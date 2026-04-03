// Dashboard - Updated for Option 1 Architecture
// Loads picks from Cloudflare Worker API instead of static JSON
// Updated: 2026-02-14

let currentUser = null;
let userProfile = null;
let allStocks = [];
let currentSortColumn = 'value_score';
let currentSortDirection = 'desc';
let selectedExchange = '';
const PAGE_SIZE = 50;
let currentPage = 0;
let _pagedStocks = [];
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
let currentLaneMode = 'core';

// No hidden dashboard score filters or guardrails — all BUYs show for all lanes.
const DEFAULT_MIN_SCORE_THRESHOLD_BY_LANE = Object.freeze({
  core: Number.NaN,
  hybrid: Number.NaN,
  blended: Number.NaN
});

const DEFAULT_LANE_GUARDRAILS = Object.freeze({
  core: Object.freeze({}),
  hybrid: Object.freeze({}),
  blended: Object.freeze({})
});

const EUROPE_REGION_COUNTRIES = new Set([
  'GERMANY',
  'FRANCE',
  'ITALY',
  'SPAIN',
  'NETHERLANDS',
  'BELGIUM',
  'PORTUGAL',
  'AUSTRIA',
  'FINLAND',
  'SWEDEN',
  'DENMARK',
  'NORWAY',
  'SWITZERLAND',
  'LUXEMBOURG',
  'GREECE',
  'POLAND',
  'CZECH REPUBLIC',
  'IRELAND'
]);

const DEVELOPED_REGION_COUNTRIES = new Set([
  'CANADA',
  'NEW ZEALAND',
  'SINGAPORE',
  'HONG KONG',
  'SOUTH KOREA',
  'TAIWAN',
  'ISRAEL'
]);

// ============================================================
// Score cell helper - color graduation + mini bar
// ============================================================
function truncate(s,n){if(!s||s.length<=n)return s;return s.slice(0,n-1)+"…";}
function scoreCell(val) {
  if (val == null || val === '' || val === undefined) return '<td class="score-val">—</td>';
  const n = Math.round(parseFloat(val));
  const tier = n >= 70 ? 'high' : n >= 40 ? 'mid' : 'low';
  const cls  = n >= 70 ? 'score-high' : n >= 40 ? 'score-mid' : 'score-low';
  return '<td class="score-val ' + cls + '" data-value="' + n + '"><div class="score-bar-wrap"><span>' + n + '</span><div class="score-bar"><div class="score-bar-fill ' + tier + '" style="width:' + n + '%"></div></div></div></td>';
}

// ============================================================
// Skeleton loading rows
// ============================================================
function showTableSkeleton() {
  const tbody = document.getElementById('stocksTableBody');
  if (!tbody) return;
  let html = '';
  for (let i = 0; i < 6; i++) {
    html += '<tr class="skeleton-row">' + '<td>&nbsp;</td>'.repeat(15) + '</tr>';
  }
  tbody.innerHTML = html;
}

// ============================================================
// Dashboard stat bar (BUY / WATCH / AVOID counts)
// ============================================================
function updateStatBar(stocks) {
  const bar = document.getElementById('dashStatBar');
  if (!bar) return;
  const buy   = stocks.filter(s => s.decision === 'BUY').length;
  const watch = stocks.filter(s => s.decision === 'WATCH').length;
  const avoid = stocks.filter(s => s.decision === 'AVOID').length;
  if (buy + watch + avoid === 0) { bar.style.display = 'none'; return; }
  let html =
    (buy   ? '<span class="dash-stat buy">▲ ' + buy + ' BUY</span>' : '') +
    (watch ? '<span class="dash-stat watch">◉ ' + watch + ' WATCH</span>' : '') +
    (avoid ? '<span class="dash-stat avoid">▽ ' + avoid + ' AVOID</span>' : '');
  if ((typeof currentLaneMode !== 'undefined' ? currentLaneMode : 'core') === 'blended') {
    const swarmScores = stocks.map(s => s.swarm_score).filter(v => v != null && !isNaN(Number(v)));
    if (swarmScores.length > 0) {
      const avgSwarm = (swarmScores.reduce((a, b) => a + Number(b), 0) / swarmScores.length).toFixed(1);
      html += '<span class="dash-stat swarm">⚡ Avg Pick Score: ' + avgSwarm + '</span>';
    }
  }
  bar.innerHTML = html;
  bar.style.display = 'flex';
}

// ============================================================
// Pillar bars in ticker insight panel
// ============================================================
function populatePillarBars(stock) {
  const wrap = document.getElementById('tickerPillarBars');
  if (!wrap) return;
  const pillars = [
    { fill: 'pillarFillValue',   val: 'pillarValValue',   v: stock ? stock.value_score   : null },
    { fill: 'pillarFillQuality', val: 'pillarValQuality', v: stock ? stock.quality_score : null },
    { fill: 'pillarFillRisk',    val: 'pillarValRisk',    v: stock ? stock.risk_score    : null },
    { fill: 'pillarFillDip',     val: 'pillarValDip',     v: stock ? stock.dip_score     : null }
  ];
  let hasData = false;
  pillars.forEach(function(p) {
    const el = document.getElementById(p.fill);
    const vl = document.getElementById(p.val);
    if (p.v != null && p.v !== '') {
      const n = Math.round(parseFloat(p.v));
      const tier = n >= 70 ? 'tier-high' : n >= 40 ? 'tier-mid' : 'tier-low';
      if (el) {
        el.style.width = n + '%';
        el.className = el.className.replace(/\btier-(high|mid|low)\b/g, '').trim() + ' ' + tier;
      }
      if (vl) vl.textContent = n;
      hasData = true;
    } else {
      if (el) el.style.width = '0%';
      if (vl) vl.textContent = '—';
    }
  });
  wrap.style.display = hasData ? 'grid' : 'none';
}


// API URL from central config (js/config.js must be loaded before this file)
const API_URL = CONFIG.API_BASE_URL;

const DASHBOARD_LANE_LABELS = {
  core: 'Core',
  hybrid: 'AI Hybrid',
  blended: 'StedrokGPT Pick'
};

const DASHBOARD_LANE_DESCRIPTIONS = {
  core: 'Core: Deterministic, rule-based picks from the production fundamental value and quality engine.',
  hybrid: 'AI Hybrid (beta): Cross-checks shortlisted companies against live data and current context before publication. Core ratings remain unchanged.',
  blended: 'StedrokGPT Pick: Multi-scenario conviction analysis: internet evidence checks, valuation context, and cross-scenario filters on top of the broader Stedrok stack.'
};


const EXCHANGE_COORDINATES = {
  'USA (NYSE/NASDAQ)': { lat: 40.757, lng: -73.985 }, // Nasdaq MarketSite (NYC)
  'Canada (TSX)': { lat: 43.653, lng: -79.383 }, // TSX alt label
  'Hong Kong': { lat: 22.285, lng: 114.158 }, // HKEX
  'China': { lat: 31.230, lng: 121.474 }, // Shanghai exchange cluster
  'Shanghai (China)': { lat: 31.230, lng: 121.474 }, // SSE
  'Shenzhen (China)': { lat: 22.543, lng: 114.058 }, // SZSE
  'London (UK)': { lat: 51.514, lng: -0.088 }, // London Stock Exchange
  'Australia (ASX)': { lat: -33.866, lng: 151.209 }, // ASX Sydney
  'New Zealand (NZX)': { lat: -36.849, lng: 174.763 }, // NZX Auckland
  'Paris (France)': { lat: 48.868, lng: 2.347 }, // Euronext Paris
  'Amsterdam (Netherlands)': { lat: 52.372, lng: 4.893 }, // Euronext Amsterdam
  'Frankfurt (Germany)': { lat: 50.114, lng: 8.678 }, // Frankfurt Stock Exchange
  'Madrid (Spain)': { lat: 40.415, lng: -3.694 }, // Bolsa de Madrid
  'Mexico': { lat: 19.433, lng: -99.133 }, // Bolsa Mexicana de Valores
  'Brazil (B3)': { lat: -23.548, lng: -46.638 }, // B3 Sao Paulo
  'India': { lat: 19.076, lng: 72.878 }, // NSE/BSE Mumbai
  'South Korea': { lat: 37.567, lng: 126.978 }, // KRX Seoul
  'Taiwan': { lat: 25.033, lng: 121.565 }, // TWSE Taipei
  'Tel Aviv (Israel)': { lat: 32.085, lng: 34.782 }, // TASE
  'Johannesburg (South Africa)': { lat: -26.205, lng: 28.047 }, // JSE
  'Copenhagen (Denmark)': { lat: 55.676, lng: 12.568 }, // Nasdaq Copenhagen
  'Oslo (Norway)': { lat: 59.913, lng: 10.739 }, // Oslo Bors
  'Milan (Italy)': { lat: 45.464, lng: 9.191 }, // Borsa Italiana
  'Stockholm (Sweden)': { lat: 59.334, lng: 18.066 }, // Nasdaq Stockholm
  'Brussels (Belgium)': { lat: 50.850, lng: 4.352 }, // Euronext Brussels
  'Helsinki (Finland)': { lat: 60.170, lng: 24.941 }, // Nasdaq Helsinki
  'SIX (Switzerland)': { lat: 47.376, lng: 8.541 }, // SIX Swiss Exchange
  'Zurich (Switzerland)': { lat: 47.376, lng: 8.541 }, // SIX alt label
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
  'Hong Kong': { lat: 22.319, lng: 114.169 },
  'United Kingdom': { lat: 55.378, lng: -3.436 },
  'Canada': { lat: 56.130, lng: -106.346 },
  'France': { lat: 46.227, lng: 2.213 },
  'Singapore': { lat: 1.352, lng: 103.820 },
  'Australia': { lat: -25.274, lng: 133.775 },
  'New Zealand': { lat: -40.901, lng: 174.886 },
  'Germany': { lat: 51.165, lng: 10.451 },
  'Ireland': { lat: 53.412, lng: -8.243 },
  'Denmark': { lat: 56.263, lng: 9.502 },
  'Sweden': { lat: 60.128, lng: 18.643 },
  'Finland': { lat: 61.924, lng: 25.748 },
  'Belgium': { lat: 50.503, lng: 4.469 },
  'Poland': { lat: 51.919, lng: 19.145 },
  'Spain': { lat: 40.464, lng: -3.749 },
  'Portugal': { lat: 39.399, lng: -8.224 },
  'Greece': { lat: 39.074, lng: 21.824 },
  'Norway': { lat: 60.472, lng: 8.468 },
  'Netherlands': { lat: 52.132, lng: 5.291 },
  'Switzerland': { lat: 46.818, lng: 8.227 },
  'Austria': { lat: 47.517, lng: 14.550 },
  'Italy': { lat: 41.871, lng: 12.567 },
  'Japan': { lat: 36.205, lng: 138.252 },
  'India': { lat: 20.594, lng: 78.963 },
  'South Korea': { lat: 35.908, lng: 127.767 },
  'Taiwan': { lat: 23.697, lng: 120.961 },
  'Israel': { lat: 31.047, lng: 34.852 },
  'United Arab Emirates': { lat: 23.425, lng: 53.848 },
  'Brazil': { lat: -14.236, lng: -51.925 },
  'Mexico': { lat: 23.634, lng: -102.553 },
  'South Africa': { lat: -30.559, lng: 22.938 },
  'Luxembourg': { lat: 49.815, lng: 6.129 },
  'Chile': { lat: -35.675, lng: -71.543 }
};

const EXCHANGE_COORDINATE_RULES = [
  { regex: /(nyse|nasdaq|usa)/i, key: 'USA (NYSE/NASDAQ)' },
  { regex: /(toronto|tsx|canada)/i, key: 'Toronto (Canada)' },
  { regex: /hong\s*kong/i, key: 'Hong Kong' },
  { regex: /(shanghai|sse|china)/i, key: 'Shanghai (China)' },
  { regex: /(shenzhen|szse)/i, key: 'Shenzhen (China)' },
  { regex: /(india|nse|bse)/i, key: 'India' },
  { regex: /(brazil|b3|sao\s*paulo)/i, key: 'Brazil (B3)' },
  { regex: /(mexico|bmv)/i, key: 'Mexico' },
  { regex: /(south\s*korea|krx|kospi|kosdaq)/i, key: 'South Korea' },
  { regex: /(taiwan|twse|tpex)/i, key: 'Taiwan' },
  { regex: /(tel\s*aviv|tase)/i, key: 'Tel Aviv (Israel)' },
  { regex: /(johannesburg|jse)/i, key: 'Johannesburg (South Africa)' },
  { regex: /(new\s*zealand|nzx|auckland)/i, key: 'New Zealand (NZX)' },
  { regex: /(frankfurt|xetra)/i, key: 'Frankfurt (Germany)' },
  { regex: /(copenhagen|nasdaq\s*copenhagen)/i, key: 'Copenhagen (Denmark)' },
  { regex: /(stockholm|nasdaq\s*stockholm)/i, key: 'Stockholm (Sweden)' },
  { regex: /(amsterdam|euronext\s*amsterdam)/i, key: 'Amsterdam (Netherlands)' },
  { regex: /(paris|euronext\s*paris)/i, key: 'Paris (France)' },
  { regex: /(madrid|bolsa\s*de\s*madrid)/i, key: 'Madrid (Spain)' },
  { regex: /(oslo|bors)/i, key: 'Oslo (Norway)' },
  { regex: /(london|lse)/i, key: 'London (UK)' },
  { regex: /(zurich|switzerland|six)/i, key: 'SIX (Switzerland)' }
];

// Derived from the 2026-02-21 scored CSV universe where exchange can be blank.
const EXCHANGE_FROM_SUFFIX = {
  AX: 'Australia (ASX)',
  L: 'London (UK)',
  HK: 'Hong Kong',
  SS: 'Shanghai (China)',
  SZ: 'Shenzhen (China)',
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
  V: 'Toronto (Canada)',
  T: 'Tokyo (Japan)',
  PR: 'Prague (Czech Republic)',
  NS: 'India',
  BO: 'India',
  KS: 'South Korea',
  KQ: 'South Korea',
  SI: 'Singapore',
  SA: 'Brazil (B3)',
  MX: 'Mexico',
  TA: 'Tel Aviv (Israel)',
  JO: 'Johannesburg (South Africa)',
  NZ: 'New Zealand (NZX)'
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
  'Brazil': 'Brazil (B3)',
  'Luxembourg': 'Paris (France)',
  'Singapore': 'Singapore',
  'New Zealand': 'New Zealand (NZX)',
  'Greece': 'Athens (Greece)',
  'Japan': 'Tokyo (Japan)',
  'Mexico': 'Mexico',
  'Argentina': 'USA (NYSE/NASDAQ)',
  'Portugal': 'Lisbon (Portugal)',
  'South Africa': 'Johannesburg (South Africa)',
  'Austria': 'Vienna (Austria)',
  'India': 'India',
  'Taiwan': 'Taiwan',
  'Poland': 'Warsaw (Poland)',
  'South Korea': 'South Korea',
  'Chile': 'USA (NYSE/NASDAQ)',
  'Jersey': 'London (UK)',
  'Bermuda': 'USA (NYSE/NASDAQ)',
  'Cayman Islands': 'USA (NYSE/NASDAQ)',
  'Peru': 'Mexico',
  'Colombia': 'Mexico',
  'Uruguay': 'Brazil (B3)',
  'Indonesia': 'Singapore',
  'Czech Republic': 'Prague (Czech Republic)',
  'Macau': 'Hong Kong',
  'Cyprus': 'Athens (Greece)',
  'British Virgin Islands': 'USA (NYSE/NASDAQ)',
  'Turkey': 'London (UK)',
  'Monaco': 'Paris (France)',
  'Thailand': 'Singapore',
  'Panama': 'USA (NYSE/NASDAQ)',
  'Guernsey': 'London (UK)',
  'Kazakhstan': 'London (UK)',
  'Vietnam': 'Singapore',
  'Costa Rica': 'USA (NYSE/NASDAQ)',
  'Bahamas': 'USA (NYSE/NASDAQ)',
  'Iceland': 'London (UK)',
  'Bahrain': 'Abu Dhabi (UAE)',
  'Malaysia': 'Singapore',
  'Dominican Republic': 'USA (NYSE/NASDAQ)',
  'Isle of Man': 'London (UK)',
  'Philippines': 'Singapore',
  'Mongolia': 'Hong Kong'
};

// Normalize country labels from API payloads so exchange/currency/globe lookups
// stay stable across case and naming variations.
const COUNTRY_ALIASES = {
  'UNITED STATES OF AMERICA': 'United States',
  'U.S.A.': 'United States',
  'US': 'United States',
  'UK': 'United Kingdom',
  'ENGLAND': 'United Kingdom',
  'GREAT BRITAIN': 'United Kingdom',
  'UAE': 'United Arab Emirates',
  'KOREA, REPUBLIC OF': 'South Korea',
  'REPUBLIC OF KOREA': 'South Korea',
  'KOREA SOUTH': 'South Korea',
  'VIET NAM': 'Vietnam',
  'CZECHIA': 'Czech Republic',
  "PEOPLES REPUBLIC OF CHINA": "China",
  'MAINLAND CHINA': 'China',
  'HONG KONG SAR': 'Hong Kong'
};

const COUNTRY_NAME_BY_UPPER = {
  ...Object.fromEntries(Object.keys(COUNTRY_COORDINATES).map(name => [name.toUpperCase(), name])),
  ...Object.fromEntries(Object.keys(EXCHANGE_DEFAULT_BY_COUNTRY).map(name => [name.toUpperCase(), name]))
};

const EXCHANGE_DEFAULT_BY_COUNTRY_UPPER = Object.fromEntries(
  Object.entries(EXCHANGE_DEFAULT_BY_COUNTRY).map(([country, exchange]) => [country.toUpperCase(), exchange])
);

const COUNTRY_ALIAS_LOOKUP = Object.fromEntries(
  Object.entries(COUNTRY_ALIASES).map(([alias, canonical]) => [alias.toUpperCase(), canonical])
);

const PRIORITY_MARKET_COUNTRIES = new Set([
  'UNITED STATES',
  'UNITED KINGDOM',
  'AUSTRALIA',
  'CANADA',
  'NEW ZEALAND',
  'IRELAND',
  'GERMANY',
  'FRANCE',
  'ITALY',
  'SPAIN',
  'NETHERLANDS',
  'BELGIUM',
  'PORTUGAL',
  'AUSTRIA',
  'FINLAND',
  'SWEDEN',
  'DENMARK',
  'NORWAY',
  'SWITZERLAND',
  'LUXEMBOURG',
  'GREECE',
  'POLAND',
  'CZECH REPUBLIC'
]);

const PRIORITY_MARKET_EXCHANGES = new Set([
  'USA (NYSE/NASDAQ)',
  'LONDON (UK)',
  'AUSTRALIA (ASX)',
  'TORONTO (CANADA)',
  'NEW ZEALAND (NZX)',
  'FRANKFURT (GERMANY)',
  'PARIS (FRANCE)',
  'AMSTERDAM (NETHERLANDS)',
  'MADRID (SPAIN)',
  'MILAN (ITALY)',
  'STOCKHOLM (SWEDEN)',
  'HELSINKI (FINLAND)',
  'COPENHAGEN (DENMARK)',
  'OSLO (NORWAY)',
  'BRUSSELS (BELGIUM)',
  'SIX (SWITZERLAND)',
  'ZURICH (SWITZERLAND)',
  'LISBON (PORTUGAL)',
  'VIENNA (AUSTRIA)',
  'WARSAW (POLAND)',
  'ATHENS (GREECE)',
  'PRAGUE (CZECH REPUBLIC)'
]);

const PRIORITY_MARKET_SUFFIXES = new Set([
  'AX', 'L', 'TO', 'V', 'NZ',
  'DE', 'PA', 'AS', 'MC', 'MI', 'ST',
  'HE', 'CO', 'OL', 'BR', 'SW', 'LS', 'VI', 'WA', 'AT', 'PR'
]);

function canonicalCountryName(country) {
  const normalized = normalizeCountryName(country);
  if (!normalized) return '';

  const upper = normalized.toUpperCase();
  const alias = COUNTRY_ALIAS_LOOKUP[upper];
  if (alias) return alias;

  return COUNTRY_NAME_BY_UPPER[upper] || normalized;
}

function canonicalCountryLookupKey(country) {
  const canonical = canonicalCountryName(country);
  return canonical ? canonical.toUpperCase() : '';
}


// Currency inference helpers for global display formatting.
// Priority in resolveCurrencyCode():
// explicit row currency -> exchange label -> ticker suffix -> country -> USD fallback.
const CURRENCY_FROM_SUFFIX = {
  AX: 'AUD',
  HK: 'HKD',
  L: 'GBP',
  PA: 'EUR',
  DE: 'EUR',
  AS: 'EUR',
  MC: 'EUR',
  MI: 'EUR',
  SW: 'CHF',
  VX: 'CHF',
  OL: 'NOK',
  ST: 'SEK',
  STO: 'SEK',
  CO: 'DKK',
  HE: 'EUR',
  WA: 'PLN',
  PR: 'CZK',
  AT: 'EUR',
  LS: 'EUR',
  BR: 'EUR',
  AE: 'AED',
  NZ: 'NZD',
  T: 'JPY',
  TYO: 'JPY',
  SI: 'SGD',
  KS: 'KRW',
  KQ: 'KRW',
  SS: 'CNY',
  SZ: 'CNY',
  BSE: 'INR',
  NSE: 'INR',
  BO: 'INR',
  NS: 'INR',
  TO: 'CAD',
  V: 'CAD',
  SA: 'BRL',
  MX: 'MXN',
  TA: 'ILS',
  JO: 'ZAR'
};

const CURRENCY_BY_COUNTRY = {
  'UNITED STATES': 'USD',
  'USA': 'USD',
  'US': 'USD',
  'UNITED KINGDOM': 'GBP',
  'AUSTRALIA': 'AUD',
  'NEW ZEALAND': 'NZD',
  'CANADA': 'CAD',
  'HONG KONG': 'HKD',
  'CHINA': 'CNY',
  'TAIWAN': 'TWD',
  'JAPAN': 'JPY',
  'SOUTH KOREA': 'KRW',
  'INDIA': 'INR',
  'SINGAPORE': 'SGD',
  'ISRAEL': 'ILS',
  'UNITED ARAB EMIRATES': 'AED',
  'SAUDI ARABIA': 'SAR',
  'QATAR': 'QAR',
  'BAHRAIN': 'BHD',
  'TURKEY': 'TRY',
  'THAILAND': 'THB',
  'MALAYSIA': 'MYR',
  'INDONESIA': 'IDR',
  'PHILIPPINES': 'PHP',
  'VIETNAM': 'VND',
  'GERMANY': 'EUR',
  'FRANCE': 'EUR',
  'ITALY': 'EUR',
  'SPAIN': 'EUR',
  'NETHERLANDS': 'EUR',
  'BELGIUM': 'EUR',
  'PORTUGAL': 'EUR',
  'IRELAND': 'EUR',
  'AUSTRIA': 'EUR',
  'FINLAND': 'EUR',
  'GREECE': 'EUR',
  'LUXEMBOURG': 'EUR',
  'CYPRUS': 'EUR',
  'MONACO': 'EUR',
  'SLOVAKIA': 'EUR',
  'SLOVENIA': 'EUR',
  'ESTONIA': 'EUR',
  'LATVIA': 'EUR',
  'LITHUANIA': 'EUR',
  'SWITZERLAND': 'CHF',
  'DENMARK': 'DKK',
  'SWEDEN': 'SEK',
  'NORWAY': 'NOK',
  'CZECH REPUBLIC': 'CZK',
  'POLAND': 'PLN',
  'MEXICO': 'MXN',
  'BRAZIL': 'BRL',
  'CHILE': 'CLP',
  'COLOMBIA': 'COP',
  'PERU': 'PEN',
  'ARGENTINA': 'ARS',
  'URUGUAY': 'UYU',
  'SOUTH AFRICA': 'ZAR',
  'KAZAKHSTAN': 'KZT',
  'ICELAND': 'ISK',
  'BERMUDA': 'BMD',
  'CAYMAN ISLANDS': 'KYD',
  'BRITISH VIRGIN ISLANDS': 'USD',
  'JERSEY': 'GBP',
  'GUERNSEY': 'GBP',
  'BAHAMAS': 'BSD',
  'PANAMA': 'USD',
  'COSTA RICA': 'CRC',
  'MACAU': 'MOP',
  'DOMINICAN REPUBLIC': 'DOP',
  'ISLE OF MAN': 'GBP',
  'MONGOLIA': 'MNT'
};

const CURRENCY_SYMBOLS = {
  USD: '$',
  GBP: 'GBP ',
  EUR: 'EUR ',
  JPY: 'JPY ',
  CNY: 'CNY ',
  HKD: 'HK$',
  KRW: 'KRW ',
  INR: 'INR ',
  CHF: 'CHF ',
  CAD: 'C$',
  AUD: 'A$',
  SEK: 'SEK ',
  NOK: 'NOK ',
  DKK: 'DKK ',
  SGD: 'S$',
  TWD: 'NT$',
  BRL: 'R$',
  ZAR: 'ZAR ',
  MXN: 'MX$',
  ILS: 'ILS ',
  PLN: 'PLN ',
  THB: 'THB ',
  MYR: 'RM',
  IDR: 'Rp',
  PHP: 'PHP ',
  TRY: 'TRY ',
  RUB: 'RUB ',
  SAR: 'SAR ',
  AED: 'AED ',
  NZD: 'NZ$',
  CLP: 'CL$',
  COP: 'COL$',
  PEN: 'S/',
  CZK: 'CZK ',
  ARS: 'AR$',
  UYU: 'UY$',
  KZT: 'KZT ',
  ISK: 'ISK ',
  BMD: 'BD$',
  KYD: 'CI$',
  BSD: 'B$',
  CRC: 'CRC ',
  MOP: 'MOP ',
  VND: 'VND ',
  BHD: 'BHD ',
  QAR: 'QAR ',
  DOP: 'RD$',
  MNT: 'MNT '
};

function normalizeCurrencyCode(value) {
  return String(value || '').trim().toUpperCase();
}

function extractTickerSuffixFromStock(stock) {
  const rawTicker = String(stock?.ticker || stock?.symbol || '').trim().toUpperCase();
  if (!rawTicker.includes('.')) return '';
  const parts = rawTicker.split('.');
  return parts[parts.length - 1] || '';
}

function currencyFromExchangeLabel(exchange) {
  const ex = normalizeExchangeLabel(exchange).toUpperCase();
  if (!ex) return '';
  if (ex.includes('NYSE') || ex.includes('NASDAQ') || ex.includes('USA')) return 'USD';
  if (ex.includes('TORONTO') || ex.includes('TSX') || ex.includes('CANADA')) return 'CAD';
  if (ex.includes('HONG KONG')) return 'HKD';
  if (ex.includes('SHANGHAI') || ex.includes('SHENZHEN') || ex === 'CHINA') return 'CNY';
  if (ex.includes('LONDON') || ex.includes('LSE')) return 'GBP';
  if (ex.includes('AUSTRALIA') || ex.includes('ASX')) return 'AUD';
  if (ex.includes('NEW ZEALAND') || ex.includes('NZX')) return 'NZD';
  if (ex.includes('TOKYO') || ex.includes('JPX')) return 'JPY';
  if (ex.includes('SINGAPORE') || ex.includes('SGX')) return 'SGD';
  if (ex.includes('INDIA') || ex.includes('NSE') || ex.includes('BSE')) return 'INR';
  if (ex.includes('BRAZIL') || ex.includes('B3') || ex.includes('SAO PAULO')) return 'BRL';
  if (ex.includes('MEXICO') || ex.includes('BMV')) return 'MXN';
  if (ex.includes('SOUTH KOREA') || ex.includes('KOREA') || ex.includes('KRX') || ex.includes('KOSPI') || ex.includes('KOSDAQ')) return 'KRW';
  if (ex.includes('TAIWAN') || ex.includes('TWSE') || ex.includes('TPEX')) return 'TWD';
  if (ex.includes('TEL AVIV') || ex.includes('TASE')) return 'ILS';
  if (ex.includes('JOHANNESBURG') || ex.includes('JSE')) return 'ZAR';
  if (
    ex.includes('FRANKFURT') ||
    ex.includes('PARIS') ||
    ex.includes('MADRID') ||
    ex.includes('MILAN') ||
    ex.includes('AMSTERDAM') ||
    ex.includes('BRUSSELS') ||
    ex.includes('HELSINKI') ||
    ex.includes('LISBON') ||
    ex.includes('ATHENS') ||
    ex.includes('VIENNA') ||
    ex.includes('EURONEXT')
  ) return 'EUR';
  if (ex.includes('COPENHAGEN')) return 'DKK';
  if (ex.includes('STOCKHOLM')) return 'SEK';
  if (ex.includes('OSLO')) return 'NOK';
  if (ex.includes('SWITZERLAND') || ex.includes('SIX') || ex.includes('ZURICH')) return 'CHF';
  if (ex.includes('WARSAW')) return 'PLN';
  if (ex.includes('PRAGUE')) return 'CZK';
  if (ex.includes('ABU DHABI') || ex.includes('DUBAI') || ex.includes('UAE')) return 'AED';
  return '';
}

function resolveCurrencyCode(stock) {
  const direct = normalizeCurrencyCode(
    stock?.currency ||
    stock?.trading_currency ||
    stock?.currency_code ||
    stock?.market_cap_currency
  );
  if (direct) return direct;

  const fromExchange = currencyFromExchangeLabel(stock?.exchange || deriveExchangeLabel(stock));
  if (fromExchange) return fromExchange;

  const suffix = extractTickerSuffixFromStock(stock);
  if (suffix && CURRENCY_FROM_SUFFIX[suffix]) return CURRENCY_FROM_SUFFIX[suffix];

  const countryKey = canonicalCountryLookupKey(stock?.country);
  if (countryKey && CURRENCY_BY_COUNTRY[countryKey]) return CURRENCY_BY_COUNTRY[countryKey];

  return 'USD';
}

function currencySymbolForStock(stock) {
  const code = resolveCurrencyCode(stock);
  return CURRENCY_SYMBOLS[code] || `${code} `;
}


function normalizeDashboardLane(value) {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'hybrid' || mode === 'blended') return mode;
  if (mode === 'stedrokgpt_pick' || mode === 'stedrokgpt-pick' || mode === 'swarm') return 'blended';
  return 'core';
}
function updateColumnHeadersForLane(mode) {
  const thMap = {
    value_score: document.querySelector('#stocksTable th[data-sort="value_score"]'),
    quality_score: document.querySelector('#stocksTable th[data-sort="quality_score"]'),
    risk_score: document.querySelector('#stocksTable th[data-sort="risk_score"]'),
    dip_score: document.querySelector('#stocksTable th[data-sort="dip_score"]'),
    confidence: document.querySelector('#stocksTable th[data-sort="confidence"]'),
  };
  if (!thMap.value_score) return;
  if (mode === 'blended') {
    if (thMap.value_score) thMap.value_score.textContent = 'Value';
    if (thMap.quality_score) thMap.quality_score.textContent = 'Quality';
    if (thMap.risk_score) thMap.risk_score.textContent = 'Risk';
    if (thMap.dip_score) thMap.dip_score.textContent = 'Dip';
    if (thMap.confidence) thMap.confidence.textContent = 'Conf.';
  } else {
    if (thMap.value_score) thMap.value_score.textContent = 'Value';
    if (thMap.quality_score) thMap.quality_score.textContent = 'Quality';
    if (thMap.risk_score) thMap.risk_score.textContent = 'Risk';
    if (thMap.dip_score) thMap.dip_score.textContent = 'Dip';
    if (thMap.confidence) thMap.confidence.textContent = 'Conf.';
  }
}


function laneEndpoint(mode) {
  if (mode === 'hybrid') return `${API_URL}/api/hybrid-picks`;
  if (mode === 'blended') return `${API_URL}/api/stedrokgpt-picks`;
  return `${API_URL}/api/picks`;
}

function laneEndpointFallbacks(mode) {
  if (mode === 'blended') {
    return [
      `${API_URL}/api/stedrokgpt-picks`,
      `${API_URL}/api/swarm-picks`
    ];
  }
  return [laneEndpoint(mode)];
}

function _escHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeBooleanFlag(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value !== 0;
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  return false;
}

function decisionPriorityScore(decision) {
  const normalized = String(decision || '').trim().toUpperCase();
  if (normalized === 'BUY') return 0;
  if (normalized === 'WATCH') return 1;
  if (normalized === 'AVOID') return 2;
  return 3;
}

function isBuyDecision(decision) {
  return decisionPriorityScore(decision) === 0;
}

function normalizePickRowShape(stock) {
  const row = stock || {};
  const ticker = String(row.ticker || row.symbol || '').trim().replace(/\s*\([^)]+\)\s*$/, '').trim().toUpperCase();
  const decision = String(row.decision || row.dominant_verdict || row.dominantVerdict || '').trim().toUpperCase();

  return {
    ...row,
    ticker,
    company_name: row.company_name || row.companyName || '',
    market_cap: toNumberOrNull(row.market_cap ?? row.marketCap ?? row.market_cap_usd),
    current_price: toNumberOrNull(row.current_price ?? row.price),
    fair_value: toNumberOrNull(row.fair_value ?? row.estimatedValue),
    discount_pct: (() => { const _d = toNumberOrNull(row.discount_pct ?? row.discountPct); if (_d == null) return _d; const _lane = String(row.selection_lane || "").toLowerCase(); const _isSwarm = _lane === "swarm"; if (_isSwarm) return _d; return Math.abs(_d) < 1 ? _d * 100 : _d; })(),
    value_score: toNumberOrNull(row.value_score ?? row.valueScore),
    quality_score: toNumberOrNull(row.quality_score ?? row.qualityScore),
    risk_score: toNumberOrNull(row.risk_score ?? row.riskScore),
    dip_score: toNumberOrNull(row.dip_score ?? row.dipScore),
    total_score: toNumberOrNull(row.total_score ?? row.totalScore),
    confidence: (() => { const _c = toNumberOrNull(row.confidence); return (_c != null && _c <= 1.5) ? _c * 100 : _c; })(),
    decision: decision || (row.decision || ''),
    is_new: normalizeBooleanFlag(row.is_new),
    swarm_score: toNumberOrNull(row.swarm_score ?? row.swarmScore),
    internet_verdict: String(row.internet_verdict || row.internetVerdict || ''),
    internet_catalyst_strength: String(row.internet_catalyst_strength || row.internetCatalystStrength || ''),
    internet_valuation_context: String(row.internet_valuation_context || row.internetValuationContext || ''),
    internet_evidence_score: toNumberOrNull(row.internet_evidence_score ?? row.internetEvidenceScore),
    net_bull: toNumberOrNull(row.net_bull ?? row.netBull),
    net_bear: toNumberOrNull(row.net_bear ?? row.netBear),
    convergence_score: toNumberOrNull(row.convergence_score ?? row.convergenceScore),
    dominant_verdict: String(row.dominant_verdict || row.dominantVerdict || ''),
    macro_regime: String(row.macro_regime || row.macroRegime || ''),
    market_impact_bps: toNumberOrNull(row.market_impact_bps ?? row.marketImpactBps),
    selection_reason: String(row.selection_reason || row.selectionReason || ''),
    scenario_breakdown: row.scenario_breakdown || row.scenarioBreakdown || null,
    archetype_breakdown: row.archetype_breakdown || row.archetypeBreakdown || null,
    external_headline: String(row.external_headline || row.externalHeadlineSample || ''),
    gemini_selected: normalizeBooleanFlag(row.gemini_selected),
    gemini_rank: toNumberOrNull(row.gemini_rank)
  };
}

function blendedRankScore(row) {
  const source = row || {};
  const totalScore = Number(source.total_score);
  if (Number.isFinite(totalScore)) return totalScore;

  const components = [
    Number(source.value_score),
    Number(source.quality_score),
    Number(source.risk_score),
    Number(source.dip_score)
  ].filter(Number.isFinite);

  if (components.length === 0) return -Infinity;
  return components.reduce((acc, value) => acc + value, 0) / components.length;
}

function mergeBlendedPicks(coreRows, hybridRows, isFreeUser) {
  const byTicker = new Map();

  const addRow = (row, lane) => {
    const normalized = normalizePickRowShape({ ...row, selection_lane: lane });
    const ticker = normalized.ticker;
    if (!ticker) return;
    if (!isBuyDecision(normalized.decision)) return;

    const existing = byTicker.get(ticker);
    if (!existing) {
      byTicker.set(ticker, normalized);
      return;
    }

    const existingScore = blendedRankScore(existing);
    const nextScore = blendedRankScore(normalized);
    const chooseNext = Number.isFinite(nextScore) && (!Number.isFinite(existingScore) || nextScore > existingScore);

    const merged = chooseNext ? { ...existing, ...normalized } : { ...normalized, ...existing };
    merged.is_new = Boolean(existing?.is_new || normalized?.is_new);
    merged.selection_lane = 'blended_shared';
    byTicker.set(ticker, merged);
  };

  (Array.isArray(coreRows) ? coreRows : []).forEach(row => addRow(row, 'core'));
  (Array.isArray(hybridRows) ? hybridRows : []).forEach(row => addRow(row, 'hybrid'));

  let merged = Array.from(byTicker.values());
  merged.sort((a, b) => {
    const geminiDelta = Number(Boolean(b?.gemini_selected)) - Number(Boolean(a?.gemini_selected));
    if (geminiDelta !== 0) return geminiDelta;
    const geminiRankDelta = (a?.gemini_rank ?? 999) - (b?.gemini_rank ?? 999);
    if (a?.gemini_selected && b?.gemini_selected && geminiRankDelta !== 0) return geminiRankDelta;
    const newDelta = Number(Boolean(b?.is_new)) - Number(Boolean(a?.is_new));
    if (newDelta !== 0) {
      return newDelta;
    }

    const scoreA = blendedRankScore(a);
    const scoreB = blendedRankScore(b);
    if (Number.isFinite(scoreA) && Number.isFinite(scoreB) && scoreA !== scoreB) {
      return scoreB - scoreA;
    }
    return String(a.ticker || '').localeCompare(String(b.ticker || ''));
  });

  if (isFreeUser) {
    merged = merged.slice(0, 3);
  } else {
    merged = merged.slice(0, 100);
  }
  return merged;
}

function setDashboardLaneToggle(mode) {
  const normalized = normalizeDashboardLane(mode);
  // Show the third-lane score column only in StedrokGPT Pick (blended) mode
  const swarmHeader = document.getElementById('thSwarmScore');
  const swarmCells = document.querySelectorAll('[data-col="swarm_score"]');
  const isSwarm = normalized === 'blended';
  if (swarmHeader) swarmHeader.style.display = isSwarm ? '' : 'none';
  swarmCells.forEach(function(td) { td.style.display = isSwarm ? '' : 'none'; });
  // Update free-user upgrade prompt colspan
  document.querySelectorAll('[data-free-colspan]').forEach(function(td) {
    td.setAttribute('colspan', isSwarm ? '15' : '14');
  });

  document.querySelectorAll('[data-dashboard-lane]').forEach(btn => {
    const lane = normalizeDashboardLane(btn.getAttribute('data-dashboard-lane'));
    const active = lane === normalized;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');

    if (active) {
      btn.style.borderColor = 'rgba(16,185,129,0.75)';
      btn.style.background = 'rgba(16,185,129,0.18)';
      btn.style.color = 'var(--text-primary)';
    } else {
      btn.style.borderColor = '';
      btn.style.background = '';
      btn.style.color = '';
    }
  });
}

function updateDashboardLaneDescription(mode) {
  const el = document.getElementById('dashboardLaneDescription');
  if (!el) return;
  const normalized = normalizeDashboardLane(mode);
  el.textContent = DASHBOARD_LANE_DESCRIPTIONS[normalized] || DASHBOARD_LANE_DESCRIPTIONS.core;
}

function bindDashboardLaneToggle(onSelect) {
  const buttons = Array.from(document.querySelectorAll('[data-dashboard-lane]'));
  buttons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const target = normalizeDashboardLane(btn.getAttribute('data-dashboard-lane'));
      if (typeof onSelect === 'function') {
        await onSelect(target);
      }
    });
  });
}

function updateDashboardLaneQuery(mode) {
  try {
    const url = new URL(window.location.href);
    const normalized = normalizeDashboardLane(mode);
    if (normalized === 'core') {
      url.searchParams.delete('lane');
    } else {
      url.searchParams.set('lane', normalized);
    }
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  } catch (e) {
    console.warn('Could not update lane query param:', e);
  }
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

function updateDashboardMachineReadableMetadata(meta, laneMode, count) {
  const normalized = normalizeDashboardLane(laneMode);
  const isoUpdated = toIsoTimestampOrEmpty(meta?.last_updated || '');

  const lastUpdatedMeta = document.getElementById('dashboardDataLastUpdatedMeta');
  if (lastUpdatedMeta) {
    lastUpdatedMeta.setAttribute('content', isoUpdated);
  }

  const laneMeta = document.getElementById('dashboardLaneMeta');
  if (laneMeta) {
    laneMeta.setAttribute('content', normalized);
  }

  if (document.body) {
    document.body.setAttribute('data-dashboard-lane', normalized);
    if (isoUpdated) {
      document.body.setAttribute('data-dashboard-last-updated-utc', isoUpdated);
    } else {
      document.body.removeAttribute('data-dashboard-last-updated-utc');
    }
  }

  const datasetScript = document.getElementById('dashboardDatasetJsonLd');
  if (!datasetScript) return;

  try {
    const payload = JSON.parse(datasetScript.textContent || '{}');
    if (isoUpdated) {
      payload.dateModified = isoUpdated;
    } else {
      delete payload.dateModified;
    }

    payload.additionalProperty = [
      {
        '@type': 'PropertyValue',
        name: 'lane',
        value: normalized
      },
      {
        '@type': 'PropertyValue',
        name: 'row_count',
        value: Number.isFinite(Number(count)) ? Number(count) : 0
      },
      {
        '@type': 'PropertyValue',
        name: 'refresh_cadence',
        value: 'At least once per trading day; usually twice per trading day.'
      }
    ];

    datasetScript.textContent = JSON.stringify(payload, null, 2);
  } catch (error) {
    console.warn('Could not update dashboard dataset JSON-LD metadata:', error);
  }
}

async function fetchLanePayload(userToken, mode, signal) {
  const headers = {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json'
  };

  async function fetchStedrokGptLocalFallback() {
    const fallbackPaths = [
      './data/stocks_stedrokgpt_pick.json',
      './data/stocks_swarm.json'
    ];

    for (const path of fallbackPaths) {
      try {
        const response = await fetch(path, { method: 'GET', signal, cache: 'no-store' });
        if (!response.ok) continue;
        const payload = await response.json();
        const picks = Array.isArray(payload?.picks)
          ? payload.picks.map(r => normalizePickRowShape({ ...r, selection_lane: 'stedrokgpt_pick' }))
          : [];
        if (picks.length === 0) continue;
        return {
          picks,
          user: { subscription_status: 'free', fallback_local: true },
          meta: {
            lane: 'blended',
            count: picks.length,
            limit: picks.length,
            last_updated: payload.generated_at_utc || payload.data_date || new Date().toISOString(),
            stedrokgpt_pick: { total_picks: payload.pickCount || picks.length },
            source: 'local_fallback'
          }
        };
      } catch (error) {
        console.warn('StedrokGPT Pick local fallback failed for', path, error);
      }
    }
    throw new Error('StedrokGPT Pick fallback unavailable');
  }

  const normalized = normalizeDashboardLane(mode);
  if (normalized === 'blended') {
    try {
      let swarmResponse = null;
      let lastStatus = null;
      for (const endpoint of laneEndpointFallbacks('blended')) {
        const response = await fetch(endpoint, { method: 'GET', headers, signal });
        if (response.ok) {
          swarmResponse = response;
          break;
        }
        lastStatus = response.status;
        if (response.status !== 404) {
          swarmResponse = response;
          break;
        }
      }
      if (!swarmResponse || !swarmResponse.ok) {
        throw new Error(`StedrokGPT Pick API returned ${lastStatus || swarmResponse?.status || 'unknown'}`);
      }
      const swarmData = await swarmResponse.json();
      const picks = (swarmData.picks || []).map(r => normalizePickRowShape({ ...r, selection_lane: 'stedrokgpt_pick' }));
      if (picks.length === 0) {
        return await fetchStedrokGptLocalFallback();
      }
      return {
        picks,
        user: swarmData.user || {},
        meta: {
          lane: 'blended',
          count: picks.length,
          limit: swarmData.meta?.limit || 50,
          last_updated: swarmData.meta?.last_updated || new Date().toISOString(),
          stedrokgpt_pick: { total_picks: swarmData.meta?.total_available || picks.length }
        }
      };
    } catch (error) {
      console.warn('StedrokGPT Pick API fetch failed, using local fallback:', error);
      return await fetchStedrokGptLocalFallback();
    }
  }

  const response = await fetch(laneEndpoint(normalized), {
    method: 'GET',
    headers,
    signal
  });

  if (!response.ok) {
    throw new Error(`API returned ${response.status}`);
  }

  return response.json();
}

async function loadDashboardLane(userToken, laneMode) {
  const normalized = normalizeDashboardLane(laneMode);
  const lastUpdatedEl = document.getElementById('lastUpdated');

  showLoading(true);
  setDashboardLaneToggle(normalized);
  updateColumnHeadersForLane(normalized);
  updateDashboardLaneDescription(normalized);
  updateDashboardLaneQuery(normalized);

  if (lastUpdatedEl) {
    lastUpdatedEl.textContent = 'Refreshing...';
  }

  // Abort any prior in-flight lane request (prevents race condition on rapid clicks)
  if (window._activeLaneController) { try { window._activeLaneController.abort(); } catch(e){} }
  window._activeLaneController = new AbortController();
  const requestController = window._activeLaneController;
  const requestTimeoutId = setTimeout(() => requestController.abort(), 12000);

  try {
    const data = await fetchLanePayload(userToken, normalized, requestController.signal);
    clearTimeout(requestTimeoutId);

    allStocks = (data?.picks || []).map(row => normalizePickRowShape({ ...row, selection_lane: row?.selection_lane || normalized }));
    allStocks = allStocks.filter(row => passesLaneGuardrails(row, normalized));
    const laneDefaultThreshold = defaultMinScoreThresholdForLane(normalized);
    allStocks = allStocks.filter(row => passesMinScoreThreshold(row, laneDefaultThreshold, normalized));
    userProfile = data?.user || {};
    const meta = data?.meta || {};

    const isFreeUser = userProfile.subscription_status === 'free';
    setTickerInsightAvailability(!isFreeUser);
    updateDashboardHeading(meta?.count, isFreeUser, normalized);
    updateDashboardMachineReadableMetadata(meta, normalized, allStocks.length);

    if (isFreeUser) {
      showFreeUserBanner(allStocks.length);
    } else {
      showPaidUserStatus(userProfile.paid_until, allStocks.length);
    }

    setupExchangeGlobe(allStocks);
    applyFilters();
    // Stat bar is updated inside applyFilters() to stay aligned with visible rows.

    const updatedText = formatDate(meta.last_updated) || 'Update time unavailable';
    if (lastUpdatedEl) {
      lastUpdatedEl.textContent = updatedText;
    }
  } catch (error) {
    clearTimeout(requestTimeoutId);
    console.error(`Failed to load ${normalized} picks:`, error);
    setTickerInsightAvailability(false);
    if (lastUpdatedEl) {
      lastUpdatedEl.textContent = 'Update temporarily unavailable';
    }
    updateDashboardMachineReadableMetadata({ last_updated: '' }, normalized, 0);
    showError(`Unable to load the ${DASHBOARD_LANE_LABELS[normalized] || 'selected'} research view. Please refresh the page.`);
  } finally {
    showLoading(false);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Ensure heading never shows stale fixed-count wording from old cached HTML.
  updateDashboardHeading(null, false);

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
  document.documentElement.dataset.dashboardTooltipsReady = 'true';
  document.dispatchEvent(new CustomEvent('stedrok:dashboard-ready'));

  const initialLane = normalizeDashboardLane(new URL(window.location.href).searchParams.get('lane'));
  currentLaneMode = initialLane;
  setDashboardLaneToggle(currentLaneMode);
  updateDashboardLaneDescription(currentLaneMode);

  bindDashboardLaneToggle(async (nextLane) => {
    const normalized = normalizeDashboardLane(nextLane);
    if (normalized === currentLaneMode) {
      return;
    }
    currentLaneMode = normalized;
    await loadDashboardLane(userToken, currentLaneMode);
  });

  await loadDashboardLane(userToken, currentLaneMode);

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
  if (isLoading) { showTableSkeleton(); }
}

function updateDashboardHeading(count, isFreeUser, laneMode = currentLaneMode) {
  const heading = document.getElementById('dashboardTitle');
  if (!heading) return;

  const lane = normalizeDashboardLane(laneMode);
  const laneLabel = DASHBOARD_LANE_LABELS[lane] || DASHBOARD_LANE_LABELS.core;
  heading.textContent = `Current Ranked Stock Coverage (${laneLabel})`;
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
        <h3 style="margin: 0 0 10px 0; color: var(--text-primary);">Free Research Access</h3>
        <p style="margin: 0 0 15px 0; color: var(--text-secondary);">
          You're viewing <strong>${count} preview rows</strong> from the current batch.
          This view reflects the latest completed batch and includes abbreviated company notes.
          Pro membership unlocks the full ranked research universe and full company research notes.
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
        <strong>Pro Membership Active</strong> - Full research coverage (${count} stocks) |
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
      <div style="background: rgba(239,68,68,0.14); border: 1px solid rgba(239,68,68,0.35); color: var(--text-primary); padding: 15px; border-radius: 8px;">
        <strong>Research feed unavailable.</strong> ${message}
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

    // Remove duplicate headline line when summary payload already embeds it.
    if (headlineNorm && norm === headlineNorm) {
      continue;
    }
    // Also remove near-duplicate headline variants with minor punctuation/case differences.
    if (headlineLooseNorm && (looseNorm === headlineLooseNorm || looseNorm.startsWith(`${headlineLooseNorm} `))) {
      continue;
    }

    // Remove repetitive "currently sits in a ... view" lead line.
    if (/currently\s+sits\s+in\s+a\s+\w+\s+view/i.test(paragraph) && i < 2) {
      continue;
    }

    // Remove stale headline-style tail lines that leak into body text.
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

function setTickerInsightAvailability(isPaidUser) {
  const hint = document.getElementById('tickerInsightHint');
  if (hint) {
    hint.style.display = 'block';
    hint.textContent = isPaidUser
      ? 'Select any symbol to open the company research note.'
      : 'Select any symbol to read the abbreviated company note. Pro includes the full research note.';
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
    : 'not available';
  const scoreText = [
    `Value ${stock.value_score != null ? stock.value_score.toFixed(0) : 'n/a'}`,
    `Quality ${stock.quality_score != null ? stock.quality_score.toFixed(0) : 'n/a'}`,
    `Risk ${stock.risk_score != null ? stock.risk_score.toFixed(0) : 'n/a'}`,
    `Dip ${stock.dip_score != null ? stock.dip_score.toFixed(0) : 'n/a'}`
  ].join(' | ');

  const valuationLine = stock.discount_pct != null && stock.discount_pct > 0
    ? `Current discount to estimated fair value is ${discountText}.`
    : `Current discount to estimated fair value is ${discountText}. Valuation is less favorable than other top picks.`;

  return {
    symbol: stock.ticker || '',
    company_name: stock.company_name || '',
    decision,
    headline: `${stock.company_name || stock.ticker} — current research status: ${decision}`,
    summary_short: `${valuationLine}`,
    news_guidance: '',
    news_theme: '',
    news_tone: '',
    primary_news_headline: '',
    updated_at_utc: stock.data_date || ''
  };
}

function normalizeTickerSummaryMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'hybrid' || mode === 'blended' || mode === 'swarm') return mode;
  if (mode === 'stedrokgpt_pick' || mode === 'stedrokgpt-pick') return 'blended';
  return 'core';
}

function resolveTickerSummaryMode(stock) {
  const selectedLane = normalizeTickerSummaryMode(stock?.selection_lane);
  const activeLane = normalizeDashboardLane(currentLaneMode);

  if (activeLane === 'hybrid') return 'hybrid';
  if (activeLane === 'core') return 'core';

  // Blended mode: ask for hybrid-first summaries when the row came from hybrid lane.
  if (selectedLane === 'hybrid' || selectedLane === 'blended') return 'hybrid';
  if (selectedLane === 'swarm' || selectedLane === 'stedrokgpt_pick') return 'blended';
  if (String(stock?.selection_lane || '').toLowerCase() === 'blended_shared') return 'blended';
  // Default for blended/swarm mode: use blended table plan (swarm→hybrid→core)
  // Swarm picks lack selection_lane; this ensures they still hit ticker_summaries_swarm
  if (activeLane === 'blended') return 'blended';
  return 'core';
}

function tickerSummaryCacheKey(ticker, mode) {
  return `${normalizeTickerSummaryMode(mode)}::${normalizeTickerKey(ticker)}`;
}

async function fetchTickerSummary(ticker, stock = null) {
  const normalizedTicker = normalizeTickerKey(ticker);
  if (!normalizedTicker) return null;

  const summaryMode = resolveTickerSummaryMode(stock);
  const cacheKey = tickerSummaryCacheKey(normalizedTicker, summaryMode);

  if (tickerSummaryCache.has(cacheKey)) {
    return tickerSummaryCache.get(cacheKey);
  }

  if (tickerSummaryInFlight.has(cacheKey)) {
    return tickerSummaryInFlight.get(cacheKey);
  }

  const fetchPromise = (async () => {
    const response = await fetch(
      `${API_URL}/api/ticker-summary?symbol=${encodeURIComponent(normalizedTicker)}&mode=${encodeURIComponent(summaryMode)}`,
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
    if (payload?.summary) {
      return {
        ...payload.summary,
        __preview: Boolean(payload.preview),
        __source_lane: payload.source_lane || summaryMode,
        __requested_mode: payload.requested_mode || summaryMode
      };
    }
    return null;
  })();

  tickerSummaryInFlight.set(cacheKey, fetchPromise);

  try {
    const summary = await fetchPromise;
    if (summary) {
      tickerSummaryCache.set(cacheKey, summary);
    }
    return summary;
  } finally {
    tickerSummaryInFlight.delete(cacheKey);
  }
}


function normalizeInsightChipValue(rawValue, fallbackValue) {
  const value = String(rawValue || '').trim();
  const lowered = value.toLowerCase();
  if (!value || lowered === 'n/a' || lowered === 'na' || lowered === 'none' || lowered === 'null' || lowered === 'undefined' || lowered === '-') {
    return fallbackValue;
  }
  return value;
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
  const decisionLabel = String(summary?.decision_display || summary?.decision || stock?.decision || 'WATCH').trim() || 'WATCH';
  const decision = decisionLabel.toUpperCase();
  const isPreview = Boolean(summary?.__preview);

  if (titleEl) titleEl.textContent = company || symbol;
  if (subheadEl) subheadEl.textContent = company ? symbol : 'Ticker detail';

  if (decisionEl) {
    decisionEl.textContent = decisionLabel;
    decisionEl.classList.remove('badge-buy', 'badge-watch', 'badge-avoid');
    decisionEl.classList.add(decisionClassFromValue(decision));
  }

  if (themeEl) {
    const value = normalizeInsightChipValue(summary?.news_theme_display || summary?.news_theme || stock?.sector, 'Sector analysis');
    themeEl.textContent = `Theme: ${value}`;
  }

  if (toneEl) {
    const value = normalizeInsightChipValue(summary?.news_tone_display || summary?.news_tone, 'data-driven');
    toneEl.textContent = `Tone: ${value}`;
  }

  if (freshnessEl) {
    const value = normalizeInsightChipValue(summary?.news_freshness_display || summary?.news_freshness || stock?.data_date, 'recent');
    freshnessEl.textContent = `Freshness: ${value}`;
  }

  if (relevanceEl) {
    const value = normalizeInsightChipValue(summary?.news_relevance_display || summary?.news_relevance, 'fundamental');
    relevanceEl.textContent = `Relevance: ${value}`;
  }

  const mcapEl = document.getElementById('tickerInsightMarketCap');
  if (mcapEl) {
    const mcapValue = Number(stock?.market_cap_usd ?? stock?.market_cap ?? 0);
    if (Number.isFinite(mcapValue) && mcapValue > 0) {
      mcapEl.textContent = 'Mkt Cap: ' + formatMarketCap(mcapValue, stock);
      mcapEl.style.display = '';
    } else {
      mcapEl.style.display = 'none';
    }
  }

  if (headlineEl) {
    headlineEl.textContent = String(summary?.headline || '').trim();
    headlineEl.style.display = headlineEl.textContent ? 'block' : 'none';
  }

  const summaryTextRaw = String(summary?.dashboard_story || summary?.summary_short || summary?.summary_300w || '').trim();
  const summaryTextFull = cleanupInsightSummary(summaryTextRaw, headlineEl?.textContent || '');
  if (summaryEl) {
    summaryEl.textContent = summaryTextFull;
    summaryEl.style.display = summaryEl.textContent ? 'block' : 'none';
  }

  if (guidanceEl) {
    const guidanceText = stripPrimaryNewsLine(String(summary?.news_guidance || '').trim());
    const summaryComparable = normalizeForComparison(summaryTextFull);
    const guidanceComparable = normalizeForComparison(guidanceText);
    const shouldShowGuidance = Boolean(guidanceText) &&
      (!guidanceComparable || !summaryComparable.includes(guidanceComparable));

    const guidanceParts = [];
    if (shouldShowGuidance) {
      guidanceParts.push(guidanceText);
    }
    if (isPreview) {
      guidanceParts.push('This access tier includes an abbreviated company note. Pro includes the full research note.');
    }
    guidanceEl.textContent = guidanceParts.filter(Boolean).join(' ');
    guidanceEl.style.display = guidanceEl.textContent ? 'block' : 'none';
  }

  if (newsHeadlineEl) {
    newsHeadlineEl.textContent = '';
    newsHeadlineEl.style.display = 'none';
  }

  if (updatedEl) {
    const updatedValue = summary?.updated_at_utc || '';
    const formatted = formatDateTime(updatedValue);
    updatedEl.textContent = formatted ? `Updated: ${formatted}` : '';
    updatedEl.style.display = formatted ? 'block' : 'none';
  }

  // StedrokGPT Pick / compatibility third-lane section
  const swarmSection = document.getElementById('swarmInsightSection');
  const swarmScoreEl = document.getElementById('swarmScoreValue');
  const swarmBase = document.getElementById('swarmChipBase');
  const swarmBull = document.getElementById('swarmChipBull');
  const swarmBear = document.getElementById('swarmChipBear');
  const swarmCrisis = document.getElementById('swarmChipCrisis');
  const swarmReasonEl = document.getElementById('swarmSelectionReason');

  const hasSwarm = stock && (stock.swarm_score != null || stock.internet_verdict);
  if (swarmSection) swarmSection.style.display = hasSwarm ? 'block' : 'none';

  if (hasSwarm) {
    if (swarmScoreEl) {
      const scoreValue = stock.swarm_score ?? (stock.internet_evidence_score != null ? stock.internet_evidence_score : null) ?? stock.quality_score;
      swarmScoreEl.textContent = Number.isFinite(Number(scoreValue)) ? Number(scoreValue).toFixed(1) : '—';
    }
    const sb = stock.scenario_breakdown || {};
    function scenarioChip(el, label, scenario) {
      if (!el) return;
      const s = sb[scenario];
      if (!s) { el.textContent = label + ' —'; return; }
      const verdict = s.verdict === 'NET_BULL' ? '↑ Bull' : s.verdict === 'NET_BEAR' ? '↓ Bear' : '→ Neutral';
      el.textContent = label + ': ' + verdict;
      el.style.color = s.verdict === 'NET_BULL' ? 'var(--accent-green)' : s.verdict === 'NET_BEAR' ? '#f87171' : '';
    }
    if (Object.keys(sb).length > 0) {
      scenarioChip(swarmBase, 'BASE', 'BASE');
      scenarioChip(swarmBull, 'BULL', 'BULL');
      scenarioChip(swarmBear, 'BEAR', 'BEAR');
      scenarioChip(swarmCrisis, 'CRISIS', 'CRISIS');
    } else {
      if (swarmBase) swarmBase.textContent = 'Verdict: ' + (stock.internet_verdict || '—');
      if (swarmBull) swarmBull.textContent = 'Catalyst: ' + (stock.internet_catalyst_strength || '—');
      if (swarmBear) {
        let valCtx = stock.internet_valuation_context || '';
        if (!valCtx && stock.discount_pct != null) {
          const dp = Number(stock.discount_pct);
          valCtx = dp >= 20 ? 'deep_value' : dp >= 10 ? 'moderate_discount' : dp >= 5 ? 'fair_value' : 'at_value';
        }
        swarmBear.textContent = 'Value: ' + (valCtx || '—');
      }
      if (swarmCrisis) {
        const evidence = stock.internet_evidence_score != null && Number.isFinite(Number(stock.internet_evidence_score)) ? Number(stock.internet_evidence_score).toFixed(1) : '—';
        swarmCrisis.textContent = 'Evidence: ' + evidence;
      }
    }
    if (swarmReasonEl) {
      const reason = stock.selection_reason || stock.selectionReason || '';
      swarmReasonEl.textContent = reason ? 'Signal: ' + reason : '';
    }
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
  populatePillarBars(stock);
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
    const summary = await fetchTickerSummary(normalizedTicker, stock);

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
    fallback.headline = 'Ticker insight is temporarily unavailable.';
    fallback.summary_short = 'The ticker insight service could not be reached. Please retry shortly.';
    renderTickerInsight(fallback, stock);
  }
}

// ============================================================
// Render stocks table
// ============================================================
function renderTable(stocks) {
  _pagedStocks = stocks;
  // Update lane label above table
  const _llEl = document.getElementById('tableLaneLabel');
  if (_llEl) {
    const _laneNames = { core: 'Core Picks', hybrid: 'Hybrid Pool', blended: 'Solid Buy Pool' };
    _llEl.textContent = _laneNames[normalizeDashboardLane(currentLaneMode)] || 'Core Picks';
    _llEl.style.display = '';
  }
  const totalPages = Math.max(1, Math.ceil(stocks.length / PAGE_SIZE));
  if (currentPage >= totalPages) currentPage = totalPages - 1;
  const pageStart = currentPage * PAGE_SIZE;
  const pageStocks = stocks.slice(pageStart, pageStart + PAGE_SIZE);
  const tbody = document.getElementById('stocksTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (stocks.length === 0) {
    renderPaginationControls(0);
    const hasActiveFilters = Boolean(
      document.getElementById('searchInput')?.value?.trim() ||
      document.getElementById('countryFilter')?.value?.trim() ||
      document.getElementById('sectorFilter')?.value?.trim() ||
      document.getElementById('minScoreFilter')?.value?.trim() ||
      document.getElementById('decisionFilter')?.value
    );
    const emptyMessage = (allStocks.length > 0 && hasActiveFilters)
      ? 'No stocks match the current filter settings. Try adjusting your search, country, sector, or rating filter.'
      : 'No research rows are available in the current batch. Please check the next scheduled refresh.';
    tbody.innerHTML = `
      <tr>
        <td colspan="15" style="text-align:center; padding:40px; color:var(--text-secondary);">
          ${emptyMessage}
        </td>
      </tr>
    `;
    return;
  }

  // Use profile subscription status, not missing fields
  const isFreeUser = userProfile && userProfile.subscription_status === 'free';

  pageStocks.forEach(stock => {
    const tr = document.createElement('tr');
    const decisionClass = decisionClassFromValue(stock.decision);
    const tickerDisplay = getTickerDisplayParts(stock);
    const _ams = stock.added_at ? new Date(stock.added_at).getTime() : 0;
    const _rec = _ams > 0 ? (Date.now() - _ams < 86400000) : true;
    const newBadgeHtml = (stock.is_new && isBuyDecision(stock.decision) && _rec) ? '<span class="badge badge-new ticker-new-badge">NEW</span>' : '';
    const geminiBadgeHtml = stock.gemini_selected ? '<span class="badge badge-ai-pick ticker-ai-badge" title="Selected by Gemini AI as a top high-conviction pick">★</span>' : '';
    const riskScore = typeof stock.risk_score === 'number' ? stock.risk_score : null;
    const riskBadgeHtml = riskScore !== null && riskScore < 40
      ? `<span class="badge badge-avoid ticker-risk-badge" title="High Risk: Risk Score ${riskScore.toFixed(0)}/100 — verify fundamentals before investing">⚠ RISK</span>`
      : riskScore !== null && riskScore < 52
      ? `<span class="badge badge-watch ticker-risk-badge" title="Moderate Risk: Risk Score ${riskScore.toFixed(0)}/100 — review risk factors before investing">⚠</span>`
      : '';

    if (isFreeUser) {
      // Free user: Show only ticker, company, country, sector, then upgrade prompt
      tr.innerHTML = `
        <td>
          <div class="ticker-cell">
            <button type="button" class="ticker-insight-trigger" data-ticker="${_escHtml(stock.ticker)}" aria-label="View preview for ${_escHtml(tickerDisplay.plain)}">
              <span class="ticker-label-main">${_escHtml(tickerDisplay.main)}</span>${tickerDisplay.secondary ? `<span class="ticker-label-secondary">(${_escHtml(tickerDisplay.secondary)})</span>` : ''}
            </button>
            ${geminiBadgeHtml}${newBadgeHtml}${riskBadgeHtml}
          </div>
        </td>
        <td>${_escHtml(stock.company_name || '-')}</td>
        <td>${_escHtml(stock.country || '-')}</td>
        <td>${_escHtml(stock.sector || '-')}</td>
        <td colspan="11" style="text-align:center; color:var(--text-secondary);">
          <a href="pricing.html" style="color:var(--accent-green); font-weight:bold;">
            Upgrade to Pro for full metrics &rarr;
          </a>
        </td>
      `;
    } else {
      const marketCapRaw = formatNumericDataValue(stock.market_cap);
      const confidenceRaw = formatNumericDataValue(stock.confidence);
      const valueRaw = formatNumericDataValue(stock.value_score);
      const qualityRaw = formatNumericDataValue(stock.quality_score);
      const riskRaw = formatNumericDataValue(stock.risk_score);
      const dipRaw = formatNumericDataValue(stock.dip_score);
      const currentPriceRaw = formatNumericDataValue(stock.current_price);
      const fairValueRaw = formatNumericDataValue(stock.fair_value);
      const discountRaw = formatNumericDataValue(stock.discount_pct);
      const discountValue = Number(stock.discount_pct);
      const discountClassName = Number.isFinite(discountValue) && discountValue > 0 ? 'positive' : 'negative';
      tr.innerHTML = `
        <td>
          <div class="ticker-cell">
            <button type="button" class="ticker-insight-trigger" data-ticker="${_escHtml(stock.ticker)}" aria-label="View insight for ${_escHtml(tickerDisplay.plain)}">
              <span class="ticker-label-main">${_escHtml(tickerDisplay.main)}</span>${tickerDisplay.secondary ? `<span class="ticker-label-secondary">(${_escHtml(tickerDisplay.secondary)})</span>` : ''}
            </button>
            ${geminiBadgeHtml}${newBadgeHtml}${riskBadgeHtml}
          </div>
        </td>
        <td class="company-cell" title="${_escHtml(stock.company_name||'')}"><span class="cell-truncate">${_escHtml(truncate(stock.company_name||'-',22))}</span></td>
        <td>${_escHtml(stock.country||'-')}</td>
        <td class="sector-cell" title="${_escHtml(stock.sector||'')}"><span class="cell-truncate">${_escHtml(truncate(stock.sector||'-',16))}</span></td>
        <td style="text-align:center;"><span class="badge ${decisionClass}">${_escHtml(stock.decision||'-')}</span></td>
        <td data-value="${marketCapRaw}">${formatMarketCap(stock.market_cap, stock)}</td>
        <td data-value="${confidenceRaw}">${stock.confidence != null ? stock.confidence.toFixed(1) + '%' : '-'}</td>
        ${scoreCell(stock.value_score)}
        ${scoreCell(stock.quality_score)}
        ${scoreCell(stock.risk_score)}
        ${scoreCell(stock.dip_score)}
        <td data-value="${currentPriceRaw}">${formatPrice(stock.current_price,stock)}</td>
        <td data-value="${fairValueRaw}">${formatPrice(stock.fair_value,stock)}</td>
        <td class="${discountClassName}" data-value="${discountRaw}">${stock.discount_pct!=null?stock.discount_pct.toFixed(1)+'%':'-'}</td>
        <td data-col="swarm_score" data-value="${formatNumericDataValue(stock.swarm_score)}" style="display:none;">
          ${stock.swarm_score != null ? stock.swarm_score.toFixed(1) : '&#8212;'}
        </td>
      `;
    }

    tbody.appendChild(tr);
  });

  renderPaginationControls(_pagedStocks.length);
  syncActiveInsightRow();
  // Refresh swarm score column visibility after rows render
  setDashboardLaneToggle(typeof currentLaneMode !== "undefined" ? currentLaneMode : "core");
}

// ============================================================
// Pagination controls (50 rows per page)
// ============================================================
function renderPaginationControls(totalCount) {
  let container = document.getElementById('dashPagination');
  if (!container) {
    const table = document.getElementById('stocksTable');
    if (!table) return;
    container = document.createElement('div');
    container.id = 'dashPagination';
    table.parentNode.insertBefore(container, table.nextSibling);
  }
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  if (totalPages <= 1) { container.innerHTML = ''; return; }
  const pageStart = currentPage * PAGE_SIZE + 1;
  const pageEnd = Math.min((currentPage + 1) * PAGE_SIZE, totalCount);
  const prevOff = currentPage === 0;
  const nextOff = currentPage >= totalPages - 1;
  container.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:center;gap:12px;' +
    'padding:14px 0;flex-wrap:wrap;">' +
    '<button onclick="goToPage(' + (currentPage - 1) + ')"' +
    (prevOff ? ' disabled' : '') +
    ' style="padding:6px 16px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);' +
    'background:rgba(255,255,255,0.06);color:var(--text-primary);' +
    'cursor:' + (prevOff ? 'not-allowed' : 'pointer') + ';' +
    'opacity:' + (prevOff ? '0.4' : '1') + ';">' +
    '\u00ab Prev</button>' +
    '<span style="color:var(--text-secondary);font-size:0.9em;">' +
    pageStart + '\u2013' + pageEnd + ' of ' + totalCount + ' stocks' +
    ' \u00b7 Page ' + (currentPage + 1) + ' of ' + totalPages +
    '</span>' +
    '<button onclick="goToPage(' + (currentPage + 1) + ')"' +
    (nextOff ? ' disabled' : '') +
    ' style="padding:6px 16px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);' +
    'background:rgba(255,255,255,0.06);color:var(--text-primary);' +
    'cursor:' + (nextOff ? 'not-allowed' : 'pointer') + ';' +
    'opacity:' + (nextOff ? '0.4' : '1') + ';">' +
    'Next \u00bb</button>' +
    '</div>';
}

function goToPage(page) {
  const totalPages = Math.max(1, Math.ceil(_pagedStocks.length / PAGE_SIZE));
  if (page < 0 || page >= totalPages) return;
  currentPage = page;
  renderTable(_pagedStocks);
  updateStatBar(_pagedStocks);
  const tableEl = document.getElementById('stocksTable');
  if (tableEl) tableEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================================================
// Export to CSV (paid users only)
// ============================================================
function exportToCSV() {
  if (!allStocks || allStocks.length === 0) {
    alert('No stocks to export');
    return;
  }

  // Check subscription status (not data-based heuristic)
  if (!userProfile || userProfile.subscription_status === 'free') {
    alert('Export is only available for Pro members');
    window.location.href = 'pricing.html';
    return;
  }

  // Generate CSV
  const headers = ['Ticker', 'Company', 'Country', 'Sector', 'Currency', 'Market Cap', 'Confidence', 'Price', 'Fair Value', 
                   'Discount %', 'Value Score', 'Quality Score', 'Risk Score', 'Dip Score', 
                   'Decision'];
  
  const rows = allStocks.map(s => [
    s.ticker,
    s.company_name,
    s.country,
    s.sector,
    resolveCurrencyCode(s),
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

  const countryKey = canonicalCountryLookupKey(stock.country);
  if (countryKey && EXCHANGE_DEFAULT_BY_COUNTRY_UPPER[countryKey]) {
    return EXCHANGE_DEFAULT_BY_COUNTRY_UPPER[countryKey];
  }

  return '';
}

function getTickerDisplayParts(stock) {
  const rawTicker = normalizeTickerKey(stock?.ticker || stock?.symbol);
  if (!rawTicker) {
    return { main: '-', secondary: '', plain: '-' };
  }

  const suffix = extractTickerSuffix(rawTicker);
  if (!suffix) {
    return { main: rawTicker, secondary: '', plain: rawTicker };
  }

  return { main: rawTicker, secondary: '', plain: rawTicker };
}

function formatTickerDisplayLabel(stock) {
  return getTickerDisplayParts(stock).plain;
}

function isPaidUserProfile() {
  return Boolean(userProfile) && String(userProfile.subscription_status || '').toLowerCase() !== 'free';
}

function isPriorityMarketStock(stock) {
  const country = canonicalCountryName(stock?.country).toUpperCase();
  if (country && PRIORITY_MARKET_COUNTRIES.has(country)) {
    return true;
  }

  const exchange = normalizeExchangeLabel(deriveExchangeLabel(stock)).toUpperCase();
  if (exchange && PRIORITY_MARKET_EXCHANGES.has(exchange)) {
    return true;
  }

  const suffix = extractTickerSuffix(stock?.ticker || stock?.symbol).toUpperCase();
  if (suffix && PRIORITY_MARKET_SUFFIXES.has(suffix)) {
    return true;
  }

  if (
    exchange.includes('NYSE') ||
    exchange.includes('NASDAQ') ||
    exchange.includes('AMEX') ||
    exchange.includes('USA')
  ) {
    return true;
  }

  return false;
}

function isChinaAffinityStock(stock) {
  const country = normalizeCountryName(stock.country).toUpperCase();
  const exchange = normalizeExchangeLabel(deriveExchangeLabel(stock)).toUpperCase();
  const suffix = extractTickerSuffix(stock.ticker || stock.symbol);

  if (country.includes('CHINA') || country.includes('HONG KONG')) {
    return true;
  }
  if (suffix === 'HK') {
    return true;
  }
  if (exchange.includes('HONG KONG')) {
    return true;
  }
  return false;
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

  const canonicalCountry = canonicalCountryName(country);
  if (canonicalCountry && COUNTRY_COORDINATES[canonicalCountry]) {
    return COUNTRY_COORDINATES[canonicalCountry];
  }
  return null;
}

function buildExchangePoints(stocks) {
  const grouped = new Map();

  stocks.forEach(stock => {
    const exchange = normalizeExchangeLabel(deriveExchangeLabel(stock));
    if (!exchange) return;

    const country = canonicalCountryName(stock.country);
    if (!grouped.has(exchange)) {
      grouped.set(exchange, {
        exchange,
        count: 0,
        countries: new Set(),
        marketCapSum: 0,
        sampleStock: null
      });
    }
    const item = grouped.get(exchange);
    item.count += 1;
    if (country) item.countries.add(country);
    if (!item.sampleStock) item.sampleStock = stock;
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
        metricLabel = `Total market cap: ${formatMarketCap(item.marketCapSum, item.sampleStock)}`;
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
  const headers = document.querySelectorAll('#stocksTable th[data-sort]');

  function updateSortIndicators() {
    headers.forEach(h => {
      const col = h.getAttribute('data-sort');
      if (col === currentSortColumn) {
        h.dataset.sortState = currentSortDirection;
        h.setAttribute('aria-sort', currentSortDirection === 'desc' ? 'descending' : 'ascending');
        h.style.color = 'var(--table-header-active, var(--accent-green))';
      } else {
        h.dataset.sortState = 'none';
        h.setAttribute('aria-sort', 'none');
        h.style.color = '';
      }
    });
  }

  function triggerSort(header) {
    const column = header.getAttribute('data-sort');

    if (currentSortColumn === column) {
      currentSortDirection = currentSortDirection === 'desc' ? 'asc' : 'desc';
    } else {
      currentSortColumn = column;
      currentSortDirection = 'desc';
    }

    updateSortIndicators();
    applyFilters();
  }

  headers.forEach(header => {
    header.style.cursor = 'pointer';
    header.setAttribute('tabindex', '0');
    header.dataset.sortState = 'none';
    header.setAttribute('aria-sort', 'none');
    header.setAttribute('aria-label', `${header.textContent.trim()} sortable column`);

    header.addEventListener('click', () => triggerSort(header));
    header.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      triggerSort(header);
    });
  });

  updateSortIndicators();
}

function getScoreValuesForFiltering(stock, laneMode = currentLaneMode) {
  const normalizedLane = normalizeDashboardLane(laneMode);
  const scores = [
    Number(stock?.value_score),
    Number(stock?.quality_score),
    Number(stock?.risk_score),
    Number(stock?.dip_score)
  ].filter(Number.isFinite);

  if (normalizedLane === 'blended') {
    const swarmScore = Number(stock?.swarm_score);
    if (Number.isFinite(swarmScore)) {
      scores.push(swarmScore);
    }
  }

  return scores;
}

function passesMinScoreThreshold(stock, threshold, laneMode = currentLaneMode) {
  if (!Number.isFinite(threshold)) return true;
  const values = getScoreValuesForFiltering(stock, laneMode);
  if (values.length === 0) return true;
  return values.every(value => value >= threshold);
}

function defaultMinScoreThresholdForLane(laneMode = currentLaneMode) {
  const normalizedLane = normalizeDashboardLane(laneMode);
  if (normalizedLane === 'core' || normalizedLane === 'hybrid' || normalizedLane === 'blended') return Number.NaN;
  return DEFAULT_MIN_SCORE_THRESHOLD_BY_LANE[normalizedLane] ?? Number.NaN;
}

function passesLaneGuardrails(stock, laneMode = currentLaneMode) {
  const normalizedLane = normalizeDashboardLane(laneMode);
  if (normalizedLane === 'core' || normalizedLane === 'hybrid' || normalizedLane === 'blended') return true;
  const laneGuardrails = DEFAULT_LANE_GUARDRAILS[normalizedLane];
  if (!laneGuardrails) return true;

  return Object.entries(laneGuardrails).every(([metric, threshold]) => {
    const value = Number(stock?.[metric]);
    return Number.isFinite(value) && value >= threshold;
  });
}

function marketRegionRank(stock) {
  const country = canonicalCountryName(stock?.country).toUpperCase();
  const exchange = normalizeExchangeLabel(deriveExchangeLabel(stock)).toUpperCase();
  const suffix = extractTickerSuffix(stock?.ticker || stock?.symbol).toUpperCase();

  const isUsCountry = country === 'UNITED STATES' || country === 'USA' || country === 'US';
  const isUsExchange =
    exchange.includes('NYSE') ||
    exchange.includes('NASDAQ') ||
    exchange.includes('AMEX') ||
    exchange.includes('USA');
  if (isUsCountry || isUsExchange) return 0;

  const isUkCountry = country === 'UNITED KINGDOM';
  const isUkExchange = exchange.includes('LONDON') || exchange.includes('LSE') || exchange.includes('(UK)');
  if (isUkCountry || isUkExchange || suffix === 'L') return 1;

  const isEuropeExchange = /FRANKFURT|PARIS|AMSTERDAM|MADRID|MILAN|STOCKHOLM|HELSINKI|COPENHAGEN|OSLO|BRUSSELS|SWITZERLAND|ZURICH|LISBON|VIENNA|WARSAW|ATHENS|PRAGUE|EURONEXT|XETRA|SIX/.test(exchange);
  if (EUROPE_REGION_COUNTRIES.has(country) || isEuropeExchange) return 2;

  const isAustralia = country === 'AUSTRALIA' || exchange.includes('ASX') || exchange.includes('AUSTRALIA') || suffix === 'AX';
  if (isAustralia) return 3;

  const isJapan = country === 'JAPAN' || exchange.includes('TOKYO') || exchange.includes('JPX') || suffix === 'T';
  if (isJapan) return 4;

  const isDevelopedExchange =
    exchange.includes('TORONTO') ||
    exchange.includes('TSX') ||
    exchange.includes('CANADA') ||
    exchange.includes('NEW ZEALAND') ||
    exchange.includes('NZX') ||
    exchange.includes('SINGAPORE') ||
    exchange.includes('SOUTH KOREA') ||
    exchange.includes('TAIWAN') ||
    exchange.includes('HONG KONG') ||
    exchange.includes('TEL AVIV');
  if (DEVELOPED_REGION_COUNTRIES.has(country) || isDevelopedExchange) return 5;

  return 6;
}

function applyFilters() {
  let filtered = [...allStocks];
  const enforceChinaBottomForPaid = isPaidUserProfile() && normalizeDashboardLane(currentLaneMode) === 'core';

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

  // Enforce lane-specific quality guardrails before user-adjustable score floor.
  filtered = filtered.filter(s => passesLaneGuardrails(s, currentLaneMode));

  // Apply minimum score filter across all score columns with a default floor.
  const minScoreRaw = document.getElementById('minScoreFilter')?.value;
  const hasCustomMinScore = String(minScoreRaw ?? '').trim() !== '' && !Number.isNaN(Number(minScoreRaw));
  const customMinScore = hasCustomMinScore ? Number(minScoreRaw) : null;
  const laneDefaultThreshold = defaultMinScoreThresholdForLane(currentLaneMode);
  const scoreThreshold = hasCustomMinScore
    ? (Number.isFinite(laneDefaultThreshold) ? Math.max(laneDefaultThreshold, customMinScore) : customMinScore)
    : laneDefaultThreshold;

  filtered = filtered.filter(s => passesMinScoreThreshold(s, scoreThreshold, currentLaneMode));

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
    // Region prioritization: USA -> UK -> Europe -> Australia for ALL lanes
    const regionDelta = marketRegionRank(a) - marketRegionRank(b);
    if (regionDelta !== 0) return regionDelta;

    // Within same region: sort by market cap descending
    const mcA = Number(a?.market_cap_usd ?? a?.market_cap ?? 0) || 0;
    const mcB = Number(b?.market_cap_usd ?? b?.market_cap ?? 0) || 0;
    if (mcA !== mcB && mcA > 0 && mcB > 0) return mcB - mcA;

    const decisionDelta = decisionPriorityScore(a?.decision) - decisionPriorityScore(b?.decision);
    if (decisionDelta !== 0) {
      return decisionDelta;
    }

    const geminiDelta = Number(Boolean(b?.gemini_selected)) - Number(Boolean(a?.gemini_selected));
    if (geminiDelta !== 0) return geminiDelta;
    const geminiRankDelta = (a?.gemini_rank ?? 999) - (b?.gemini_rank ?? 999);
    if (a?.gemini_selected && b?.gemini_selected && geminiRankDelta !== 0) return geminiRankDelta;

    // Keep NEW within the same market bucket only.
    const newDelta = Number(Boolean(b?.is_new)) - Number(Boolean(a?.is_new));
    if (newDelta !== 0) {
      return newDelta;
    }

    if (enforceChinaBottomForPaid) {
      const aChina = isChinaAffinityStock(a);
      const bChina = isChinaAffinityStock(b);
      if (aChina !== bChina) {
        return aChina ? 1 : -1;
      }
    }

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

  currentPage = 0;
  renderTable(filtered);
  updateStatBar(filtered);
}

// ============================================================
// Utility: Format market cap
// ============================================================
function formatMarketCap(value, stock = null) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  const symbol = currencySymbolForStock(stock);
  if (numeric === 0) return `${symbol}0`;

  const absValue = Math.abs(numeric);
  if (absValue >= 1e12) {
    return symbol + (numeric / 1e12).toFixed(2) + 'T';
  }
  if (absValue >= 1e9) {
    return symbol + (numeric / 1e9).toFixed(2) + 'B';
  }
  if (absValue >= 1e6) {
    return symbol + (numeric / 1e6).toFixed(2) + 'M';
  }
  return symbol + numeric.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatPrice(value, stock = null) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  const symbol = currencySymbolForStock(stock);
  return `${symbol}${numeric.toFixed(2)}`;
}

// ============================================================
// Utility: Format date
// ============================================================
function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}
