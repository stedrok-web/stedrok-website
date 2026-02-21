(function syncGlossaryWithMetricDefinitions() {
  function normalizeLabel(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function upsertDefinedTermSetJsonLd(terms) {
    const scriptId = 'dynamic-defined-termset-jsonld';
    const existing = document.getElementById(scriptId);
    if (existing) {
      existing.remove();
    }
    if (!terms.length) return;

    const payload = {
      '@context': 'https://schema.org',
      '@type': 'DefinedTermSet',
      name: 'Stedrok Metric Definitions',
      url: 'https://stedrok.org/value-investing-glossary.html',
      hasDefinedTerm: terms
    };

    const script = document.createElement('script');
    script.id = scriptId;
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(payload);
    document.head.appendChild(script);
  }

  async function apply() {
    if (!window.stedrokMetricDefinitions || typeof window.stedrokMetricDefinitions.getAll !== 'function') {
      return;
    }

    const definitions = await window.stedrokMetricDefinitions.getAll();
    const labelToDefinition = new Map(
      Object.values(definitions).map(def => [normalizeLabel(def.label), def])
    );

    const pageDefinitions = new Map();
    document.querySelectorAll('.card h2').forEach(h2 => {
      const key = normalizeLabel(h2.textContent);
      const definition = labelToDefinition.get(key);
      if (!definition) return;
      if (!h2.id) {
        h2.id = definition.slug;
      }
      h2.dataset.metricKey = key;
      pageDefinitions.set(definition.slug, {
        '@type': 'DefinedTerm',
        name: definition.label,
        description: definition.definition,
        url: `https://stedrok.org/value-investing-glossary.html#${definition.slug}`
      });
    });

    upsertDefinedTermSetJsonLd(Array.from(pageDefinitions.values()));
  }

  document.addEventListener('DOMContentLoaded', apply);
})();
