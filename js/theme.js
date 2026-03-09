(function () {
  const STORAGE_KEY = 'stedrok-theme';
  const root = document.documentElement;
  function getTheme() { return root.getAttribute('data-theme') || 'dark'; }
  function setTheme(theme) {
    const next = theme === 'light' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch (_err) {}
    updateThemeToggleState();
  }
  function toggleTheme() { setTheme(getTheme() === 'dark' ? 'light' : 'dark'); }
  function updateThemeToggleState() {
    const theme = getTheme();
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      const toTheme = theme === 'dark' ? 'light' : 'dark';
      button.setAttribute('aria-label', 'Switch to ' + toTheme + ' mode');
      button.setAttribute('title', 'Switch to ' + toTheme + ' mode');
      button.setAttribute('aria-pressed', theme !== 'dark' ? 'true' : 'false');
      button.dataset.theme = theme;
    });
  }
  function makeToggleButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-toggle';
    button.dataset.themeToggle = 'true';
    button.innerHTML = '<span class="visually-hidden">Toggle theme</span><span class="theme-toggle-icon" aria-hidden="true"></span>';
    button.addEventListener('click', toggleTheme);
    return button;
  }
  function mountToggle() {
    if (document.querySelector('[data-theme-toggle]')) { updateThemeToggleState(); return; }
    const authButtons = document.getElementById('authButtons') || document.querySelector('.auth-buttons');
    if (authButtons) { authButtons.prepend(makeToggleButton()); updateThemeToggleState(); return; }
    const navbar = document.querySelector('.navbar');
    if (navbar) {
      const wrap = document.createElement('div');
      wrap.className = 'nav-actions';
      wrap.appendChild(makeToggleButton());
      navbar.appendChild(wrap);
      updateThemeToggleState();
      return;
    }
    const body = document.body;
    if (body) {
      const floating = makeToggleButton();
      floating.style.position = 'fixed';
      floating.style.right = '20px';
      floating.style.bottom = '20px';
      floating.style.zIndex = '210';
      body.appendChild(floating);
      updateThemeToggleState();
    }
  }
  document.addEventListener('DOMContentLoaded', () => { mountToggle(); updateThemeToggleState(); });
  window.StedrokTheme = { getTheme, setTheme, toggleTheme };
})();
