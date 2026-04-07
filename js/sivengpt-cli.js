(function initSivenGptCliPage() {
  const form = document.getElementById('cliForm');
  const input = document.getElementById('cliInput');
  const output = document.getElementById('cliOutput');
  const statusEl = document.getElementById('cliStatus');
  const runButton = document.getElementById('runButton');

  if (!form || !input || !output || !statusEl || !runButton) {
    return;
  }

  const COMMAND_RE = /^\/stock\s+([A-Za-z][A-Za-z0-9.-]{0,9})$/;

  function setStatus(message, isError) {
    statusEl.textContent = message || '';
    statusEl.classList.toggle('error', Boolean(isError));
  }

  function getApiUrl() {
    const url = new URL(window.location.href);
    const directApi = url.searchParams.get('api');
    if (directApi) {
      return directApi;
    }

    const configBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG && typeof CONFIG.API_BASE_URL === 'string')
      ? CONFIG.API_BASE_URL
      : '';
    if (configBaseUrl) {
      return `${configBaseUrl}/api/sivengpt-cli-stock`;
    }

    return '/api/sivengpt-cli-stock';
  }

  function validateCommand(rawCommand) {
    const command = String(rawCommand || '').trim();
    const match = command.match(COMMAND_RE);
    if (!match) {
      return {
        ok: false,
        error: 'Rejected. Allowed format: /stock <SYMBOL>'
      };
    }

    const symbol = String(match[1] || '').toUpperCase();
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) {
      return {
        ok: false,
        error: 'Invalid symbol format. Use letters/numbers with optional dot or dash.'
      };
    }

    return { ok: true, symbol, command: `/stock ${symbol}` };
  }

  async function runCommand(validated) {
    const startedAt = performance.now();
    const endpoint = getApiUrl();

    const payload = {
      command: validated.command,
      symbol: validated.symbol
    };

    const headers = {
      'Content-Type': 'application/json'
    };

    try {
      const token = localStorage.getItem('supabase.auth.token') || sessionStorage.getItem('supabase.auth.token');
      if (token && token.startsWith('ey')) {
        headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // local storage access failure should not block request
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    const elapsedMs = Math.round(performance.now() - startedAt);

    if (!response.ok) {
      const message = data && data.error ? data.error : `Request failed (HTTP ${response.status})`;
      throw new Error(message);
    }

    const reportOutput = data && typeof data.output === 'string' ? data.output.trim() : '';
    if (!reportOutput) {
      throw new Error('No output was returned by the analysis bridge.');
    }

    output.textContent = reportOutput;
    output.scrollTop = 0;
    setStatus(`Done in ${elapsedMs} ms. Symbol: ${validated.symbol}`, false);
  }

  form.addEventListener('submit', async function onSubmit(event) {
    event.preventDefault();
    const raw = input.value;
    const validated = validateCommand(raw);

    if (!validated.ok) {
      setStatus(validated.error, true);
      return;
    }

    runButton.disabled = true;
    runButton.textContent = 'Running...';
    setStatus(`Running analysis for ${validated.symbol}...`, false);
    output.textContent = `$ /stock ${validated.symbol}\n\nRunning deep report...`;

    try {
      await runCommand(validated);
    } catch (error) {
      setStatus(error.message || 'Something failed during execution.', true);
      output.textContent = `$ /stock ${validated.symbol}\n\nERROR:\n${error.message || 'Unknown error'}`;
    } finally {
      runButton.disabled = false;
      runButton.textContent = 'Run';
    }
  });
})();
