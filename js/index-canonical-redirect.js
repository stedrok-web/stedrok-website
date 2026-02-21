(function enforceCanonicalHomePath() {
  try {
    var pathname = window.location.pathname || '';
    if (!/\/index\.html$/i.test(pathname)) return;

    var target = 'https://stedrok.org/' + (window.location.search || '') + (window.location.hash || '');
    if (window.location.href !== target) {
      window.location.replace(target);
    }
  } catch (error) {
    console.warn('Canonical home redirect skipped:', error);
  }
})();
