// ============================================================
// Stedrok Configuration
// REPLACE the placeholder values with your actual keys
// ============================================================
const CONFIG = {
  // Supabase
  SUPABASE_URL: 'https://ziysjyzdbmgvmzjcjbjj.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppeXNqeXpkYm1ndm16amNqYmpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNzA1NTQsImV4cCI6MjA4NjY0NjU1NH0.HACx7ufiaD40jACPbV4b9stPisShMNpBdlPKg5lM0as',

  // PayPal (get from: developer.paypal.com → Apps)
  PAYPAL_CLIENT_ID: 'AZETIp6rtlrLz5pBX_qA68RuPlFNd0ldBLhmB6XOuna_IpEJcN242mmE1xsJSQ5PnI_6HgUk5g1-ZLbF',
  PAYPAL_PLAN_ID: 'P-87988230Y6727160CNGJQFNI',

  // Cloudflare Worker API
  API_BASE_URL: 'https://stedrok-api.stedrok.workers.dev',
};

// Initialize Supabase client once and expose it as `window.supabaseClient`.
// Do NOT declare a top-level `supabase` variable here to avoid redeclaration
// conflicts with the CDN or other scripts.
;(function initSupabaseClient() {
  try {
    if (window.supabaseClient) {
      // Already initialized
      // console.log('ℹ️ Supabase client already initialized')
      return;
    }

    // The CDN exposes a global namespace that should contain `createClient`.
    const lib = (window.supabase && typeof window.supabase.createClient === 'function')
      ? window.supabase
      : (window.Supabase && typeof window.Supabase.createClient === 'function')
        ? window.Supabase
        : null;

    let client = null;

    if (lib) {
      client = lib.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    } else if (typeof createClient === 'function') {
      // Legacy global function available in some bundles
      client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    }

    if (client) {
      // Expose only `supabaseClient` to avoid clobbering any existing `supabase` symbol.
      window.supabaseClient = client;
      // console.log('✅ Supabase client initialized')
      return;
    }

    console.error('❌ Supabase library not loaded. Check CDN script include in HTML.')
  } catch (e) {
    console.error('❌ Error initializing Supabase client:', e)
  }
})();
