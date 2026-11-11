(function () {
  const t = document.querySelector('.nav-toggle');
  const m = document.getElementById('menu');
  if (t && m) t.addEventListener('click', () => {
    const open = m.classList.toggle('open');
    t.setAttribute('aria-expanded', open);
    document.body.classList.toggle('menu-open', open);
  });

  const cf = document.getElementById('contactForm');
  if (cf) cf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = cf.querySelector('.form-msg');
    if (!cf.checkValidity()) { out.textContent = 'Please fill in your name, email and phone.'; return; }
    const btn = cf.querySelector('button[type=submit]');
    btn.disabled = true; out.textContent = 'Sending…';
    try {
      const r = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(cf))) });
      const j = await r.json();
      if (j.ok) { cf.reset(); out.textContent = 'Thanks — an advisor will reach out shortly.'; out.classList.add('ok'); }
      else out.textContent = j.error || 'Something went wrong.';
    } catch (err) { out.textContent = 'Network error. Please call 516-246-1215.'; }
    btn.disabled = false;
  });
})();
