// ============================================================
// Stedrok Configuration
// REPLACE the placeholder values with your actual keys
// ============================================================
const CONFIG = {
  // Supabase
  SUPABASE_URL: 'https://ziysjyzdbmgvmzjcjbjj.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppeXNqeXpkYm1ndm16amNqYmpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNzA1NTQsImV4cCI6MjA4NjY0NjU1NH0.HACx7ufiaD40jACPbV4b9stPisShMNpBdlPKg5lM0as',

  // PayPal (get from: developer.paypal.com → Apps)
  PAYPAL_CLIENT_ID: 'YOUR_PAYPAL_CLIENT_ID',              // ← REPLACE
  PAYPAL_PLAN_ID: 'YOUR_PAYPAL_PLAN_ID',                  // ← REPLACE

  // Cloudflare Worker API
  API_BASE_URL: 'https://stedrok-api.stedrok.workers.dev',
};

// Initialize Supabase client and expose it on window for other scripts
;(function initSupabase() {
  try {
    // The CDN exposes a global `supabase` namespace with `createClient`.
    const lib = window.supabase || window.Supabase || null;

    if (lib && typeof lib.createClient === 'function') {
      // Create client and set both `window.supabase` and `window.supabaseClient`
      const client = lib.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
      window.supabase = client;
      window.supabaseClient = client;
      console.log('✅ Supabase client initialized')
      return;
    }

    // Fallback: if createClient is available globally
    if (typeof createClient === 'function') {
      const client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
      window.supabase = client;
      window.supabaseClient = client;
      console.log('✅ Supabase client initialized (fallback)')
      return;
    }

    console.error('❌ Supabase library not loaded. Check CDN script include in HTML.')
  } catch (e) {
    console.error('❌ Error initializing Supabase client:', e)
  }
})();
