(function initPublicAuthNavigation() {
  const authButtons = document.getElementById('authButtons');
  if (!authButtons) return;

  const navDashboardLink = document.querySelector('.nav-links a[href="dashboard.html"]');
  const navDashboardItem = navDashboardLink ? navDashboardLink.closest('li') : null;

  const loggedOutMarkup = `
    <a href="login.html" class="btn-secondary" id="loginBtn">Login</a>
    <a href="register.html" class="btn-primary" id="registerBtn">Register</a>
  `;

  const loggedInMarkup = `
    <a href="dashboard.html" class="btn-primary" id="dashboardBtn">Dashboard</a>
    <a href="account.html" class="btn-secondary" id="accountBtn">Account</a>
    <button class="btn-secondary" id="logoutBtn" type="button">Logout</button>
  `;

  function setLoggedOutMarkup() {
    authButtons.innerHTML = loggedOutMarkup;
    if (navDashboardItem) navDashboardItem.style.display = 'none';
  }

  function bindLogout(client) {
    const logoutBtn = document.getElementById('logoutBtn');
    if (!logoutBtn || !client || !client.auth) return;
    logoutBtn.addEventListener('click', async () => {
      try {
        await client.auth.signOut();
      } catch (_err) {
      } finally {
        setLoggedOutMarkup();
        window.location.href = 'index.html';
      }
    });
  }

  function setLoggedInMarkup(client) {
    authButtons.innerHTML = loggedInMarkup;
    if (navDashboardItem) navDashboardItem.style.display = '';
    bindLogout(client);
  }

  setLoggedOutMarkup();

  const client = window.supabaseClient;
  if (!client || !client.auth) {
    return;
  }

  client.auth.getSession()
    .then(({ data }) => {
      const session = data?.session || null;
      if (session && session.user) {
        setLoggedInMarkup(client);
      } else {
        setLoggedOutMarkup();
      }
    })
    .catch(() => setLoggedOutMarkup());

  client.auth.onAuthStateChange((_event, session) => {
    if (session && session.user) {
      setLoggedInMarkup(client);
    } else {
      setLoggedOutMarkup();
    }
  });
})();
