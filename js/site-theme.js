(function initSiteTheme() {
  var STORAGE_KEY = 'stedrok-theme';
  var DEFAULT_THEME = 'dark';
  var BUTTON_CLASS = 'theme-toggle';

  function getSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function getTheme() {
    return localStorage.getItem(STORAGE_KEY) || document.documentElement.getAttribute('data-theme') || getSystemTheme();
  }

  function isNonDefault(theme) {
    return theme !== DEFAULT_THEME;
  }

  function buildButton(location) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = BUTTON_CLASS;
    button.dataset.themeLocation = location;
    button.innerHTML = '<span class="theme-toggle__glyph" aria-hidden="true"></span><span class="theme-toggle__text">Theme</span>';
    button.addEventListener('click', function () {
      var nextTheme = getTheme() === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY, nextTheme);
      applyTheme(nextTheme);
    });
    return button;
  }

  function updateButtons(theme) {
    var nextLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    var glyph = theme === 'dark' ? '\u263e' : '\u2600';
    document.querySelectorAll('.' + BUTTON_CLASS).forEach(function (button) {
      var glyphNode = button.querySelector('.theme-toggle__glyph');
      if (glyphNode) glyphNode.textContent = glyph;
      button.setAttribute('aria-label', nextLabel);
      button.setAttribute('aria-pressed', isNonDefault(theme) ? 'true' : 'false');
      button.setAttribute('title', nextLabel);
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    updateButtons(theme);
  }

  function mountNavButton(navbar) {
    if (!navbar || navbar.querySelector('.' + BUTTON_CLASS)) return;
    var utilityGroup = document.createElement('div');
    utilityGroup.className = 'nav-utility-group';
    utilityGroup.appendChild(buildButton('nav'));
    var authButtons = navbar.querySelector('.auth-buttons');
    if (authButtons) {
      navbar.insertBefore(utilityGroup, authButtons);
    } else {
      navbar.appendChild(utilityGroup);
    }
  }

  function mountFooterButton(footerMain) {
    if (!footerMain || footerMain.querySelector('.footer-tools .' + BUTTON_CLASS)) return;
    var tools = document.createElement('div');
    tools.className = 'footer-tools';
    tools.appendChild(buildButton('footer'));
    footerMain.appendChild(tools);
  }

  function mountButtons() {
    document.querySelectorAll('.navbar').forEach(mountNavButton);
    document.querySelectorAll('.footer-main').forEach(mountFooterButton);
  }

  function init() {
    mountButtons();
    applyTheme(getTheme());

    var media = window.matchMedia('(prefers-color-scheme: dark)');
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', function () {
        if (!localStorage.getItem(STORAGE_KEY)) {
          applyTheme(getSystemTheme());
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
