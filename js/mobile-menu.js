// Mobile menu toggle - shared across all pages
document.addEventListener('DOMContentLoaded', () => {
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const navLinks = document.getElementById('navLinks');

  if (!mobileMenuToggle || !navLinks) return;

  const navbar = mobileMenuToggle.closest('.navbar');

  const closeMenu = () => {
    mobileMenuToggle.classList.remove('active');
    navLinks.classList.remove('active');
    mobileMenuToggle.setAttribute('aria-expanded', 'false');
    if (navbar) navbar.classList.remove('menu-open');
  };

  const openMenu = () => {
    mobileMenuToggle.classList.add('active');
    navLinks.classList.add('active');
    mobileMenuToggle.setAttribute('aria-expanded', 'true');
    if (navbar) navbar.classList.add('menu-open');
  };

  mobileMenuToggle.setAttribute('aria-expanded', 'false');

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
    if (event.key === 'Escape') closeMenu();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      closeMenu();
    }
  });
});
