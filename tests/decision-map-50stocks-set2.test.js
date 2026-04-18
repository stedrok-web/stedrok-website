/**
 * Decision Map – 50-stock scoring pipeline test suite (set 2)
 *
 * Validates buildDecisionMapModel() against a SECOND set of 50 diverse stock
 * scenarios sourced from scored_stocks_latest.csv, covering AVOID, WATCH,
 * OVERVALUED, HOLD, and STRONG AVOID verdicts with varied confidence mixes.
 *
 * Functions below are extracted verbatim from js/stedrokgpt-cli.js (IIFE)
 * so they can be unit-tested directly without the full DOM harness.
 *
 * Runner: node --test tests/decision-map-50stocks-set2.test.js
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

  return {
    rewardScore, convictionScore, uncertaintyScore, actionScore,
    actionTone, bubbleSize, zoneLabel, dataIncomplete,
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
/*  50 STOCK SCENARIOS (SET 2)                                         */
/* ================================================================== */

const STOCKS = [
  // ── AVOID verdicts (15) ───────────────────────────────────────────
  {
    ticker: 'BGC', verdict: 'AVOID', mosOrPrem: 'PREM', value: '11.7%',
    conf: { Data: 'medium', Valuation: 'medium', Forensic: 'medium', Action: 'low' }
  },
  {
    ticker: 'GSAT', verdict: 'AVOID', mosOrPrem: 'PREM', value: '25.9%',
    conf: { Data: 'low', Valuation: 'low', Forensic: 'low', Action: 'low' }
  },
  {
    ticker: 'ORIC', verdict: 'AVOID', mosOrPrem: 'PREM', value: '18.4%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'medium' }
  },
  {
    ticker: 'DFDS.CO', verdict: 'AVOID', mosOrPrem: 'PREM', value: '31.6%',
    conf: { Data: 'medium', Valuation: 'medium', Forensic: 'medium', Action: 'low' }
  },
  {
    ticker: 'PBYI', verdict: 'AVOID', mosOrPrem: 'PREM', value: '21.7%',
    conf: { Data: 'low', Valuation: 'low', Forensic: 'low', Action: 'low' }
  },
  {
    ticker: 'MRB.WA', verdict: 'AVOID', mosOrPrem: 'MOS', value: '2.9%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'medium' }
  },
  {
    ticker: 'VCIC', verdict: 'AVOID', mosOrPrem: 'PREM', value: '14.8%',
    conf: { Data: 'medium', Valuation: 'medium', Forensic: 'medium', Action: 'low' }
  },
  {
    ticker: 'FIHL', verdict: 'AVOID', mosOrPrem: 'PREM', value: '3.1%',
    conf: { Data: 'low', Valuation: 'low', Forensic: 'low', Action: 'low' }
  },
  {
    ticker: 'HCKT', verdict: 'AVOID', mosOrPrem: 'MOS', value: '5.8%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'medium' }
  },
  {
    ticker: 'SCATC.OL', verdict: 'AVOID', mosOrPrem: 'PREM', value: '2.5%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'medium' }
  },
  {
    ticker: 'BULL', verdict: 'AVOID', mosOrPrem: 'MOS', value: '40.6%',
    conf: { Data: 'high', Valuation: 'high', Forensic: 'high', Action: 'high' }
  },
  {
    ticker: 'WSC', verdict: 'AVOID', mosOrPrem: 'MOS', value: '9.8%',
    conf: { Data: 'high', Valuation: 'high', Forensic: 'high', Action: 'high' }
  },
  {
    ticker: 'PAR', verdict: 'AVOID', mosOrPrem: 'MOS', value: '63.3%',
    conf: { Data: 'high', Valuation: 'high', Forensic: 'high', Action: 'high' }
  },
  {
    ticker: 'AIOT', verdict: 'AVOID', mosOrPrem: 'MOS', value: '39.7%',
    conf: { Data: 'high', Valuation: 'high', Forensic: 'high', Action: 'high' }
  },
  {
    ticker: 'LYTS', verdict: 'AVOID', mosOrPrem: 'PREM', value: '0.5%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'medium' }
  },

  // ── STRONG AVOID verdicts (1) ─────────────────────────────────────
  {
    ticker: 'ALEC', verdict: 'STRONG AVOID', mosOrPrem: 'PREM', value: '7.6%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'medium' }
  },

  // ── WATCH verdicts (19) ───────────────────────────────────────────
  {
    ticker: 'CRH.L', verdict: 'WATCH', mosOrPrem: 'PREM', value: '11.4%',
    conf: { Data: 'medium', Valuation: 'medium', Forensic: 'medium', Action: 'low' }
  },
  {
    ticker: '0836.HK', verdict: 'WATCH', mosOrPrem: 'MOS', value: '5.9%',
    conf: { Data: 'medium', Valuation: 'medium', Forensic: 'medium', Action: 'low' }
  },
  {
    ticker: 'MRO.L', verdict: 'WATCH', mosOrPrem: 'MOS', value: '4.7%',
    conf: { Data: 'high', Valuation: 'high', Forensic: 'high', Action: 'high' }
  },
  {
    ticker: 'EMD', verdict: 'WATCH', mosOrPrem: 'PREM', value: '3.4%',
    conf: { Data: 'low', Valuation: 'low', Forensic: 'low', Action: 'low' }
  },
  {
    ticker: '6066.HK', verdict: 'WATCH', mosOrPrem: 'MOS', value: '24.7%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'medium' }
  },
  {
    ticker: 'PXED', verdict: 'WATCH', mosOrPrem: 'MOS', value: '6.4%',
    conf: { Data: 'high', Valuation: 'high', Forensic: 'high', Action: 'high' }
  },
  {
    ticker: 'EFN.TO', verdict: 'WATCH', mosOrPrem: 'MOS', value: '6.3%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'medium' }
  },
  {
    ticker: 'BRBR', verdict: 'WATCH', mosOrPrem: 'MOS', value: '40.2%',
    conf: { Data: 'medium', Valuation: 'medium', Forensic: 'medium', Action: 'low' }
  },
  {
    ticker: 'FBK.MI', verdict: 'WATCH', mosOrPrem: 'MOS', value: '0%',
    conf: { Data: null, Valuation: null, Forensic: null, Action: null }
  },
  {
    ticker: 'UTF', verdict: 'WATCH', mosOrPrem: 'PREM', value: '1.8%',
    conf: { Data: 'medium', Valuation: 'medium', Forensic: 'medium', Action: 'low' }
  },
  {
    ticker: 'GLDD', verdict: 'WATCH', mosOrPrem: 'PREM', value: '10.2%',
    conf: { Data: 'medium', Valuation: 'medium', Forensic: 'medium', Action: 'low' }
  },
  {
    ticker: 'SCR.PA', verdict: 'WATCH', mosOrPrem: 'PREM', value: '3%',
    conf: { Data: 'low', Valuation: 'low', Forensic: 'low', Action: 'low' }
  },
  {
    ticker: 'NFG', verdict: 'WATCH', mosOrPrem: 'MOS', value: '6%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'medium' }
  },
  {
    ticker: 'DSY.PA', verdict: 'WATCH', mosOrPrem: 'MOS', value: '13.8%',
    conf: { Data: 'medium', Valuation: 'medium', Forensic: 'medium', Action: 'low' }
  },
  {
    ticker: '2328.HK', verdict: 'WATCH', mosOrPrem: 'MOS', value: '25.2%',
    conf: { Data: 'high', Valuation: 'high', Forensic: 'high', Action: 'high' }
  },
  {
    ticker: 'LNR.TO', verdict: 'WATCH', mosOrPrem: 'MOS', value: '10.3%',
    conf: { Data: 'medium', Valuation: 'medium', Forensic: 'medium', Action: 'low' }
  },
  {
    ticker: '1698.HK', verdict: 'WATCH', mosOrPrem: 'MOS', value: '44.7%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'medium' }
  },
  {
    ticker: '2319.HK', verdict: 'WATCH', mosOrPrem: 'MOS', value: '14.4%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'medium' }
  },
  {
    ticker: 'VSTM', verdict: 'WATCH', mosOrPrem: 'MOS', value: '24%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'medium' }
  },

  // ── OVERVALUED verdicts (12) ──────────────────────────────────────
  {
    ticker: 'BALY', verdict: 'OVERVALUED', mosOrPrem: 'MOS', value: '11.6%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'medium' }
  },
  {
    ticker: 'ASC.MI', verdict: 'OVERVALUED', mosOrPrem: 'MOS', value: '0.1%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'medium' }
  },
  {
    ticker: 'KB', verdict: 'OVERVALUED', mosOrPrem: 'MOS', value: '3.2%',
    conf: { Data: 'medium', Valuation: 'medium', Forensic: 'medium', Action: 'low' }
  },
  {
    ticker: 'BRAI', verdict: 'OVERVALUED', mosOrPrem: 'MOS', value: '27.4%',
    conf: { Data: 'medium', Valuation: 'medium', Forensic: 'medium', Action: 'low' }
  },
  {
    ticker: 'KSPI', verdict: 'OVERVALUED', mosOrPrem: 'MOS', value: '2.2%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'medium' }
  },
  {
    ticker: 'SPZ.AX', verdict: 'OVERVALUED', mosOrPrem: 'MOS', value: '14.3%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'medium' }
  },
  {
    ticker: 'NBXG', verdict: 'OVERVALUED', mosOrPrem: 'PREM', value: '2.8%',
    conf: { Data: 'low', Valuation: 'low', Forensic: 'low', Action: 'low' }
  },
  {
    ticker: 'HYLN', verdict: 'OVERVALUED', mosOrPrem: 'MOS', value: '3.3%',
    conf: { Data: 'high', Valuation: 'high', Forensic: 'high', Action: 'high' }
  },
  {
    ticker: 'ACF.AX', verdict: 'OVERVALUED', mosOrPrem: 'MOS', value: '9.2%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'medium' }
  },
  {
    ticker: 'LWLG', verdict: 'OVERVALUED', mosOrPrem: 'PREM', value: '97.5%',
    conf: { Data: 'low', Valuation: 'low', Forensic: 'low', Action: 'low' }
  },
  {
    ticker: 'SRL.AX', verdict: 'OVERVALUED', mosOrPrem: 'PREM', value: '91%',
    conf: { Data: 'low', Valuation: 'low', Forensic: 'low', Action: 'low' }
  },
  {
    ticker: 'XPS.L', verdict: 'OVERVALUED', mosOrPrem: 'MOS', value: '10.5%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'medium' }
  },

  // ── HOLD verdicts (3) ─────────────────────────────────────────────
  {
    ticker: 'DSGX', verdict: 'HOLD', mosOrPrem: 'MOS', value: '31.4%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'medium' }
  },
  {
    ticker: 'PAYX', verdict: 'HOLD', mosOrPrem: 'MOS', value: '39.6%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'medium' }
  },
  {
    ticker: 'CDE', verdict: 'HOLD', mosOrPrem: 'MOS', value: '23.4%',
    conf: { Data: 'high', Valuation: 'medium', Forensic: 'high', Action: 'medium' }
  }
];

/* ================================================================== */
/*  TESTS                                                              */
/* ================================================================== */

const allResults = [];

describe('Decision Map \u2013 50-stock scoring pipeline (set 2)', () => {

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

      // Rule: dataIncomplete flag for FBK.MI (conf=0, no chips)
      if (stock.ticker === 'FBK.MI') {
        assert.strictEqual(model.dataIncomplete, true,
          `[${stock.ticker}] dataIncomplete should be true when all chips are null`);
      }
    });
  }

  // ── Summary test ────────────────────────────────────────────────
  test('all 50 stocks produced valid output', () => {
    assert.equal(allResults.length, 50,
      `Expected 50 results, got ${allResults.length}`);

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
    test('high \u2192 84', () => assert.equal(confidenceToneToScore('high'), 84));
    test('medium \u2192 63', () => assert.equal(confidenceToneToScore('medium'), 63));
    test('low \u2192 38', () => assert.equal(confidenceToneToScore('low'), 38));
    test('unknown \u2192 52', () => assert.equal(confidenceToneToScore('unknown'), 52));
    test('undefined \u2192 52', () => assert.equal(confidenceToneToScore(undefined), 52));
    test('null \u2192 52', () => assert.equal(confidenceToneToScore(null), 52));
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
    test('BUY \u2192 buy', () => assert.equal(getVerdictTone('BUY'), 'buy'));
    test('STRONG BUY \u2192 buy', () => assert.equal(getVerdictTone('STRONG BUY'), 'buy'));
    test('WATCH \u2192 watch', () => assert.equal(getVerdictTone('WATCH'), 'watch'));
    test('HOLD \u2192 hold', () => assert.equal(getVerdictTone('HOLD'), 'hold'));
    test('OVERVALUED \u2192 overvalued', () => assert.equal(getVerdictTone('OVERVALUED'), 'overvalued'));
    test('AVOID \u2192 avoid', () => assert.equal(getVerdictTone('AVOID'), 'avoid'));
    test('STRONG AVOID \u2192 avoid', () => assert.equal(getVerdictTone('STRONG AVOID'), 'avoid'));
    test('empty \u2192 neutral', () => assert.equal(getVerdictTone(''), 'neutral'));
    test('null \u2192 neutral', () => assert.equal(getVerdictTone(null), 'neutral'));
  });

  describe('scoreToActionTone()', () => {
    test('75 \u2192 high', () => assert.equal(scoreToActionTone(75), 'high'));
    test('90 \u2192 high', () => assert.equal(scoreToActionTone(90), 'high'));
    test('58 \u2192 medium', () => assert.equal(scoreToActionTone(58), 'medium'));
    test('74 \u2192 medium', () => assert.equal(scoreToActionTone(74), 'medium'));
    test('57 \u2192 low', () => assert.equal(scoreToActionTone(57), 'low'));
    test('10 \u2192 low', () => assert.equal(scoreToActionTone(10), 'low'));
  });

  describe('getDecisionZoneLabel()', () => {
    test('avoid \u2192 Stand Aside regardless of scores', () => {
      assert.equal(getDecisionZoneLabel(90, 90, 'avoid'), 'Stand Aside');
    });
    test('overvalued + high reward \u2192 Quality, Price Rich', () => {
      assert.equal(getDecisionZoneLabel(70, 80, 'overvalued'), 'Quality, Price Rich');
    });
    test('high reward + high conviction \u2192 Buy Zone', () => {
      assert.equal(getDecisionZoneLabel(65, 70, 'buy'), 'Buy Zone');
    });
    test('low reward + high conviction \u2192 Quality, Price Rich', () => {
      assert.equal(getDecisionZoneLabel(50, 70, 'buy'), 'Quality, Price Rich');
    });
    test('high reward + low conviction \u2192 Interesting, Needs Proof', () => {
      assert.equal(getDecisionZoneLabel(65, 50, 'buy'), 'Interesting, Needs Proof');
    });
    test('low reward + low conviction \u2192 Stand Aside', () => {
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

describe('Cross-cutting invariants across all 50 stocks (set 2)', () => {

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
    assert.ok(avoids.length >= 13, `Expected at least 13 AVOID stocks, got ${avoids.length}`);
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

  test('no BUY stocks in this set (verify distribution)', () => {
    const buys = models.filter((m) => getVerdictTone(m.verdict) === 'buy');
    assert.equal(buys.length, 0, `Expected 0 BUY stocks in set 2, got ${buys.length}`);
  });

  test('no OVERVALUED stock with positive value lands in Buy Zone', () => {
    const overvalued = models.filter((m) => getVerdictTone(m.verdict) === 'overvalued');
    assert.ok(overvalued.length >= 5, `Expected at least 5 OVERVALUED stocks`);
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
    assert.ok((counts.avoid || 0) >= 13, `AVOID count: ${counts.avoid}`);
    assert.ok((counts.watch || 0) >= 10, `WATCH count: ${counts.watch}`);
    assert.ok((counts.overvalued || 0) >= 5, `OVERVALUED count: ${counts.overvalued}`);
    assert.ok((counts.hold || 0) >= 3, `HOLD count: ${counts.hold}`);
  });

  test('MOS=0% yields rewardScore exactly 50 (neutral midpoint)', () => {
    const mos0 = models.find((m) => m.ticker === 'FBK.MI');
    assert.ok(mos0, 'FBK.MI test stock must exist');
    assert.strictEqual(mos0.model.rewardScore, 50,
      `MOS=0% should give reward=50, got ${mos0.model.rewardScore}`);
  });

  test('AVOID stocks always have conviction <= 55', () => {
    const avoidStocks = models.filter((m) => /avoid/i.test(m.verdict));
    assert.ok(avoidStocks.length >= 13, `Expected at least 13 AVOID stocks, got ${avoidStocks.length}`);
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

  test('FBK.MI (conf=0) has dataIncomplete=true', () => {
    const fbk = models.find((m) => m.ticker === 'FBK.MI');
    assert.ok(fbk, 'FBK.MI must exist in models');
    assert.strictEqual(fbk.model.dataIncomplete, true,
      'FBK.MI should have dataIncomplete=true when all chips are null');
  });
});
