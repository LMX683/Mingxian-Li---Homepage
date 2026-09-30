(() => {
  const root = document.documentElement;
  const toggle = document.getElementById('themeToggle');
  const preference = window.matchMedia('(prefers-color-scheme: dark)');
  let saved = null;
  try { saved = localStorage.getItem('theme'); } catch (_) {}
  if (saved !== 'dark' && saved !== 'light') saved = null;
  function applyTheme(theme) {
    root.dataset.theme = theme;
    const dark = theme === 'dark';
    toggle.setAttribute('aria-pressed', String(dark));
    toggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    toggle.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    document.querySelector('meta[name="theme-color"]').content = dark ? '#191c1b' : '#faf9f7';
  }
  applyTheme(saved || (preference.matches ? 'dark' : 'light'));
  toggle.addEventListener('click', () => {
    saved = root.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(saved);
    try { localStorage.setItem('theme', saved); } catch (_) {}
  });
  preference.addEventListener('change', event => {
    if (!saved) applyTheme(event.matches ? 'dark' : 'light');
  });
  const links = Array.from(document.querySelectorAll('.nav-links a'));
  const sections = Array.from(document.querySelectorAll('main > section'));
  let scheduled = false;
  function updateNavigation() {
    const boundary = document.querySelector('.top-nav').getBoundingClientRect().bottom + 55;
    let current = sections[0].id;
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= boundary) current = section.id;
    }
    for (const link of links) {
      if (link.hash === '#' + current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
    scheduled = false;
  }
  window.addEventListener('scroll', () => {
    if (!scheduled) { scheduled = true; requestAnimationFrame(updateNavigation); }
  }, { passive: true });
  window.addEventListener('resize', updateNavigation);
  updateNavigation();
})();
