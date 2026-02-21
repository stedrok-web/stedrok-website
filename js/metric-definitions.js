(function bootstrapMetricDefinitions() {
  const DEFINITIONS_URL = 'data/metric_definitions.json?v=20260221a';
  let definitionsPromise = null;

  async function loadDefinitions() {
    if (definitionsPromise) {
      return definitionsPromise;
    }

    definitionsPromise = fetch(DEFINITIONS_URL, { cache: 'no-store' })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to load metric definitions: ${response.status}`);
        }
        return response.json();
      })
      .then(payload => payload?.metrics || {})
      .catch(error => {
        console.warn('Metric definitions unavailable:', error);
        return {};
      });

    return definitionsPromise;
  }

  async function getDefinition(key) {
    const metrics = await loadDefinitions();
    return metrics[String(key || '').trim()] || null;
  }

  window.stedrokMetricDefinitions = {
    url: DEFINITIONS_URL,
    getAll: loadDefinitions,
    getByKey: getDefinition
  };
})();
