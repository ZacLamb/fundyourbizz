(function () {
  const form = document.getElementById('appForm');
  if (!form) return;
  const steps = [...form.querySelectorAll('.step')];
  const stepper = [...document.querySelectorAll('#stepper li')];
  const bar = document.getElementById('bar');
  const count = document.getElementById('stepCount');
  const back = document.getElementById('backBtn');
  const next = document.getElementById('nextBtn');
  const submit = document.getElementById('submitBtn');
  const msg = document.getElementById('formMsg');
  let current = 0;

  // ---------- Dates ----------
  const today = new Date();
  const iso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  form.signature_date.value = iso;
  form.querySelectorAll('input[type=date]').forEach((d) => { if (d.name !== 'signature_date' && d.name !== 'second_owner_signature_date') d.max = iso; });

  // ---------- Prefill from the homepage quick-start ----------
  try {
    const q = JSON.parse(sessionStorage.getItem('fyb_quick') || 'null');
    if (q) {
      if (q.amount && !form.requested_amount.value) form.requested_amount.value = Number(q.amount).toLocaleString('en-US');
      if (q.use && !form.use_of_funds.value) form.use_of_funds.value = q.use;
    }
  } catch (e) {}

  // ---------- Masks ----------
  const masks = {
    phone: (v) => { const d = v.replace(/\D/g, '').slice(0, 10); return d.length > 6 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d.length > 3 ? `(${d.slice(0, 3)}) ${d.slice(3)}` : d; },
    ssn: (v) => { const d = v.replace(/\D/g, '').slice(0, 9); return d.length > 5 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d; },
    ein: (v) => { const d = v.replace(/\D/g, '').slice(0, 9); return d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d; },
    money: (v) => { const d = v.replace(/\D/g, '').slice(0, 9); return d ? Number(d).toLocaleString('en-US') : ''; },
  };
  form.querySelectorAll('[data-mask]').forEach((el) => {
    el.addEventListener('input', () => { el.value = masks[el.dataset.mask](el.value); });
  });

  // ---------- Partner toggle ----------
  const partnerFields = document.getElementById('partnerFields');
  const secondSig = document.getElementById('secondSig');
  function syncPartner() {
    const on = form.querySelector('input[name=has_partner]:checked').value === 'yes';
    partnerFields.hidden = !on;
    secondSig.hidden = !on;
    partnerFields.querySelectorAll('[data-partner]').forEach((el) => { el.required = on; if (!on) el.value = ''; });
    if (on && !form.second_owner_signature_date.value) form.second_owner_signature_date.value = iso;
    if (!on) { form.second_owner_signature_date.value = ''; pads.second_owner_signature && pads.second_owner_signature.clear(); }
    if (on) setTimeout(() => pads.second_owner_signature && pads.second_owner_signature.resize(), 0);
  }
  form.querySelectorAll('input[name=has_partner]').forEach((r) => r.addEventListener('change', syncPartner));

  // ---------- Drop zones ----------
  form.querySelectorAll('[data-drop]').forEach((zone) => {
    const input = zone.querySelector('input');
    const label = zone.querySelector('.drop-f');
    const show = () => {
      const f = input.files[0];
      zone.classList.toggle('has', !!f);
      label.textContent = f ? `${f.name} · ${(f.size / 1048576).toFixed(1)} MB` : 'Choose file or drag it here';
      if (f && f.size > 25 * 1048576) { zone.classList.add('bad'); label.textContent = 'File is over 25 MB — please choose a smaller file'; } else zone.classList.remove('bad');
    };
    input.addEventListener('change', show);
    ['dragenter', 'dragover'].forEach((e) => zone.addEventListener(e, (ev) => { ev.preventDefault(); zone.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((e) => zone.addEventListener(e, () => zone.classList.remove('over')));
    zone.addEventListener('drop', (ev) => { ev.preventDefault(); if (ev.dataTransfer.files.length) { input.files = ev.dataTransfer.files; show(); } });
  });

  // ---------- Signature pads ----------
  const pads = {};
  function makePad(name) {
    const canvas = document.getElementById(`sig_${name}`);
    const hidden = form.querySelector(`input[name=${name}_data]`);
    const ctx = canvas.getContext('2d');
    let drawing = false, dirty = false, last = null;
    function resize() {
      const r = canvas.getBoundingClientRect();
      if (!r.width) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const prev = dirty ? canvas.toDataURL() : null;
      canvas.width = r.width * ratio; canvas.height = r.height * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0B1B4D';
      if (prev) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height); img.src = prev; }
    }
    function pos(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    canvas.addEventListener('pointerdown', (e) => { drawing = true; last = pos(e); canvas.setPointerCapture(e.pointerId); e.preventDefault(); });
    canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const p = pos(e);
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p; dirty = true; canvas.classList.add('signed');
    });
    const end = () => { if (drawing) { drawing = false; hidden.value = dirty ? exportPng() : ''; } };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    // Export on a white background so the PDF renders cleanly
    function exportPng() {
      const out = document.createElement('canvas');
      out.width = canvas.width; out.height = canvas.height;
      const o = out.getContext('2d');
      o.fillStyle = '#fff'; o.fillRect(0, 0, out.width, out.height); o.drawImage(canvas, 0, 0);
      return out.toDataURL('image/png');
    }
    function clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); dirty = false; hidden.value = ''; canvas.classList.remove('signed'); }
    window.addEventListener('resize', resize);
    return { resize, clear, isEmpty: () => !dirty };
  }
  pads.signature = makePad('signature');
  pads.second_owner_signature = makePad('second_owner_signature');
  form.querySelectorAll('[data-clear]').forEach((b) => b.addEventListener('click', () => pads[b.dataset.clear].clear()));

  // ---------- Steps ----------
  function show(i) {
    current = i;
    steps.forEach((s, n) => (s.hidden = n !== i));
    stepper.forEach((li, n) => { li.classList.toggle('on', n === i); li.classList.toggle('done', n < i); });
    bar.style.width = `${((i + 1) / steps.length) * 100}%`;
    count.textContent = `Step ${i + 1} of ${steps.length}`;
    back.hidden = i === 0;
    next.hidden = i === steps.length - 1;
    submit.hidden = i !== steps.length - 1;
    msg.textContent = '';
    if (i === steps.length - 1) setTimeout(() => { pads.signature.resize(); pads.second_owner_signature.resize(); }, 0);
    const top = form.getBoundingClientRect().top + window.scrollY - 90;
    if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
  }

  function validate(i) {
    const step = steps[i];
    let firstBad = null;
    step.querySelectorAll('.bad-field').forEach((el) => el.classList.remove('bad-field'));
    const els = [...step.querySelectorAll('input, select, textarea')].filter((el) => !el.closest('[hidden]') && el.type !== 'hidden');
    const radios = new Set();
    for (const el of els) {
      if (el.type === 'radio') { if (el.required) radios.add(el.name); continue; }
      let ok = el.checkValidity();
      if (el.dataset.mask === 'ssn' && el.value && el.value.replace(/\D/g, '').length !== 9) ok = false;
      if (el.dataset.mask === 'ein' && el.value && el.value.replace(/\D/g, '').length !== 9) ok = false;
      if (el.dataset.mask === 'phone' && el.value && el.value.replace(/\D/g, '').length !== 10) ok = false;
      if (el.type === 'file' && el.files[0] && el.files[0].size > 25 * 1048576) ok = false;
      if (!ok) { (el.closest('.drop') || el).classList.add('bad-field'); firstBad = firstBad || el; }
    }
    radios.forEach((name) => {
      if (!step.querySelector(`input[name="${name}"]:checked`)) {
        const row = step.querySelector(`input[name="${name}"]`).closest('.radio-row');
        row.classList.add('bad-field'); firstBad = firstBad || row;
      }
    });
    if (i === steps.length - 1) {
      if (pads.signature.isEmpty()) { document.getElementById('sig_signature').classList.add('bad-field'); firstBad = firstBad || document.getElementById('sig_signature'); }
    }
    if (firstBad) {
      msg.textContent = i === steps.length - 1 && pads.signature.isEmpty() ? 'Please sign in the box and accept the terms to submit.' : 'Please complete the highlighted fields.';
      firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (firstBad.focus) try { firstBad.focus({ preventScroll: true }); } catch (e) {}
      return false;
    }
    return true;
  }

  next.addEventListener('click', () => { if (validate(current)) show(current + 1); });
  back.addEventListener('click', () => show(current - 1));
  stepper.forEach((li) => li.addEventListener('click', () => {
    const n = +li.dataset.step;
    if (n < current) show(n);
  }));
  form.addEventListener('input', (e) => { const t = e.target.closest('.bad-field') || e.target; t.classList && t.classList.remove('bad-field'); });
  form.addEventListener('change', (e) => { const r = e.target.closest('.radio-row, .drop'); r && r.classList.remove('bad-field'); });

  // ---------- Submit ----------
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    for (let i = 0; i < steps.length; i++) { if (!validate(i)) { show(i); validate(i); return; } }
    const fd = new FormData(form);
    ['requested_amount', 'revenue'].forEach((k) => fd.set(k, String(fd.get(k) || '').replace(/[^0-9.]/g, '')));
    fd.delete('has_partner');

    const overlay = document.getElementById('uploading');
    overlay.hidden = false; submit.disabled = true; back.disabled = true;
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/apply');
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) overlay.querySelector('strong').textContent = `Uploading… ${Math.round((ev.loaded / ev.total) * 100)}%`;
    };
    xhr.onload = () => {
      let res = {};
      try { res = JSON.parse(xhr.responseText); } catch (err) {}
      if (xhr.status === 200 && res.ok) {
        window.location.href = '/apply/thank-you' + (res.ref ? `?ref=${encodeURIComponent(res.ref)}` : '');
      } else {
        overlay.hidden = true; submit.disabled = false; back.disabled = false;
        msg.textContent = res.error || 'Something went wrong. Please try again or call 516-246-1215.';
      }
    };
    xhr.onerror = () => {
      overlay.hidden = true; submit.disabled = false; back.disabled = false;
      msg.textContent = 'Network error. Please check your connection and try again.';
    };
    xhr.send(fd);
  });

  show(0);
})();
