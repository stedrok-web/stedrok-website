(function redirectLegacyStedrokGptScript() {
  const script = document.createElement('script');
  script.src = 'js/stedrokgpt-cli.js?v=20260409b';
  script.defer = true;
  document.head.appendChild(script);
})();
