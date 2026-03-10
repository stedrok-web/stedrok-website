// Mobile menu toggle - shared across all pages
document.addEventListener('DOMContentLoaded', () => {
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const navLinks = document.getElementById('navLinks');

  if (!mobileMenuToggle || !navLinks) return;

  const navbar = mobileMenuToggle.closest('.navbar');
  const isMobileViewport = () => window.innerWidth <= 768;

  const syncA11yState = (isOpen) => {
    mobileMenuToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    mobileMenuToggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    navLinks.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  };

  mobileMenuToggle.type = 'button';
  mobileMenuToggle.setAttribute('aria-controls', 'navLinks');

  const closeMenu = () => {
    mobileMenuToggle.classList.remove('active');
    navLinks.classList.remove('active');
    if (navbar) navbar.classList.remove('menu-open');
    syncA11yState(false);
  };

  const openMenu = () => {
    if (!isMobileViewport()) return;
    mobileMenuToggle.classList.add('active');
    navLinks.classList.add('active');
    if (navbar) navbar.classList.add('menu-open');
    syncA11yState(true);
  };

  if (isMobileViewport()) {
    syncA11yState(false);
  } else {
    mobileMenuToggle.setAttribute('aria-expanded', 'false');
    mobileMenuToggle.setAttribute('aria-label', 'Open menu');
  }

  mobileMenuToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    if (navLinks.classList.contains('active')) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  navLinks.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeMenu);
  });

  if (navbar) {
    navbar.addEventListener('click', (event) => {
      const target = event.target;
      if (target && target.closest && target.closest('.auth-buttons a, .auth-buttons button')) {
        closeMenu();
      }
    });
  }

  document.addEventListener('click', (event) => {
    if (!navbar) return;
    if (!navbar.contains(event.target)) {
      closeMenu();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenu();
      mobileMenuToggle.focus();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      closeMenu();
      navLinks.removeAttribute('aria-hidden');
    } else {
      syncA11yState(navLinks.classList.contains('active'));
    }
  });
});
