document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('mobileMenuToggle');
  const navLinks = document.getElementById('navLinks');
  const body = document.body;
  if (!toggle || !navLinks || !body) return;

  const authButtons = document.getElementById('authButtons') || document.querySelector('.auth-buttons');
  const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  let lastFocusedElement = null;

  if (!navLinks.id) {
    navLinks.id = 'navLinks';
  }

  toggle.setAttribute('aria-controls', navLinks.id);
  toggle.setAttribute('aria-expanded', 'false');
  navLinks.setAttribute('aria-hidden', 'true');

  function getFocusableElements() {
    const scopes = authButtons ? [navLinks, authButtons] : [navLinks];
    return scopes.flatMap((scope) => Array.from(scope.querySelectorAll(FOCUSABLE_SELECTOR))).filter((element) => {
      if (element.hasAttribute('disabled')) return false;
      return element.offsetParent !== null || element.getClientRects().length > 0;
    });
  }

  function setToggleState(open) {
    toggle.classList.toggle('active', open);
    navLinks.classList.toggle('active', open);
    body.classList.toggle('mobile-menu-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    navLinks.setAttribute('aria-hidden', open ? 'false' : 'true');

    if (open) {
      lastFocusedElement = document.activeElement;
      window.requestAnimationFrame(() => {
        getFocusableElements()[0]?.focus({ preventScroll: true });
      });
    } else if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus({ preventScroll: true });
      lastFocusedElement = null;
    }
  }

  function closeMenu() {
    if (!navLinks.classList.contains('active')) return;
    setToggleState(false);
  }

  function openMenu() {
    if (navLinks.classList.contains('active')) return;
    setToggleState(true);
  }

  setToggleState(false);

  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    if (navLinks.classList.contains('active')) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  navLinks.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
  if (authButtons) {
    authButtons.querySelectorAll('a, button').forEach((element) => element.addEventListener('click', closeMenu));
  }

  document.addEventListener('keydown', (event) => {
    if (!navLinks.classList.contains('active')) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = getFocusableElements();
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });

  document.addEventListener('click', (event) => {
    if (!navLinks.classList.contains('active')) return;
    if (navLinks.contains(event.target) || toggle.contains(event.target) || (authButtons && authButtons.contains(event.target))) return;
    closeMenu();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 767) {
      setToggleState(false);
    }
  });
});
