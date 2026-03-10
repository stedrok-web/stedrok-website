// Mobile menu toggle - shared across all pages
document.addEventListener('DOMContentLoaded', () => {
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const navLinks = document.getElementById('navLinks');

  if (!mobileMenuToggle || !navLinks) return;

  const navbar = mobileMenuToggle.closest('.navbar');
  const logoLink = navbar ? navbar.querySelector('.logo') : null;
  const isMobileViewport = () => window.innerWidth <= 768;
  const routeAliases = new Map([
    ['index.html', '__home__'],
    ['index.audit.html', '__home__'],
    ['/', '__home__'],
    ['philosophy.html', 'philosophy.html'],
    ['about.html', 'philosophy.html'],
    ['authors.html', 'philosophy.html'],
    ['research-trust-disclosures.html', 'philosophy.html'],
    ['methodology.html', 'methodology.html'],
    ['learn.html', 'methodology.html'],
    ['etfs.html', 'methodology.html'],
    ['dashboard-guide.html', 'methodology.html'],
    ['guide-long-term-value-portfolio.html', 'methodology.html'],
    ['value-investing-glossary.html', 'methodology.html'],
    ['pricing.html', 'pricing.html'],
    ['contact.html', 'contact.html'],
    ['site-map.html', 'contact.html'],
    ['terms.html', 'contact.html'],
    ['privacy.html', 'contact.html'],
    ['404.html', 'contact.html']
  ]);

  const normalizePath = (value) => {
    if (!value) return 'index.html';
    const clean = value.split('#')[0].split('?')[0];
    if (!clean || clean === '/') return 'index.html';
    const parts = clean.split('/');
    return parts[parts.length - 1] || 'index.html';
  };

  const applyActiveNavState = () => {
    const currentPage = normalizePath(window.location.pathname);
    const activeTarget = routeAliases.get(currentPage) || currentPage;
    const navAnchors = Array.from(navLinks.querySelectorAll('a'));

    navAnchors.forEach((link) => {
      link.classList.remove('active');
      link.removeAttribute('aria-current');
    });

    if (logoLink) {
      logoLink.classList.remove('active');
      logoLink.removeAttribute('aria-current');
    }

    if (activeTarget === '__home__') {
      if (logoLink) {
        logoLink.classList.add('active');
        logoLink.setAttribute('aria-current', 'page');
      }
      return;
    }

    const activeLink = navAnchors.find((link) => normalizePath(link.getAttribute('href')) === activeTarget);
    if (activeLink) {
      activeLink.classList.add('active');
      activeLink.setAttribute('aria-current', 'page');
    }
  };

  const syncA11yState = (isOpen) => {
    mobileMenuToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    mobileMenuToggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    navLinks.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  };

  mobileMenuToggle.type = 'button';
  mobileMenuToggle.setAttribute('aria-controls', 'navLinks');
  applyActiveNavState();

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
