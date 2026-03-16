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
      ? new Date(profile.paid_until).toLocaleDateString()
      : 'N/A';
    statusDiv.innerHTML = `
      <p style="color: var(--accent-green); font-weight:600;">✓ Active Pro Subscription ($5/month)</p>
      <p style="color: var(--text-secondary); margin-top:8px;">Paid until: ${paidUntil}</p>
      <p style="color: var(--text-secondary); margin-top:12px; font-size:13px;">
        To cancel your subscription, log in to 
        <a href="https://www.paypal.com/myaccount/autopay" target="_blank" 
           style="color:var(--accent-green);">PayPal → Automatic Payments</a> 
        and cancel your Stedrok subscription.
      </p>
    `;
  } else if (profile && profile.subscription_status === 'suspended') {
    statusDiv.innerHTML = `
      <p style="color: #facc15; font-weight:600;">⚠ Payment Issue</p>
      <p style="color: var(--text-secondary); margin-top:8px;">Your last payment failed. We'll retry automatically.</p>
      <p style="color: var(--text-secondary); margin-top:8px;">
        Please check your PayPal payment method at
        <a href="https://www.paypal.com/myaccount/autopay" target="_blank"
           style="color:var(--accent-green);">PayPal → Automatic Payments</a>.
      </p>
    `;
  } else {
    statusDiv.innerHTML = `
      <p style="color: var(--text-secondary);">Free Tier (3 stocks only)</p>
      <a href="pricing.html" class="btn-primary" style="margin-top:12px; display:inline-block;">
        Upgrade to Pro – $5/month
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
      'Are you sure you want to delete your account? This action is irreversible.'
    );
    if (!confirmed) return;

    const messageDiv = document.getElementById('deleteMessage');
    if (messageDiv) {
      messageDiv.textContent = 'To complete account deletion, please email contact@stedrok.org with "Delete Account" in the subject line. You will be logged out now.';
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
