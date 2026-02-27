(function initHomeAuthNavigation() {
  const client = window.supabaseClient;
  if (!client || !client.auth) return;

  const loginBtn = document.getElementById('loginBtn');
  const registerBtn = document.getElementById('registerBtn');
  const dashboardBtn = document.getElementById('dashboardBtn');
  const accountBtn = document.getElementById('accountBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  const show = (el, visible, displayValue = 'inline-block') => {
    if (!el) return;
    el.style.display = visible ? displayValue : 'none';
  };

  function renderAuthState(session) {
    const isLoggedIn = Boolean(session && session.user);
    show(loginBtn, !isLoggedIn);
    show(registerBtn, !isLoggedIn);
    show(dashboardBtn, isLoggedIn);
    show(accountBtn, isLoggedIn);
    show(logoutBtn, isLoggedIn);
  }

  client.auth.getSession()
    .then(({ data }) => renderAuthState(data?.session || null))
    .catch((error) => {
      console.warn('Home auth nav session check failed:', error);
      renderAuthState(null);
    });

  client.auth.onAuthStateChange((_event, session) => {
    renderAuthState(session || null);
  });

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await client.auth.signOut();
      } catch (error) {
        console.error('Logout failed:', error);
      } finally {
        renderAuthState(null);
        window.location.reload();
      }
    });
  }
})();
