// Authentication logic for login/register

document.addEventListener('DOMContentLoaded', () => {
  // Login form
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;

      try {
        const client = window.supabaseClient;
        if (!client || !client.auth || typeof client.auth.signInWithPassword !== 'function') {
          throw new Error('Supabase client not initialized or auth.signInWithPassword unavailable.');
        }

        const { data, error } = await client.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;

        // No need to check subscription - all users can login
        // Free users see 3 stocks, paid users see all
        window.location.href = 'dashboard.html';
      } catch (error) {
        document.getElementById('error').textContent = error.message;
      }
    });
  }

  // Register form
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;

      try {
        const client = window.supabaseClient;
        if (!client || !client.auth || typeof client.auth.signUp !== 'function') {
          throw new Error('Supabase client not initialized or auth.signUp unavailable. Check `js/config.js` and CDN include.');
        }

        // Create user account
        const { data, error } = await client.auth.signUp({
          email,
          password
        });

        if (error) throw error;

        // Profile is auto-created by Supabase trigger with 'free' status
        alert('Account created successfully!');
        window.location.href = 'dashboard.html';
      } catch (error) {
        const el = document.getElementById('error');
        el.textContent = error.message || String(error);
        console.error('Registration error:', error);
      }
    });
  }
});
