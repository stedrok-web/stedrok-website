(function initHomeAuthNavigation() {
  var client = window.supabaseClient;
  if (!client || !client.auth) return;

  var loginBtn = document.getElementById('loginBtn');
  var registerBtn = document.getElementById('registerBtn');
  var dashboardBtn = document.getElementById('dashboardBtn');
  var logoutBtn = document.getElementById('logoutBtn');

  client.auth.getSession().then(function (result) {
    var session = result && result.data ? result.data.session : null;
    if (!session) return;

    if (loginBtn) loginBtn.style.display = 'none';
    if (registerBtn) registerBtn.style.display = 'none';
    if (dashboardBtn) dashboardBtn.style.display = 'inline-block';
    if (logoutBtn) logoutBtn.style.display = 'inline-block';
  }).catch(function (error) {
    console.warn('Home auth nav session check failed:', error);
  });

  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      client.auth.signOut()
        .then(function () {
          window.location.reload();
        })
        .catch(function (error) {
          console.error('Logout failed:', error);
        });
    });
  }
})();
