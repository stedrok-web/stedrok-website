(function () {
  const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  let faqCount = 0;

  function initBodyFlags() {
    const body = document.body;
    if (!body) return;
    body.classList.add('ui-ready');
  }

  function getFocusableElements(scope) {
    return Array.from(scope.querySelectorAll(FOCUSABLE_SELECTOR)).filter((element) => {
      if (element.hasAttribute('hidden')) return false;
      if (element.getAttribute('aria-hidden') === 'true') return false;
      return element.offsetParent !== null || element.getClientRects().length > 0;
    });
  }

  function syncFaqState(item, button, answer, expanded) {
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    answer.hidden = !expanded;
    item.classList.toggle('is-open', expanded);
  }

  function wrapFaqItem(item) {
    if (!item || item.dataset.faqInit === 'true') return;

    const heading = Array.from(item.children).find((child) => /^H[2-4]$/.test(child.tagName)) || item.querySelector('h2, h3, h4');
    if (!heading) return;

    const contentNodes = Array.from(item.children).filter((child) => child !== heading);
    if (!contentNodes.length) return;

    faqCount += 1;
    const buttonId = 'faq-toggle-' + faqCount;
    const panelId = 'faq-panel-' + faqCount;
    const expanded = item.classList.contains('is-open') || item.dataset.expanded === 'true';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'faq-toggle';
    button.id = buttonId;
    button.setAttribute('aria-controls', panelId);

    const label = document.createElement('span');
    label.className = 'faq-toggle-label';
    label.textContent = heading.textContent || '';

    const icon = document.createElement('span');
    icon.className = 'faq-toggle-icon';
    icon.setAttribute('aria-hidden', 'true');

    button.append(label, icon);

    const answer = document.createElement('div');
    answer.className = 'faq-answer';
    answer.id = panelId;
    answer.setAttribute('role', 'region');
    answer.setAttribute('aria-labelledby', buttonId);

    const inner = document.createElement('div');
    inner.className = 'faq-answer-inner';
    contentNodes.forEach((node) => inner.appendChild(node));
    answer.appendChild(inner);

    heading.replaceWith(button);
    item.appendChild(answer);
    item.dataset.faqInit = 'true';
    item.classList.add('faq-accordion');

    syncFaqState(item, button, answer, expanded);

    button.addEventListener('click', () => {
      const nextExpanded = button.getAttribute('aria-expanded') !== 'true';
      syncFaqState(item, button, answer, nextExpanded);
    });
  }

  function initFaqAccordions() {
    document.querySelectorAll('.faq-item, .faq-card').forEach(wrapFaqItem);
  }

  function trapDialogFocus(event) {
    if (event.key !== 'Tab') return;
    const dialog = document.querySelector('.ticker-insight-panel.is-open[aria-hidden="false"]');
    if (!dialog) return;

    const focusable = getFocusableElements(dialog);
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
  }

  document.addEventListener('DOMContentLoaded', () => {
    initBodyFlags();
    initFaqAccordions();
  });

  document.addEventListener('keydown', trapDialogFocus);
})();
