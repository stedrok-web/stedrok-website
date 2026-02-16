// Authentication logic for login/register

document.addEventListener('DOMContentLoaded', () => {
  // Login form
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const errorEl = document.getElementById('error');

      // Clear previous errors
      errorEl.textContent = '';

      // Validate inputs
      if (!email || !email.includes('@')) {
        errorEl.textContent = 'Please enter a valid email address.';
        return;
      }
      if (!password || password.length < 6) {
        errorEl.textContent = 'Password must be at least 6 characters.';
        return;
      }

      try {
        const client = window.supabaseClient;
        if (!client || !client.auth || typeof client.auth.signInWithPassword !== 'function') {
          throw new Error('Authentication system not ready. Please refresh the page.');
        }

        const { data, error } = await client.auth.signInWithPassword({
          email: email,
          password: password
        });

        if (error) {
          // Handle specific error cases
          if (error.message.includes('Invalid login credentials')) {
            throw new Error('Invalid email or password. Please try again.');
          } else if (error.message.includes('Email not confirmed') || error.message.includes('email_not_confirmed')) {
            // Show resend confirmation option
            errorEl.innerHTML = `
              Please check your email and confirm your account first.
              <br><br>
              <button id="resendConfirmation" class="btn btn-sm btn-secondary" style="margin-top: 10px;">
                Resend Confirmation Email
              </button>
            `;
            
            // Add click handler for resend button
            setTimeout(() => {
              document.getElementById('resendConfirmation')?.addEventListener('click', async () => {
                try {
                  await client.auth.resend({
                    type: 'signup',
                    email: email
                  });
                  errorEl.textContent = '✓ Confirmation email sent! Please check your inbox.';
                  errorEl.style.color = 'green';
                } catch (err) {
                  errorEl.textContent = 'Failed to resend email. Please try again later.';
                }
              });
            }, 0);
            return;
          } else {
            throw error;
          }
        }

        // Success - redirect to dashboard
        window.location.href = 'dashboard.html';
      } catch (error) {
        console.error('Login error:', error);
        errorEl.textContent = error.message || 'Login failed. Please try again.';
      }
    });
  }

  // Register form
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const errorEl = document.getElementById('error');

      // Clear previous errors
      errorEl.textContent = '';

      // Validate inputs
      if (!email || !email.includes('@') || !email.includes('.')) {
        errorEl.textContent = 'Please enter a valid email address (e.g., name@example.com).';
        return;
      }
      if (!password || password.length < 8) {
        errorEl.textContent = 'Password must be at least 8 characters long.';
        return;
      }

      try {
        const client = window.supabaseClient;
        if (!client || !client.auth || typeof client.auth.signUp !== 'function') {
          throw new Error('Authentication system not ready. Please refresh the page.');
        }

        // Create user account
        const { data, error } = await client.auth.signUp({
          email: email,
          password: password
        });

        if (error) {
          // Handle specific error cases
          if (error.message.includes('User already registered')) {
            throw new Error('This email is already registered. Please log in instead.');
          } else if (error.message.includes('Password should be')) {
            throw new Error('Password must be at least 8 characters with a mix of letters and numbers.');
          } else {
            throw error;
          }
        }

        // Profile is auto-created by Supabase trigger with 'free' status
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          // Email already exists
          errorEl.textContent = 'This email is already registered. Please log in instead.';
          return;
        }

        alert('Account created successfully! You can now log in.');
        window.location.href = 'login.html';
      } catch (error) {
        errorEl.textContent = error.message || 'Registration failed. Please try again.';
        console.error('Registration error:', error);
      }
    });
  }
});
