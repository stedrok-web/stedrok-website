/**
 * Decision Map – 50-stock scoring pipeline test suite
 *
 * Validates buildDecisionMapModel() against 50 diverse stock scenarios
 * covering all verdict types, confidence mixes, MOS/Premium ranges,
 * and edge cases.
 *
 * Functions below are extracted verbatim from js/stedrokgpt-cli.js (IIFE)
 * so they can be unit-tested directly without the full DOM harness.
 *
 * Runner: node --test tests/decision-map-50stocks.test.js
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

/* ================================================================== */
/*  EXTRACTED FUNCTIONS (from js/stedrokgpt-cli.js)                    */
/* ================================================================== */

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value), min), max);
}

function confidenceToneToScore(tone) {
  if (tone === 'high') return 84;
  if (tone === 'medium') return 63;
  if (tone === 'low') return 38;
  return 52;
}

function findConfidenceChip(chips, label) {
  const wanted = String(label || '').trim().toLowerCase();
  return (chips || []).find(function (chip) {
    return String(chip?.label || '').trim().toLowerCase() === wanted;
  }) || null;
}

function parsePercentNumber(text) {
  const match = String(text || '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function scoreToActionTone(score) {
  if (score >= 75) return 'high';
  if (score >= 58) return 'medium';
  return 'low';
}

function scoreToDescriptor(score, labels) {
  if (score >= 75) return labels.high;
  if (score >= 58) return labels.medium;
  return labels.low;
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

function getDecisionZoneLabel(rewardScore, convictionScore, tone) {
  if (tone === 'avoid') return 'Stand Aside';
  if (tone === 'overvalued' && rewardScore >= 60) return 'Quality, Price Rich';
  if (rewardScore >= 60 && convictionScore >= 65) return 'Buy Zone';
  if (rewardScore < 60 && convictionScore >= 65) return 'Quality, Price Rich';
  if (rewardScore >= 60 && convictionScore < 65) return 'Interesting, Needs Proof';
  return 'Stand Aside';
}

function buildDecisionMapModel(verdict, confidenceChips) {
  const tone = getVerdictTone(verdict.verdict);
  const hasAnyChip = Array.isArray(confidenceChips) && confidenceChips.length > 0;
  const dataScore = confidenceToneToScore(findConfidenceChip(confidenceChips, 'Data')?.tone);
  const valuationScore = confidenceToneToScore(findConfidenceChip(confidenceChips, 'Valuation')?.tone);
  const forensicScore = confidenceToneToScore(findConfidenceChip(confidenceChips, 'Forensic')?.tone);
  const actionBaseScore = confidenceToneToScore(findConfidenceChip(confidenceChips, 'Action')?.tone);
  const percentValue = parsePercentNumber(verdict.premiumOrMosValue);
  const dataIncomplete = !hasAnyChip;

  let rewardScore = 55;
  if (Number.isFinite(percentValue)) {
    if (/premium/i.test(verdict.premiumOrMosLabel)) {
      rewardScore = 50 - (Math.sign(percentValue) * Math.min(Math.abs(percentValue), 30) * 1.35);
    } else {
      rewardScore = 50 + (Math.sign(percentValue) * Math.min(Math.abs(percentValue), 30) * 1.35);
    }
  } else if (tone === 'buy') {
    rewardScore = 72;
  } else if (tone === 'overvalued') {
    rewardScore = 38;
  } else if (tone === 'avoid') {
    rewardScore = 32;
  } else if (tone === 'hold') {
    rewardScore = 58;
  } else if (tone === 'watch') {
    rewardScore = 54;
  }
  rewardScore = clamp(Math.round(rewardScore), 10, 92);

  let convictionScore = clamp(Math.round(
    (dataScore * 0.34) + (forensicScore * 0.34) + (valuationScore * 0.18) + (actionBaseScore * 0.14)
  ), 18, 96);
  if (tone === 'avoid') convictionScore = Math.min(convictionScore, 55);

  const uncertaintyScore = clamp(Math.round(
    100 - ((dataScore * 0.4) + (forensicScore * 0.4) + (valuationScore * 0.2))
  ), 12, 88);

  let actionScore = actionBaseScore;
  if (tone === 'avoid') actionScore = Math.min(actionScore, 42);
  if (tone === 'overvalued' || tone === 'watch') actionScore = Math.min(actionScore, 64);
  if (tone === 'buy') actionScore = Math.max(actionScore, 72);
  actionScore = clamp(Math.round(actionScore), 16, 94);

  const actionTone = scoreToActionTone(actionScore);
  const bubbleSize = clamp(Math.round(74 + (uncertaintyScore * 0.62)), 82, 128);
  const zoneLabel = getDecisionZoneLabel(rewardScore, convictionScore, tone);
  const zonePositionMap = {
    'Buy Zone': 'zone-top-right',
    'Quality, Price Rich': 'zone-top-left',
    'Interesting, Needs Proof': 'zone-bottom-right',
    'Stand Aside': 'zone-bottom-left'
  };
  const zonePosition = zonePositionMap[zoneLabel] || 'zone-bottom-left';

  return {
    rewardScore, convictionScore, uncertaintyScore, actionScore,
    actionTone, bubbleSize, zoneLabel, zonePosition, dataIncomplete,
    xPosition: `${clamp(rewardScore, 10, 92)}%`,
    yPosition: `${clamp(convictionScore, 14, 94)}%`
  };
}

/* ================================================================== */
/*  HELPERS                                                            */
/* ================================================================== */

const VALID_ZONES = ['Buy Zone', 'Quality, Price Rich', 'Interesting, Needs Proof', 'Stand Aside'];
const VALID_ACTION_TONES = ['high', 'medium', 'low'];

/** Build a confidence-chip array from a shorthand object. */
function chips(obj) {
  // obj: { Data: 'high', Valuation: 'medium', Forensic: 'low', Action: 'high' }
  // Any key set to null/undefined is omitted (simulates missing chip).
  return Object.entries(obj)
    .filter(([, tone]) => tone != null)
    .map(([label, tone]) => ({ label, tone: String(tone).toLowerCase() }));
}

/** Build a verdict object from shorthand args. */
function vobj(verdict, mosOrPrem, value) {
  const result = { verdict };
  if (mosOrPrem === 'MOS') {
    result.premiumOrMosLabel = 'MOS (Margin of Safety)';
    result.premiumOrMosValue = value;
  } else if (mosOrPrem === 'PREM') {
    result.premiumOrMosLabel = 'Premium to FV';
    result.premiumOrMosValue = value;
  } else {
    result.premiumOrMosLabel = '';
    result.premiumOrMosValue = '';
  }
  return result;
}

/** Standard assertions applied to every single stock model. */
function assertModelValid(model, ticker) {
  const tag = `[${ticker}]`;

  // 1. rewardScore in [10, 92], not NaN
  assert.ok(Number.isFinite(model.rewardScore), `${tag} rewardScore is finite`);
  assert.ok(model.rewardScore >= 10 && model.rewardScore <= 92,
    `${tag} rewardScore ${model.rewardScore} in [10,92]`);

  // 2. convictionScore in [18, 96]
  assert.ok(Number.isFinite(model.convictionScore), `${tag} convictionScore is finite`);
  assert.ok(model.convictionScore >= 18 && model.convictionScore <= 96,
    `${tag} convictionScore ${model.convictionScore} in [18,96]`);

  // 3. uncertaintyScore in [12, 88]
  assert.ok(Number.isFinite(model.uncertaintyScore), `${tag} uncertaintyScore is finite`);
  assert.ok(model.uncertaintyScore >= 12 && model.uncertaintyScore <= 88,
    `${tag} uncertaintyScore ${model.uncertaintyScore} in [12,88]`);

  // 4. actionScore in [16, 94]
  assert.ok(Number.isFinite(model.actionScore), `${tag} actionScore is finite`);
  assert.ok(model.actionScore >= 16 && model.actionScore <= 94,
    `${tag} actionScore ${model.actionScore} in [16,94]`);

  // 5. bubbleSize in [82, 128]
  assert.ok(model.bubbleSize >= 82 && model.bubbleSize <= 128,
    `${tag} bubbleSize ${model.bubbleSize} in [82,128]`);

  // 6. zoneLabel is valid
  assert.ok(VALID_ZONES.includes(model.zoneLabel),
    `${tag} zoneLabel "${model.zoneLabel}" is valid`);

  // 7-8. position format
  assert.match(model.xPosition, /^\d+%$/, `${tag} xPosition format`);
  assert.match(model.yPosition, /^\d+%$/, `${tag} yPosition format`);

  // 17. actionTone is valid
  assert.ok(VALID_ACTION_TONES.includes(model.actionTone),
    `${tag} actionTone "${model.actionTone}" is valid`);
}

/* ================================================================== */
/*  50 STOCK SCENARIOS                                                 */
/* ================================================================== */

const STOCKS = [
  // ── BUY verdicts (20) ─────────────────────────────────────────────
  {
    ticker: 'MSFT', verdict: 'BUY', mosOrPrem: 'MOS', value: '8%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'high' }
  },
  {
    ticker: 'GILD', verdict: 'BUY', mosOrPrem: 'MOS', value: '15%',
    conf: { Data: 'high', Valuation: 'high', Forensic: 'medium', Action: 'high' }
  },
  {
    ticker: 'QCOM', verdict: 'BUY', mosOrPrem: 'MOS', value: '22%',
    conf: { Data: 'high', Valuation: 'high', Forensic: 'high', Action: 'high' }
  },
  {
    ticker: 'ADBE', verdict: 'BUY', mosOrPrem: 'MOS', value: '5%',
    conf: { Data: 'medium', Valuation: 'medium', Forensic: 'high', Action: 'medium' }
  },
  {
    ticker: 'PYPL', verdict: 'BUY', mosOrPrem: 'MOS', value: '12%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'medium', Action: 'high' }
  },
  {
    ticker: 'RMD.AX', verdict: 'BUY', mosOrPrem: 'MOS', value: '18%',
    conf: { Data: 'high', Valuation: 'high', Forensic: 'high', Action: 'medium' }
  },
  {
    ticker: 'A', verdict: 'BUY', mosOrPrem: 'MOS', value: '3%',
    conf: { Data: 'medium', Valuation: 'low', Forensic: 'high', Action: 'medium' }
  },
  {
    ticker: 'VEEV', verdict: 'BUY', mosOrPrem: 'MOS', value: '25%',
    conf: { Data: 'high', Valuation: 'high', Forensic: 'high', Action: 'high' }
  },
  {
    ticker: 'DXCM', verdict: 'BUY', mosOrPrem: 'MOS', value: '10%',
    conf: { Data: 'medium', Valuation: 'medium', Forensic: 'medium', Action: 'medium' }
  },
  {
    ticker: 'EXE', verdict: 'BUY', mosOrPrem: 'MOS', value: '7%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'high' }
  },
  {
    ticker: 'FSLR', verdict: 'BUY', mosOrPrem: 'MOS', value: '30%',
    conf: { Data: 'high', Valuation: 'high', Forensic: 'medium', Action: 'high' }
  },
  {
    ticker: 'PTC', verdict: 'BUY', mosOrPrem: 'MOS', value: '2%',
    conf: { Data: 'medium', Valuation: 'medium', Forensic: 'medium', Action: 'low' }
  },
  {
    ticker: 'UHS', verdict: 'BUY', mosOrPrem: 'MOS', value: '14%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'medium' }
  },
  {
    ticker: 'JKHY', verdict: 'BUY', mosOrPrem: 'MOS', value: '6%',
    conf: { Data: 'medium', Valuation: 'high', Forensic: 'medium', Action: 'high' }
  },
  {
    ticker: 'PEGA', verdict: 'BUY', mosOrPrem: 'MOS', value: '20%',
    conf: { Data: 'high', Valuation: 'high', Forensic: 'high', Action: 'medium' }
  },
  {
    ticker: 'DOX', verdict: 'BUY', mosOrPrem: 'MOS', value: '11%',
    conf: { Data: 'medium', Valuation: 'medium', Forensic: 'high', Action: 'high' }
  },
  {
    ticker: 'HQY', verdict: 'BUY', mosOrPrem: 'MOS', value: '45%',
    conf: { Data: 'high', Valuation: 'high', Forensic: 'high', Action: 'high' }
  },
  {
    ticker: 'GNTX', verdict: 'BUY', mosOrPrem: 'MOS', value: '9%',
    conf: { Data: 'high', Valuation: 'low', Forensic: 'high', Action: 'medium' }
  },
  {
    ticker: 'ABX.TO', verdict: 'BUY', mosOrPrem: 'MOS', value: '16%',
    conf: { Data: 'medium', Valuation: 'high', Forensic: 'medium', Action: 'medium' }
  },
  {
    ticker: 'IAG', verdict: 'BUY', mosOrPrem: 'MOS', value: '35%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'high' }
  },

  // ── WATCH verdicts (8) ────────────────────────────────────────────
  {
    ticker: 'OLED', verdict: 'WATCH', mosOrPrem: 'MOS', value: '4%',
    conf: { Data: 'medium', Valuation: 'low', Forensic: 'medium', Action: 'low' }
  },
  {
    ticker: 'ANF', verdict: 'WATCH', mosOrPrem: 'PREM', value: '3%',
    conf: { Data: 'medium', Valuation: 'medium', Forensic: 'low', Action: 'medium' }
  },
  {
    ticker: 'SLDE', verdict: 'WATCH', mosOrPrem: null, value: null,
    conf: { Data: 'low', Valuation: 'low', Forensic: 'medium', Action: 'low' }
  },
  {
    ticker: 'BTG', verdict: 'WATCH', mosOrPrem: 'MOS', value: '2%',
    conf: { Data: 'medium', Valuation: 'medium', Forensic: 'medium', Action: 'medium' }
  },
  {
    ticker: 'FSM', verdict: 'WATCH', mosOrPrem: 'PREM', value: '8%',
    conf: { Data: 'low', Valuation: 'low', Forensic: 'low', Action: 'low' }
  },
  {
    ticker: 'NEWA-B.ST', verdict: 'WATCH', mosOrPrem: 'MOS', value: '1%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'medium' }
  },
  {
    ticker: 'GPP.WA', verdict: 'WATCH', mosOrPrem: null, value: null,
    conf: { Data: 'medium', Valuation: 'medium', Forensic: 'medium', Action: 'low' }
  },
  {
    ticker: 'NICE', verdict: 'WATCH', mosOrPrem: 'MOS', value: '6%',
    conf: { Data: 'high', Valuation: 'low', Forensic: 'medium', Action: 'medium' }
  },

  // ── HOLD verdicts (6) ─────────────────────────────────────────────
  {
    ticker: 'HCI', verdict: 'HOLD', mosOrPrem: 'MOS', value: '3%',
    conf: { Data: 'medium', Valuation: 'medium', Forensic: 'high', Action: 'medium' }
  },
  {
    ticker: 'TREE', verdict: 'HOLD', mosOrPrem: 'MOS', value: '1%',
    conf: { Data: 'low', Valuation: 'low', Forensic: 'medium', Action: 'low' }
  },
  {
    ticker: 'NRIM', verdict: 'HOLD', mosOrPrem: 'PREM', value: '5%',
    conf: { Data: 'medium', Valuation: 'medium', Forensic: 'medium', Action: 'medium' }
  },
  {
    ticker: 'NOVO-B.CO', verdict: 'HOLD', mosOrPrem: 'MOS', value: '7%',
    conf: { Data: 'high', Valuation: 'high', Forensic: 'high', Action: 'high' }
  },
  {
    ticker: 'AMS.MC', verdict: 'HOLD', mosOrPrem: null, value: null,
    conf: { Data: 'medium', Valuation: 'low', Forensic: 'medium', Action: 'medium' }
  },
  {
    ticker: 'CMCL', verdict: 'HOLD', mosOrPrem: 'MOS', value: '12%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'medium' }
  },

  // ── OVERVALUED verdicts (6) ───────────────────────────────────────
  {
    ticker: 'MDXG', verdict: 'OVERVALUED', mosOrPrem: 'PREM', value: '18%',
    conf: { Data: 'medium', Valuation: 'low', Forensic: 'medium', Action: 'low' }
  },
  {
    ticker: 'OSPN', verdict: 'OVERVALUED', mosOrPrem: 'PREM', value: '25%',
    conf: { Data: 'low', Valuation: 'low', Forensic: 'low', Action: 'low' }
  },
  {
    ticker: 'QIA.DE', verdict: 'OVERVALUED', mosOrPrem: 'PREM', value: '10%',
    conf: { Data: 'medium', Valuation: 'medium', Forensic: 'medium', Action: 'medium' }
  },
  {
    ticker: 'FNTN.DE', verdict: 'OVERVALUED', mosOrPrem: 'PREM', value: '30%',
    conf: { Data: 'low', Valuation: 'low', Forensic: 'medium', Action: 'low' }
  },
  {
    ticker: 'EMIRATESNBD.AE', verdict: 'OVERVALUED', mosOrPrem: 'PREM', value: '5%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'medium' }
  },
  {
    ticker: 'GENTERA.MX', verdict: 'OVERVALUED', mosOrPrem: 'PREM', value: '15%',
    conf: { Data: 'medium', Valuation: 'low', Forensic: 'medium', Action: 'medium' }
  },

  // ── AVOID verdicts (5) ────────────────────────────────────────────
  {
    ticker: 'TOTS3.SA', verdict: 'AVOID', mosOrPrem: 'PREM', value: '22%',
    conf: { Data: 'low', Valuation: 'low', Forensic: 'medium', Action: 'low' }
  },
  {
    ticker: 'LREN3.SA', verdict: 'AVOID', mosOrPrem: 'PREM', value: '35%',
    conf: { Data: 'low', Valuation: 'low', Forensic: 'low', Action: 'low' }
  },
  {
    ticker: 'EDGE-AVOID-1', verdict: 'AVOID', mosOrPrem: 'PREM', value: '0%',
    conf: { Data: 'medium', Valuation: 'medium', Forensic: 'medium', Action: 'high' }
  },
  {
    ticker: 'EDGE-AVOID-2', verdict: 'AVOID', mosOrPrem: null, value: null,
    conf: { Data: 'high', Valuation: 'high', Forensic: 'high', Action: 'high' }
  },
  {
    ticker: 'EDGE-AVOID-3', verdict: 'AVOID', mosOrPrem: 'PREM', value: '45%',
    conf: { Data: 'low', Valuation: 'low', Forensic: 'low', Action: 'low' }
  },

  // ── STRONG BUY verdicts (3) ───────────────────────────────────────
  {
    ticker: 'EDGE-STRONGBUY-1', verdict: 'STRONG BUY', mosOrPrem: 'MOS', value: '40%',
    conf: { Data: 'high', Valuation: 'high', Forensic: 'high', Action: 'high' }
  },
  {
    ticker: 'EDGE-STRONGBUY-2', verdict: 'STRONG BUY', mosOrPrem: 'MOS', value: '28%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'high' }
  },
  {
    ticker: 'EDGE-STRONGBUY-3', verdict: 'STRONG BUY', mosOrPrem: 'MOS', value: '15%',
    conf: { Data: 'medium', Valuation: 'medium', Forensic: 'medium', Action: 'medium' }
  },

  // ── STRONG AVOID verdicts (2) ─────────────────────────────────────
  {
    ticker: 'EDGE-STRONGAVOID-1', verdict: 'STRONG AVOID', mosOrPrem: 'PREM', value: '40%',
    conf: { Data: 'low', Valuation: 'low', Forensic: 'low', Action: 'low' }
  },
  {
    ticker: 'EDGE-STRONGAVOID-2', verdict: 'STRONG AVOID', mosOrPrem: 'PREM', value: '12%',
    conf: { Data: 'medium', Valuation: 'low', Forensic: 'low', Action: 'medium' }
  },
  {
    ticker: 'EDGE-MOS0', verdict: 'WATCH', mosOrPrem: 'MOS', value: '0%',
    conf: { Data: 'medium', Valuation: 'medium', Forensic: 'medium', Action: 'medium' }
  }
];

/* ================================================================== */
/*  TESTS                                                              */
/* ================================================================== */

const allResults = [];

describe('Decision Map – 50-stock scoring pipeline', () => {

  // ── Individual stock tests ──────────────────────────────────────
  for (const stock of STOCKS) {
    test(`${stock.ticker} (${stock.verdict})`, () => {
      const v = vobj(stock.verdict, stock.mosOrPrem, stock.value);
      const c = chips(stock.conf);
      const model = buildDecisionMapModel(v, c);

      // Store for summary test
      allResults.push({ ticker: stock.ticker, model, stock });

      // ── Universal range & format assertions (rules 1-8, 17) ───
      assertModelValid(model, stock.ticker);

      // ── Verdict-specific safety rules ─────────────────────────
      const tone = getVerdictTone(stock.verdict);

      // Rule 9: AVOID → Stand Aside
      if (tone === 'avoid') {
        assert.equal(model.zoneLabel, 'Stand Aside',
          `[${stock.ticker}] AVOID must be Stand Aside`);
      }

      // Rule 10: OVERVALUED with positive premium → NOT Buy Zone
      if (tone === 'overvalued') {
        const pv = parsePercentNumber(stock.value);
        if (pv != null && pv > 0) {
          assert.notEqual(model.zoneLabel, 'Buy Zone',
            `[${stock.ticker}] OVERVALUED+premium must not be Buy Zone`);
        }
      }

      // Rule 11: BUY → actionScore >= 72
      if (tone === 'buy') {
        assert.ok(model.actionScore >= 72,
          `[${stock.ticker}] BUY actionScore ${model.actionScore} >= 72`);
      }

      // Rule 12: AVOID → actionScore <= 42
      if (tone === 'avoid') {
        assert.ok(model.actionScore <= 42,
          `[${stock.ticker}] AVOID actionScore ${model.actionScore} <= 42`);
      }

      // Rule 13: High MOS (>20%) → rewardScore >= 60
      if (stock.mosOrPrem === 'MOS') {
        const pv = parsePercentNumber(stock.value);
        if (pv != null && pv > 20) {
          assert.ok(model.rewardScore >= 60,
            `[${stock.ticker}] MOS>${pv}% rewardScore ${model.rewardScore} >= 60`);
        }
      }

      // Rule 14: High premium (>15%) → rewardScore <= 40
      if (stock.mosOrPrem === 'PREM') {
        const pv = parsePercentNumber(stock.value);
        if (pv != null && pv > 15) {
          assert.ok(model.rewardScore <= 40,
            `[${stock.ticker}] PREM>${pv}% rewardScore ${model.rewardScore} <= 40`);
        }
      }

      // Rule 15: All HIGH confidence → convictionScore >= 75 (unless AVOID caps it)
      const tones = Object.values(stock.conf).filter(Boolean);
      const isAvoid = /avoid/i.test(stock.verdict);
      if (tones.length === 4 && tones.every((t) => t === 'high')) {
        if (isAvoid) {
          assert.ok(model.convictionScore <= 55,
            `[${stock.ticker}] AVOID all-HIGH convictionScore ${model.convictionScore} should be capped <= 55`);
        } else {
          assert.ok(model.convictionScore >= 75,
            `[${stock.ticker}] all-HIGH convictionScore ${model.convictionScore} >= 75`);
        }
      }

      // Rule 16: All LOW confidence → convictionScore <= 50
      if (tones.length === 4 && tones.every((t) => t === 'low')) {
        assert.ok(model.convictionScore <= 50,
          `[${stock.ticker}] all-LOW convictionScore ${model.convictionScore} <= 50`);
      }
    });
  }

  // ── Summary test ────────────────────────────────────────────────
  test('all 51 stocks produced valid output', () => {
    assert.equal(allResults.length, 51,
      `Expected 51 results, got ${allResults.length}`);

    const failures = allResults.filter((r) => {
      try {
        assertModelValid(r.model, r.ticker);
        return false;
      } catch {
        return true;
      }
    });

    assert.equal(failures.length, 0,
      `${failures.length} stocks failed validation: ${failures.map((f) => f.ticker).join(', ')}`);

    // Verify distribution of zone labels
    const zones = {};
    for (const r of allResults) {
      zones[r.model.zoneLabel] = (zones[r.model.zoneLabel] || 0) + 1;
    }

    // At least 2 distinct zones should appear across 50 stocks
    assert.ok(Object.keys(zones).length >= 2,
      `Expected at least 2 distinct zones, got: ${JSON.stringify(zones)}`);
  });
});

/* ================================================================== */
/*  EXTRACTED FUNCTION UNIT TESTS                                      */
/* ================================================================== */

describe('Extracted helper functions', () => {

  describe('clamp()', () => {
    test('clamps below min', () => assert.equal(clamp(-5, 0, 100), 0));
    test('clamps above max', () => assert.equal(clamp(150, 0, 100), 100));
    test('passes through in-range', () => assert.equal(clamp(50, 0, 100), 50));
    test('handles NaN input (propagates)', () => assert.ok(Number.isNaN(clamp(NaN, 10, 90))));
    test('handles string number', () => assert.equal(clamp('42', 0, 100), 42));
  });

  describe('confidenceToneToScore()', () => {
    test('high → 84', () => assert.equal(confidenceToneToScore('high'), 84));
    test('medium → 63', () => assert.equal(confidenceToneToScore('medium'), 63));
    test('low → 38', () => assert.equal(confidenceToneToScore('low'), 38));
    test('unknown → 52', () => assert.equal(confidenceToneToScore('unknown'), 52));
    test('undefined → 52', () => assert.equal(confidenceToneToScore(undefined), 52));
    test('null → 52', () => assert.equal(confidenceToneToScore(null), 52));
  });

  describe('parsePercentNumber()', () => {
    test('parses "8%"', () => assert.equal(parsePercentNumber('8%'), 8));
    test('parses "-15%"', () => assert.equal(parsePercentNumber('-15%'), -15));
    test('parses "22.5%"', () => assert.equal(parsePercentNumber('22.5%'), 22.5));
    test('returns null for empty', () => assert.equal(parsePercentNumber(''), null));
    test('returns null for "N/A"', () => assert.equal(parsePercentNumber('N/A'), null));
    test('returns null for null', () => assert.equal(parsePercentNumber(null), null));
    test('returns null for undefined', () => assert.equal(parsePercentNumber(undefined), null));
  });

  describe('getVerdictTone()', () => {
    test('BUY → buy', () => assert.equal(getVerdictTone('BUY'), 'buy'));
    test('STRONG BUY → buy', () => assert.equal(getVerdictTone('STRONG BUY'), 'buy'));
    test('WATCH → watch', () => assert.equal(getVerdictTone('WATCH'), 'watch'));
    test('HOLD → hold', () => assert.equal(getVerdictTone('HOLD'), 'hold'));
    test('OVERVALUED → overvalued', () => assert.equal(getVerdictTone('OVERVALUED'), 'overvalued'));
    test('AVOID → avoid', () => assert.equal(getVerdictTone('AVOID'), 'avoid'));
    test('STRONG AVOID → avoid', () => assert.equal(getVerdictTone('STRONG AVOID'), 'avoid'));
    test('empty → neutral', () => assert.equal(getVerdictTone(''), 'neutral'));
    test('null → neutral', () => assert.equal(getVerdictTone(null), 'neutral'));
  });

  describe('scoreToActionTone()', () => {
    test('75 → high', () => assert.equal(scoreToActionTone(75), 'high'));
    test('90 → high', () => assert.equal(scoreToActionTone(90), 'high'));
    test('58 → medium', () => assert.equal(scoreToActionTone(58), 'medium'));
    test('74 → medium', () => assert.equal(scoreToActionTone(74), 'medium'));
    test('57 → low', () => assert.equal(scoreToActionTone(57), 'low'));
    test('10 → low', () => assert.equal(scoreToActionTone(10), 'low'));
  });

  describe('getDecisionZoneLabel()', () => {
    test('avoid → Stand Aside regardless of scores', () => {
      assert.equal(getDecisionZoneLabel(90, 90, 'avoid'), 'Stand Aside');
    });
    test('overvalued + high reward → Quality, Price Rich', () => {
      assert.equal(getDecisionZoneLabel(70, 80, 'overvalued'), 'Quality, Price Rich');
    });
    test('high reward + high conviction → Buy Zone', () => {
      assert.equal(getDecisionZoneLabel(65, 70, 'buy'), 'Buy Zone');
    });
    test('low reward + high conviction → Quality, Price Rich', () => {
      assert.equal(getDecisionZoneLabel(50, 70, 'buy'), 'Quality, Price Rich');
    });
    test('high reward + low conviction → Interesting, Needs Proof', () => {
      assert.equal(getDecisionZoneLabel(65, 50, 'buy'), 'Interesting, Needs Proof');
    });
    test('low reward + low conviction → Stand Aside', () => {
      assert.equal(getDecisionZoneLabel(40, 40, 'hold'), 'Stand Aside');
    });
  });

  describe('findConfidenceChip()', () => {
    const testChips = [
      { label: 'Data', tone: 'high' },
      { label: 'Valuation', tone: 'medium' }
    ];
    test('finds existing chip', () => {
      assert.deepEqual(findConfidenceChip(testChips, 'Data'), { label: 'Data', tone: 'high' });
    });
    test('case-insensitive lookup', () => {
      assert.deepEqual(findConfidenceChip(testChips, 'data'), { label: 'Data', tone: 'high' });
    });
    test('returns null for missing chip', () => {
      assert.equal(findConfidenceChip(testChips, 'Forensic'), null);
    });
    test('returns null for null chips array', () => {
      assert.equal(findConfidenceChip(null, 'Data'), null);
    });
    test('returns null for empty label', () => {
      assert.equal(findConfidenceChip(testChips, ''), null);
    });
  });
});

/* ================================================================== */
/*  CROSS-CUTTING INVARIANT TESTS                                      */
/* ================================================================== */

describe('Cross-cutting invariants across all 50 stocks', () => {

  // Build all models up front (runs after the main describe block populates allResults)
  const models = STOCKS.map((s) => ({
    ...s,
    model: buildDecisionMapModel(vobj(s.verdict, s.mosOrPrem, s.value), chips(s.conf))
  }));

  test('no NaN in any numeric field across all 50', () => {
    for (const { ticker, model } of models) {
      for (const key of ['rewardScore', 'convictionScore', 'uncertaintyScore', 'actionScore', 'bubbleSize']) {
        assert.ok(Number.isFinite(model[key]),
          `[${ticker}] ${key} = ${model[key]} is not finite`);
      }
    }
  });

  test('every AVOID stock has Stand Aside zone', () => {
    const avoids = models.filter((m) => getVerdictTone(m.verdict) === 'avoid');
    assert.ok(avoids.length >= 5, `Expected at least 5 AVOID stocks, got ${avoids.length}`);
    for (const { ticker, model } of avoids) {
      assert.equal(model.zoneLabel, 'Stand Aside', `[${ticker}]`);
    }
  });

  test('every AVOID stock has actionScore <= 42', () => {
    const avoids = models.filter((m) => getVerdictTone(m.verdict) === 'avoid');
    for (const { ticker, model } of avoids) {
      assert.ok(model.actionScore <= 42, `[${ticker}] actionScore=${model.actionScore}`);
    }
  });

  test('every BUY stock has actionScore >= 72', () => {
    const buys = models.filter((m) => getVerdictTone(m.verdict) === 'buy');
    assert.ok(buys.length >= 20, `Expected at least 20 BUY stocks, got ${buys.length}`);
    for (const { ticker, model } of buys) {
      assert.ok(model.actionScore >= 72, `[${ticker}] actionScore=${model.actionScore}`);
    }
  });

  test('no OVERVALUED stock with positive premium lands in Buy Zone', () => {
    const overvalued = models.filter((m) => getVerdictTone(m.verdict) === 'overvalued');
    assert.ok(overvalued.length >= 6, `Expected at least 6 OVERVALUED stocks`);
    for (const { ticker, model, value } of overvalued) {
      const pv = parsePercentNumber(value);
      if (pv != null && pv > 0) {
        assert.notEqual(model.zoneLabel, 'Buy Zone', `[${ticker}]`);
      }
    }
  });

  test('high MOS (>20%) always yields rewardScore >= 60', () => {
    const highMos = models.filter((m) =>
      m.mosOrPrem === 'MOS' && parsePercentNumber(m.value) > 20
    );
    assert.ok(highMos.length >= 3, `Expected at least 3 high-MOS stocks`);
    for (const { ticker, model } of highMos) {
      assert.ok(model.rewardScore >= 60, `[${ticker}] rewardScore=${model.rewardScore}`);
    }
  });

  test('high premium (>15%) always yields rewardScore <= 40', () => {
    const highPrem = models.filter((m) =>
      m.mosOrPrem === 'PREM' && parsePercentNumber(m.value) > 15
    );
    assert.ok(highPrem.length >= 3, `Expected at least 3 high-premium stocks`);
    for (const { ticker, model } of highPrem) {
      assert.ok(model.rewardScore <= 40, `[${ticker}] rewardScore=${model.rewardScore}`);
    }
  });

  test('all-HIGH confidence always yields convictionScore >= 75 (unless AVOID capped)', () => {
    const allHigh = models.filter((m) =>
      Object.values(m.conf).filter(Boolean).length === 4 &&
      Object.values(m.conf).every((t) => t === 'high')
    );
    assert.ok(allHigh.length >= 3, `Expected at least 3 all-HIGH stocks`);
    for (const { ticker, model, verdict } of allHigh) {
      if (/avoid/i.test(verdict)) {
        assert.ok(model.convictionScore <= 55, `[${ticker}] AVOID conviction=${model.convictionScore} should be <= 55`);
      } else {
        assert.ok(model.convictionScore >= 75, `[${ticker}] conviction=${model.convictionScore}`);
      }
    }
  });

  test('all-LOW confidence always yields convictionScore <= 50', () => {
    const allLow = models.filter((m) =>
      Object.values(m.conf).filter(Boolean).length === 4 &&
      Object.values(m.conf).every((t) => t === 'low')
    );
    assert.ok(allLow.length >= 2, `Expected at least 2 all-LOW stocks`);
    for (const { ticker, model } of allLow) {
      assert.ok(model.convictionScore <= 50, `[${ticker}] conviction=${model.convictionScore}`);
    }
  });

  test('WATCH/OVERVALUED stocks have actionScore capped at 64', () => {
    const capped = models.filter((m) => {
      const t = getVerdictTone(m.verdict);
      return t === 'watch' || t === 'overvalued';
    });
    assert.ok(capped.length >= 10, `Expected at least 10 WATCH+OVERVALUED`);
    for (const { ticker, model } of capped) {
      assert.ok(model.actionScore <= 64, `[${ticker}] actionScore=${model.actionScore}`);
    }
  });

  test('bubble size grows with uncertainty', () => {
    const sorted = [...models].sort((a, b) => a.model.uncertaintyScore - b.model.uncertaintyScore);
    const low = sorted[0];
    const high = sorted[sorted.length - 1];
    assert.ok(high.model.bubbleSize >= low.model.bubbleSize,
      `Highest-uncertainty bubble (${high.model.bubbleSize}) >= lowest (${low.model.bubbleSize})`);
  });

  test('verdict distribution matches expected counts', () => {
    const counts = {};
    for (const s of STOCKS) {
      const tone = getVerdictTone(s.verdict);
      counts[tone] = (counts[tone] || 0) + 1;
    }
    assert.ok(counts.buy >= 20, `BUY count: ${counts.buy}`);
    assert.ok(counts.watch >= 8, `WATCH count: ${counts.watch}`);
    assert.ok(counts.hold >= 6, `HOLD count: ${counts.hold}`);
    assert.ok(counts.overvalued >= 6, `OVERVALUED count: ${counts.overvalued}`);
    assert.ok(counts.avoid >= 5, `AVOID count: ${counts.avoid}`);
  });

  test('MOS=0% yields rewardScore exactly 50 (neutral midpoint)', () => {
    const mos0 = models.find((m) => m.ticker === 'EDGE-MOS0');
    assert.ok(mos0, 'EDGE-MOS0 test stock must exist');
    assert.strictEqual(mos0.model.rewardScore, 50,
      `MOS=0% should give reward=50, got ${mos0.model.rewardScore}`);
  });

  test('AVOID stocks always have conviction <= 55', () => {
    const avoidStocks = models.filter((m) => /avoid/i.test(m.verdict));
    assert.ok(avoidStocks.length >= 5, `Expected at least 5 AVOID stocks, got ${avoidStocks.length}`);
    for (const { ticker, model } of avoidStocks) {
      assert.ok(model.convictionScore <= 55,
        `[${ticker}] AVOID conviction=${model.convictionScore} should be <= 55`);
    }
  });

  test('dataIncomplete flag present in model', () => {
    for (const { ticker, model } of models) {
      assert.strictEqual(typeof model.dataIncomplete, 'boolean',
        `[${ticker}] dataIncomplete should be boolean, got ${typeof model.dataIncomplete}`);
    }
  });

  test('zonePosition maps to valid CSS class for every stock', () => {
    const valid = ['zone-top-left', 'zone-top-right', 'zone-bottom-left', 'zone-bottom-right'];
    for (const { ticker, model } of models) {
      assert.ok(valid.includes(model.zonePosition),
        `[${ticker}] zonePosition=${model.zonePosition} not in valid set`);
    }
  });

  test('AVOID stocks always have zonePosition = zone-bottom-left (Stand Aside)', () => {
    const avoids = models.filter((m) => getVerdictTone(m.verdict) === 'avoid');
    for (const { ticker, model } of avoids) {
      assert.strictEqual(model.zonePosition, 'zone-bottom-left',
        `[${ticker}] AVOID should be zone-bottom-left, got ${model.zonePosition}`);
    }
  });
});
