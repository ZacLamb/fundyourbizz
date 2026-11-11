(function () {
  // Mobile menu
  const t = document.querySelector('.nav-toggle');
  const m = document.getElementById('menu');
  if (t && m) t.addEventListener('click', () => {
    const open = m.classList.toggle('open');
    t.setAttribute('aria-expanded', open);
    document.body.classList.toggle('menu-open', open);
  });

  // Scroll reveals + chart animation
  const targets = document.querySelectorAll('.rv, [data-chart]');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    targets.forEach((el) => io.observe(el));
  } else targets.forEach((el) => el.classList.add('in'));

  // Quick start widget -> carries amount + use into the application
  const amt = document.getElementById('qAmt');
  if (amt) {
    const out = document.getElementById('qOut');
    const paint = () => {
      const v = +amt.value;
      out.textContent = '$' + v.toLocaleString('en-US');
      amt.style.setProperty('--p', ((v - amt.min) / (amt.max - amt.min)) * 100 + '%');
    };
    amt.addEventListener('input', paint); paint();
    document.getElementById('qGo').addEventListener('click', () => {
      const use = document.querySelector('input[name=q_use]:checked');
      try { sessionStorage.setItem('fyb_quick', JSON.stringify({ amount: amt.value, use: use ? use.value : '' })); } catch (e) {}
    });
  }

  // Contact form
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
