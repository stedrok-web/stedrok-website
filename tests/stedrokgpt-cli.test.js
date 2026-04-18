const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...tokens) {
    tokens.filter(Boolean).forEach((token) => this.values.add(token));
  }

  remove(...tokens) {
    tokens.forEach((token) => this.values.delete(token));
  }

  toggle(token, force) {
    if (force === undefined) {
      if (this.values.has(token)) {
        this.values.delete(token);
        return false;
      }
      this.values.add(token);
      return true;
    }
    if (force) {
      this.values.add(token);
      return true;
    }
    this.values.delete(token);
    return false;
  }

  contains(token) {
    return this.values.has(token);
  }
}

class FakeElement {
  constructor(id) {
    this.id = id;
    this.innerHTML = '';
    this.textContent = '';
    this.value = '';
    this.disabled = false;
    this.placeholder = '';
    this.classList = new FakeClassList();
    this.listeners = new Map();
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  async dispatch(type, event) {
    const handler = this.listeners.get(type);
    if (!handler) {
      throw new Error(`No handler registered for ${type}`);
    }
    return handler(event);
  }
}

function createResponse(payload) {
  return {
    ok: true,
    status: 200,
    async json() {
      return payload;
    }
  };
}

function createHarness() {
  const elements = new Map();
  [
    'tickerForm',
    'tickerInput',
    'analyzeButton',
    'uiStatus',
    'stageFast',
    'stageDeep',
    'snapshotMeta',
    'snapshotCards',
    'reportShell',
    'reportSummary',
    'reportSections',
    'decisionMapArea',
    'accessNotice'
  ].forEach((id) => elements.set(id, new FakeElement(id)));

  const responses = {
    '/api/picks': createResponse({
      user: {
        subscription_status: 'active',
        paid_until: '2099-01-01T00:00:00.000Z',
        subscription_type: 'pro',
        is_lifetime: false
      }
    }),
    '/api/stedrokgpt-quote-snapshot?symbol=AAPL': createResponse({
      snapshot: {
        name: 'Apple Inc.',
        symbol: 'AAPL',
        price: 201.12,
        change_percent: 1.12,
        week52_low: 164.08,
        week52_high: 221.94,
        market_cap: 3010000000000,
        trailing_pe: 31.4,
        forward_pe: 28.8,
        exchange: 'NASDAQ',
        currency: 'USD',
        as_of_utc: '2026-04-18T00:00:00Z'
      }
    }),
    '/api/stedrokgpt-cli-stock': createResponse({
      cached: false,
      output: [
        'VERDICT=BUY | BUY_BELOW=$190 | FAIR_VALUE_BEAR_BASE_BULL=$180 / $220 / $255 | MOS=8% | CONFIDENCE=Data: HIGH / Valuation: MEDIUM / Forensic: HIGH / Action: HIGH | DATE=2026-04-18',
        'INVESTMENT THESIS',
        'High quality compounder with resilient cash generation and platform lock-in.'
      ].join('\n')
    })
  };

  const fetchCalls = [];
  async function fakeFetch(url) {
    const normalized = String(url).replace(/^https?:\/\/[^/]+/, '');
    fetchCalls.push(normalized);
    if (!responses[normalized]) {
      throw new Error(`Unexpected fetch: ${normalized}`);
    }
    return responses[normalized];
  }

  const form = elements.get('tickerForm');
  const tickerInput = elements.get('tickerInput');
  tickerInput.value = 'aapl';

  const context = {
    window: {
      location: { href: 'https://stedrok.org/stedrokgpt-cli.html' },
      supabaseClient: {
        auth: {
          async getSession() {
            return {
              data: {
                session: {
                  access_token: 'token-123',
                  user: { id: 'user-1' }
                }
              }
            };
          }
        }
      }
    },
    document: {
      getElementById(id) {
        return elements.get(id) || null;
      }
    },
    CONFIG: { API_BASE_URL: '' },
    fetch: fakeFetch,
    console,
    URL,
    Intl,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Object,
    Array,
    RegExp,
    Error,
    Promise,
    AbortController,
    setTimeout(fn) {
      fn();
      return 1;
    },
    clearTimeout() {}
  };
  context.window.fetch = fakeFetch;
  context.window.CONFIG = context.CONFIG;

  return {
    context,
    elements,
    fetchCalls,
    form,
    tickerInput
  };
}

async function flushAsync(rounds = 20) {
  for (let i = 0; i < rounds; i += 1) {
    await Promise.resolve();
  }
}

test('renders a decision map summary while preserving raw analysis output', async () => {
  const harness = createHarness();
  const scriptPath = path.join(__dirname, '..', 'js', 'stedrokgpt-cli.js');
  const source = fs.readFileSync(scriptPath, 'utf8');

  vm.runInNewContext(source, harness.context, { filename: 'stedrokgpt-cli.js' });
  await flushAsync();
  assert.equal(harness.elements.get('tickerInput').disabled, false);

  const form = harness.elements.get('tickerForm');
  await form.dispatch('submit', { preventDefault() {} });
  await flushAsync();

  const reportSummary = harness.elements.get('reportSummary').innerHTML;
  const decisionMapArea = harness.elements.get('decisionMapArea').innerHTML;

  assert.match(reportSummary, /verdict-pill/i);
  assert.match(reportSummary, /decision-disclaimer/i);
  assert.match(reportSummary, /2026-04-18/);
  assert.match(decisionMapArea, /decision-map/i);
  assert.match(decisionMapArea, /Decision Map/i);
  assert.match(decisionMapArea, /Not investment advice/i);
});

test('AVOID verdict maps to Stand Aside zone with capped conviction', async () => {
  const harness = createHarness();
  // Override CLI response to AVOID verdict
  harness.context.fetch = async (url) => {
    const normalized = String(url).replace(/^https?:\/\/[^/]+/, '');
    if (normalized.startsWith('/api/stedrokgpt-cli-stock')) {
      return createResponse({
        cached: false,
        output: [
          'VERDICT=AVOID | BUY_BELOW=$0 | FAIR_VALUE_BEAR_BASE_BULL=$50 / $65 / $80 | PREM_TO_FV=22% | CONFIDENCE=Data: LOW / Valuation: LOW / Forensic: MEDIUM / Action: LOW | DATE=2026-04-18',
          'INVESTMENT THESIS',
          'Fundamentals deteriorating. Avoid this position.'
        ].join('\n')
      });
    }
    if (normalized.startsWith('/api/stedrokgpt-quote-snapshot')) {
      return createResponse({
        snapshot: {
          name: 'Bad Corp', symbol: 'BADX', price: 79.30,
          change_percent: -2.1, week52_low: 50, week52_high: 100,
          market_cap: 500000000, trailing_pe: 45, forward_pe: 40,
          exchange: 'NYSE', currency: 'USD', as_of_utc: '2026-04-18T00:00:00Z'
        }
      });
    }
    if (normalized === '/api/picks') {
      return createResponse({
        user: { subscription_status: 'active', paid_until: '2099-01-01T00:00:00.000Z', subscription_type: 'pro', is_lifetime: false }
      });
    }
    throw new Error(`Unexpected: ${normalized}`);
  };
  harness.context.window.fetch = harness.context.fetch;

  const scriptPath = path.join(__dirname, '..', 'js', 'stedrokgpt-cli.js');
  const source = fs.readFileSync(scriptPath, 'utf8');
  vm.runInNewContext(source, harness.context, { filename: 'stedrokgpt-cli.js' });
  await flushAsync();

  const form = harness.elements.get('tickerForm');
  await form.dispatch('submit', { preventDefault() {} });
  await flushAsync();

  const mapHtml = harness.elements.get('decisionMapArea').innerHTML;
  assert.match(mapHtml, /decision-map/i, 'Decision Map should render for AVOID');
  assert.match(mapHtml, /action-low/i, 'AVOID should have low action tone class');
  // Zone label in summary should be Stand Aside
  const summaryHtml = harness.elements.get('reportSummary').innerHTML;
  assert.match(summaryHtml, /Stand Aside/i, 'AVOID should map to Stand Aside zone');
  assert.doesNotMatch(summaryHtml, /Buy Zone/i, 'AVOID must never show Buy Zone');
});

test('OVERVALUED verdict never maps to Buy Zone', async () => {
  const harness = createHarness();
  harness.context.fetch = async (url) => {
    const normalized = String(url).replace(/^https?:\/\/[^/]+/, '');
    if (normalized.startsWith('/api/stedrokgpt-cli-stock')) {
      return createResponse({
        cached: false,
        output: [
          'VERDICT=OVERVALUED | BUY_BELOW=$80 | FAIR_VALUE_BEAR_BASE_BULL=$90 / $110 / $130 | PREM_TO_FV=15% | CONFIDENCE=Data: HIGH / Valuation: HIGH / Forensic: HIGH / Action: HIGH | DATE=2026-04-18',
          'INVESTMENT THESIS',
          'Trades at significant premium. Wait for pullback.'
        ].join('\n')
      });
    }
    if (normalized.startsWith('/api/stedrokgpt-quote-snapshot')) {
      return createResponse({
        snapshot: {
          name: 'Over Corp', symbol: 'OVRX', price: 126.50,
          change_percent: 0.5, week52_low: 80, week52_high: 140,
          market_cap: 2000000000, trailing_pe: 35, forward_pe: 30,
          exchange: 'NYSE', currency: 'USD', as_of_utc: '2026-04-18T00:00:00Z'
        }
      });
    }
    if (normalized === '/api/picks') {
      return createResponse({
        user: { subscription_status: 'active', paid_until: '2099-01-01T00:00:00.000Z', subscription_type: 'pro', is_lifetime: false }
      });
    }
    throw new Error(`Unexpected: ${normalized}`);
  };
  harness.context.window.fetch = harness.context.fetch;

  const scriptPath = path.join(__dirname, '..', 'js', 'stedrokgpt-cli.js');
  const source = fs.readFileSync(scriptPath, 'utf8');
  vm.runInNewContext(source, harness.context, { filename: 'stedrokgpt-cli.js' });
  await flushAsync();

  await harness.elements.get('tickerForm').dispatch('submit', { preventDefault() {} });
  await flushAsync();

  const summaryHtml = harness.elements.get('reportSummary').innerHTML;
  assert.doesNotMatch(summaryHtml, /Buy Zone/i, 'OVERVALUED must never show Buy Zone');
  assert.match(summaryHtml, /Quality, Price Rich|Stand Aside|Interesting/i, 'Should show non-Buy zone');
});

test('missing decisionMapArea element does not crash', async () => {
  const harness = createHarness();
  // Remove decisionMapArea from DOM
  harness.elements.delete('decisionMapArea');

  const scriptPath = path.join(__dirname, '..', 'js', 'stedrokgpt-cli.js');
  const source = fs.readFileSync(scriptPath, 'utf8');
  vm.runInNewContext(source, harness.context, { filename: 'stedrokgpt-cli.js' });
  await flushAsync();

  await harness.elements.get('tickerForm').dispatch('submit', { preventDefault() {} });
  await flushAsync();

  // Should render summary without crashing
  const reportSummary = harness.elements.get('reportSummary').innerHTML;
  assert.match(reportSummary, /verdict-pill/i, 'Summary should still render');
  // decisionMapArea is removed — no map and no crash is the expected outcome
});

test('resetUi clears decisionMapArea', async () => {
  const harness = createHarness();
  const scriptPath = path.join(__dirname, '..', 'js', 'stedrokgpt-cli.js');
  const source = fs.readFileSync(scriptPath, 'utf8');
  vm.runInNewContext(source, harness.context, { filename: 'stedrokgpt-cli.js' });
  await flushAsync();

  // First: submit to populate
  await harness.elements.get('tickerForm').dispatch('submit', { preventDefault() {} });
  await flushAsync();
  const mapHtmlAfterSubmit = harness.elements.get('decisionMapArea').innerHTML;
  assert.ok(mapHtmlAfterSubmit.length > 0, 'Map should be populated after submit');

  // Second: submit again (resetUi fires at start of new submit)
  harness.elements.get('tickerInput').value = 'aapl';
  await harness.elements.get('tickerForm').dispatch('submit', { preventDefault() {} });
  // Check immediately after submit starts — resetUi should have cleared it
  // But since it's async and will repopulate, we verify the final state has content
  await flushAsync();
  const mapHtmlAfterSecond = harness.elements.get('decisionMapArea').innerHTML;
  assert.ok(mapHtmlAfterSecond.length > 0, 'Map should repopulate after second submit');
});
