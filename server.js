const path = require('path');
const express = require('express');
const multer = require('multer');
const { submitApplication, submitContact, getFieldMap } = require('./lib/ghl');
const site = require('./lib/site');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', true);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// Redirect www -> apex
app.use((req, res, next) => {
  const host = req.headers.host || '';
  if (host.startsWith('www.')) return res.redirect(301, `https://${host.slice(4)}${req.originalUrl}`);
  next();
});

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));
// Photo not downloaded at build time -> fall back to its source URL
const photos = require('./lib/photos');
app.get('/img/photos/:name.jpeg', (req, res) => {
  const src = photos[req.params.name];
  if (!src) return res.status(404).end();
  res.redirect(302, src);
});
app.use(express.urlencoded({ extended: false, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));

app.locals.site = site;

// ---------- Pages ----------
const pages = [
  ['/', 'home'],
  ['/about', 'about'],
  ['/services', 'services'],
  ['/revenue-based-financing', 'rbf'],
  ['/how-it-works', 'how'],
  ['/faq', 'faq'],
  ['/contact', 'contact'],
  ['/apply', 'apply'],
  ['/apply/thank-you', 'thanks'],
  ['/privacy-policy', 'privacy'],
  ['/terms-and-conditions', 'terms'],
];
for (const [route, view] of pages) {
  app.get(route, (req, res) => res.render(view, { path: route, meta: site.meta[view] || {} }));
}

// Old GHL site URLs -> new pages
const redirects = {
  '/home': '/', '/about-us': '/about', '/our-services': '/services', '/contact-us': '/contact',
  '/faqs': '/faq', '/testimonials': '/', '/blog': '/', '/privacy': '/privacy-policy',
  '/terms': '/terms-and-conditions', '/application': '/apply', '/apply-now': '/apply',
};
for (const [from, to] of Object.entries(redirects)) app.get(from, (req, res) => res.redirect(301, to));

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /apply/thank-you\nSitemap: ${site.url}/sitemap.xml\n`);
});

app.get('/sitemap.xml', (req, res) => {
  const urls = pages.filter(([r]) => r !== '/apply/thank-you').map(([r]) => `<url><loc>${site.url}${r === '/' ? '' : r}</loc></url>`).join('');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
});

app.get('/health', (req, res) => res.json({ ok: true }));

// Confirms the API key works and every survey field exists in the sub-account.
app.get('/health/ghl', async (req, res) => {
  try {
    const map = await getFieldMap();
    const needed = ['dba', 'legal_business_type', 'industry', 'ein', 'business_start_date_v2', 'business_phone',
      'business_address', 'business_city', 'business_state', 'business_zip', 'do_you_rent_or_own_your_business_space',
      'business_description', 'requested_amount', 'revenue', 'use_of_funds',
      'do_you_currently_have_funding_from_another_lender', 'owner_ownership_percent', 'social_security_number',
      'credit_score', 'partner_first_name', 'partner_last_name', 'partner_email', 'partner_ssn', 'partner_address',
      'partner_date_of_birth_v2', 'bank_statement_1', 'bank_statement_2', 'bank_statement_3', 'bank_statement_4',
      'signature', 'signature_date', 'second_owner_signature', 'second_owner_signature_date'];
    const missing = needed.filter((k) => !map[k]);
    res.json({ ok: missing.length === 0, fieldsFound: needed.length - missing.length, missing, workflowSet: !!process.env.GHL_WORKFLOW_ID });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- Simple per-IP rate limit ----------
const hits = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = `${req.path}:${req.ip}`;
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) return res.status(429).json({ ok: false, error: 'Too many submissions. Please call us at ' + site.phone + '.' });
    list.push(now);
    hits.set(key, list);
    next();
  };
}
setInterval(() => hits.clear(), 60 * 60 * 1000).unref();

// ---------- Application ----------
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 4, fields: 80 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED.includes(file.mimetype) || /\.(pdf|jpe?g|png|heic)$/i.test(file.originalname)) return cb(null, true);
    cb(new Error('Bank statements must be PDF, JPG or PNG files.'));
  },
}).fields([1, 2, 3, 4].map((n) => ({ name: `bank_statement_${n}`, maxCount: 1 })));

const REQUIRED = ['organization', 'dba', 'legal_business_type', 'industry', 'ein', 'business_start_date_v2',
  'business_address', 'business_city', 'business_state', 'business_zip', 'business_description',
  'requested_amount', 'revenue', 'use_of_funds', 'do_you_currently_have_funding_from_another_lender',
  'owner_ownership_percent', 'full_name', 'address', 'city', 'state', 'postal_code', 'email', 'phone',
  'social_security_number', 'date_of_birth', 'credit_score', 'signature_data', 'signature_date'];

app.post('/api/apply', rateLimit(5, 60 * 60 * 1000), (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ ok: false, error: err.message });
    const body = req.body || {};
    if (body.company_website_hp) return res.json({ ok: true }); // honeypot
    const missing = REQUIRED.filter((k) => !String(body[k] || '').trim());
    const files = req.files || {};
    const statements = [1, 2, 3, 4].filter((n) => files[`bank_statement_${n}`]);
    if (statements.length < 4) missing.push('bank statements');
    if (body.terms_accepted !== 'yes') missing.push('terms');
    if (missing.length) return res.status(400).json({ ok: false, error: 'Please complete all required fields.', missing });

    try {
      const result = await submitApplication(body, files);
      res.json({ ok: true, ref: result.contactId.slice(-6).toUpperCase() });
    } catch (e) {
      console.error('[apply] failed:', e.message);
      res.status(502).json({ ok: false, error: `We couldn't submit your application right now. Please try again or call ${site.phone}.` });
    }
  });
});

app.post('/api/contact', rateLimit(8, 60 * 60 * 1000), async (req, res) => {
  const body = req.body || {};
  if (body.company_website_hp) return res.json({ ok: true });
  if (!body.name || !body.email || !body.phone) return res.status(400).json({ ok: false, error: 'Name, email and phone are required.' });
  try {
    await submitContact(body);
    res.json({ ok: true });
  } catch (e) {
    console.error('[contact] failed:', e.message);
    res.status(502).json({ ok: false, error: `Something went wrong. Please call ${site.phone}.` });
  }
});

app.use((req, res) => res.status(404).render('404', { path: req.path, meta: { title: 'Page not found | Fund Your Bizz' } }));

app.listen(PORT, () => console.log(`Fund Your Bizz running on :${PORT}`));
