(function applyMetricTooltips() {
  const COLUMN_METADATA = {
    market_cap: { metricKey: 'market_cap' },
    confidence: { metricKey: 'confidence' },
    value_score: { metricKey: 'value_score' },
    quality_score: { metricKey: 'quality_score' },
    risk_score: { metricKey: 'risk_score' },
    dip_score: { metricKey: 'dip_score' },
    fair_value: { metricKey: 'fair_value' },
    discount_pct: { metricKey: 'discount_pct', glossaryKey: 'margin_of_safety' }
  };
  let hydrated = false;

  function buildTooltipText(definition) {
    return `${definition.label}: ${definition.definition}`;
  }

  async function hydrateDashboardHeaders() {
    if (hydrated) {
      return;
    }
    if (document.documentElement.dataset.dashboardTooltipsReady !== 'true') {
      return;
    }
    if (!window.stedrokMetricDefinitions || typeof window.stedrokMetricDefinitions.getAll !== 'function') {
      return;
    }

    const metrics = await window.stedrokMetricDefinitions.getAll();
    const headers = document.querySelectorAll('#stocksTable thead th[data-sort]');
    headers.forEach(header => {
      const sortKey = String(header.getAttribute('data-sort') || '').trim();
      const metadata = COLUMN_METADATA[sortKey];
      if (!metadata) return;

      const metricKey = metadata.metricKey;
      const definition = metrics[metricKey];
      if (!definition) return;

      const glossaryDefinition = metrics[metadata.glossaryKey || metricKey] || definition;

      const tooltip = buildTooltipText(definition);
      header.setAttribute('title', tooltip);
      header.setAttribute('aria-label', tooltip);
      header.dataset.glossaryHref = `value-investing-glossary.html#${glossaryDefinition.slug}`;
    });
    hydrated = true;
  }

  document.addEventListener('DOMContentLoaded', hydrateDashboardHeaders);
  document.addEventListener('stedrok:dashboard-ready', hydrateDashboardHeaders);
})();


