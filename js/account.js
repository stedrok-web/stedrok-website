// Account management page (PayPal-based subscriptions)

document.addEventListener('DOMContentLoaded', async () => {
  const client = window.supabaseClient;
  if (!client || !client.auth) {
    console.error('Supabase client not initialized on account page');
    window.location.href = 'login.html';
    return;
  }

  // Basic session check
  let session = null;
  try {
    if (typeof client.auth.getSession === 'function') {
      const res = await client.auth.getSession();
      session = (res && res.data && res.data.session) ? res.data.session : res.session || null;
    } else if (typeof client.auth.getUser === 'function') {
      const res = await client.auth.getUser();
      session = (res && res.data && res.data.user) ? { user: res.data.user } : null;
    }
  } catch (e) {
    console.warn('Session fetch failed on account page:', e);
  }

  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  const user = session.user;
  document.getElementById('userEmail').textContent = user.email;

  // Load subscription status
  const { data: profile } = await client
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const statusDiv = document.getElementById('subscriptionStatus');

  if (profile && (profile.subscription_status === 'active')) {
    const paidUntil = profile.paid_until
      ? new Date(profile.paid_until).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : null;
    statusDiv.innerHTML = `
      <p style="color: var(--accent-green); font-weight:600;">&#10003; Pro Plan — Active</p>
      ${paidUntil ? `<p style="color: var(--text-secondary); margin-top:8px;">Renews: ${paidUntil}</p>` : ''}
      <p style="color: var(--text-secondary); margin-top:12px; font-size:13px;">
        To cancel, visit 
        <a href="https://www.paypal.com/myaccount/autopay" target="_blank" 
           style="color:var(--accent-green);">PayPal &rarr; Automatic Payments</a> 
        and cancel your Stedrok subscription. Your access continues until the end of the current billing period.
      </p>
      <p style="color: var(--text-secondary); margin-top:10px; font-size:13px;">
        StedrokGPT Equity Research Lab is included with Pro. It can be stricter than Core or AI Hybrid because additional structural hard-stop checks are enforced before output is accepted.
      </p>
      <a href="stedrokgpt-cli.html" class="btn-secondary" style="margin-top:12px; display:inline-block;">
        Open StedrokGPT Research Lab &rarr;
      </a>
    `;
  } else if (profile && profile.subscription_status === 'suspended') {
    statusDiv.innerHTML = `
      <p style="color: #facc15; font-weight:600;">&#9888; Action Required — Payment Failed</p>
      <p style="color: var(--text-secondary); margin-top:8px;">Your last payment couldn&#39;t be processed. Please update your PayPal payment method to restore full Pro access.</p>
      <p style="color: var(--text-secondary); margin-top:8px;">
        Update your payment method at
        <a href="https://www.paypal.com/myaccount/autopay" target="_blank"
           style="color:var(--accent-green);">PayPal &rarr; Automatic Payments</a>.
      </p>
    `;
  } else {
    statusDiv.innerHTML = `
      <p style="color: var(--text-secondary); font-weight:600;">Free Plan</p>
      <p style="color: var(--text-secondary); margin-top:6px; font-size:13px;">You&#39;re tracking up to 3 stocks. Upgrade to unlock unlimited stocks, full analytics, StedrokGPT Research Lab access, and priority support.</p>
      <a href="pricing.html" class="btn-primary" style="margin-top:12px; display:inline-block;">
        Upgrade to Pro &mdash; $5/month
      </a>
    `;
  }

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
      if (client.auth && typeof client.auth.signOut === 'function') {
        await client.auth.signOut();
      }
    } catch (e) {
      console.error('Logout failed:', e);
    }
    window.location.href = 'index.html';
  });

  // Delete account
  document.getElementById('deleteAccountBtn')?.addEventListener('click', async () => {
    const confirmed = confirm(
      'Are you sure you want to delete your account? This cannot be undone — all your data will be permanently removed.'
    );
    if (!confirmed) return;

    const messageDiv = document.getElementById('deleteMessage');
    if (messageDiv) {
      messageDiv.textContent = 'To confirm deletion, email contact@stedrok.org with the subject "Delete My Account". We\'ll remove your data within 48 hours. You\'ll be signed out now.';
      messageDiv.style.display = 'block';
    }

    // Sign out after 4 seconds
    setTimeout(async () => {
      try {
        if (client.auth && typeof client.auth.signOut === 'function') {
          await client.auth.signOut();
        }
      } catch (e) {
        console.error('Sign out during account delete failed:', e);
      }
      window.location.href = 'index.html';
    }, 4000);
  });
});
