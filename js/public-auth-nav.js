(function initPublicAuthNavigation() {
  const loginBtn = document.getElementById('loginBtn');
  const registerBtn = document.getElementById('registerBtn');
  const dashboardBtn = document.getElementById('dashboardBtn');
  const accountBtn = document.getElementById('accountBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  const navDashboardLink = document.querySelector('.nav-links a[href="dashboard.html"]');
  const navDashboardItem = navDashboardLink ? navDashboardLink.closest('li') : null;

  const show = (el, visible, displayValue = 'inline-block') => {
    if (!el) return;
    el.style.display = visible ? displayValue : 'none';
  };

  function renderLoggedOut() {
    show(loginBtn, true);
    show(registerBtn, true);
    show(dashboardBtn, false);
    show(accountBtn, false);
    show(logoutBtn, false);
    if (navDashboardItem) {
      navDashboardItem.style.display = 'none';
    }
  }

  function renderLoggedIn(session) {
    const isLoggedIn = Boolean(session && session.user);
    if (!isLoggedIn) {
      renderLoggedOut();
      return;
    }

    show(loginBtn, false);
    show(registerBtn, false);
    show(dashboardBtn, true);
    show(accountBtn, true);
    show(logoutBtn, true);
    if (navDashboardItem) {
      navDashboardItem.style.display = '';
    }
  }

  renderLoggedOut();

  const client = window.supabaseClient;
  if (!client || !client.auth) {
    return;
  }

  client.auth.getSession()
    .then(({ data }) => renderLoggedIn(data?.session || null))
    .catch(() => renderLoggedOut());

  client.auth.onAuthStateChange((_event, session) => {
    renderLoggedIn(session || null);
  });

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await client.auth.signOut();
      } catch (_err) {
      } finally {
        renderLoggedOut();
        window.location.href = 'index.html';
      }
    });
  }
})();
