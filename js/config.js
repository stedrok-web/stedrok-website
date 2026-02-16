// ============================================================
// Stedrok Configuration
// REPLACE the placeholder values with your actual keys
// ============================================================
const CONFIG = {
  // Supabase
  SUPABASE_URL: 'https://ziysjyzdbmgvmzjcjbjj.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_i1rPeIrh4lcJrmNnJFpwiQ_QDxE92tU',

  // PayPal (get from: developer.paypal.com → Apps)
  PAYPAL_CLIENT_ID: 'YOUR_PAYPAL_CLIENT_ID',              // ← REPLACE
  PAYPAL_PLAN_ID: 'YOUR_PAYPAL_PLAN_ID',                  // ← REPLACE

  // Cloudflare Worker API
  API_BASE_URL: 'https://stedrok-api.stedrok.workers.dev',
};

// Initialize Supabase client and expose it on window for other scripts
window.supabase = window.supabase.createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_ANON_KEY
);
