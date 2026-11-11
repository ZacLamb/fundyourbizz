// GoHighLevel API v2 helpers for the Fund Your Bizz sub-account.
// Field keys below mirror the existing GHL survey (5Ce1i4S0up81eGQ4HeH8) exactly,
// so website applications land in the same contact fields the survey fills.

const crypto = require('crypto');

const API = process.env.GHL_API_BASE || 'https://services.leadconnectorhq.com';
const LOCATION_ID = process.env.GHL_LOCATION_ID || 'ia4IJ2mcMhzJ0nKV7ajC';
const API_KEY = process.env.GHL_API_KEY || '';
const WORKFLOW_ID = process.env.GHL_WORKFLOW_ID || '';
const APPLICATION_TAG = process.env.GHL_APPLICATION_TAG || 'website application';
const CONTACT_TAG = process.env.GHL_CONTACT_TAG || 'website contact';

// Form input name -> GHL custom field key (contact.<key>). Text-like values.
const CUSTOM_TEXT_FIELDS = [
  'dba',
  'legal_business_type',
  'industry',
  'ein',
  'business_start_date_v2',
  'business_phone',
  'business_address',
  'business_city',
  'business_state',
  'business_zip',
  'do_you_rent_or_own_your_business_space',
  'business_description',
  'requested_amount',
  'revenue',
  'use_of_funds',
  'do_you_currently_have_funding_from_another_lender',
  'owner_ownership_percent',
  'social_security_number',
  'credit_score',
  'partner_first_name',
  'partner_last_name',
  'partner_email',
  'partner_ssn',
  'partner_address',
  'partner_date_of_birth_v2',
  'signature_date',
  'second_owner_signature_date',
];

// File-type custom fields (uploaded through /forms/upload-custom-files).
const FILE_FIELDS = ['bank_statement_1', 'bank_statement_2', 'bank_statement_3', 'bank_statement_4'];
const SIGNATURE_FIELDS = ['signature', 'second_owner_signature'];

let fieldCache = { at: 0, byKey: null };

function headers(version = '2021-07-28', json = true) {
  const h = { Authorization: `Bearer ${API_KEY}`, Version: version, Accept: 'application/json' };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

async function call(path, opts = {}) {
  const res = await fetch(API + path, opts);
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`GHL ${opts.method || 'GET'} ${path.split('?')[0]} -> ${res.status}: ${data.message || text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Map "dba" -> { id, dataType } using the location's custom field catalog (cached 10 min).
async function getFieldMap() {
  if (fieldCache.byKey && Date.now() - fieldCache.at < 10 * 60 * 1000) return fieldCache.byKey;
  const data = await call(`/locations/${LOCATION_ID}/customFields?model=contact`, { headers: headers() });
  const byKey = {};
  for (const f of data.customFields || []) {
    const key = String(f.fieldKey || '').replace(/^contact\./, '');
    if (key) byKey[key] = { id: f.id, dataType: f.dataType, name: f.name };
  }
  fieldCache = { at: Date.now(), byKey };
  return byKey;
}

function clean(v) {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

function toE164(phone) {
  const digits = clean(phone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

function toNumber(v) {
  const n = parseFloat(clean(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : '';
}

function splitName(full) {
  const parts = clean(full).split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function fieldValue(key, raw, def) {
  const v = clean(raw);
  if (!v) return null;
  const type = (def && def.dataType) || '';
  if (type === 'NUMERICAL' || type === 'MONETORY') {
    const n = toNumber(v);
    return n === '' ? null : n;
  }
  if (type === 'PHONE') return toE164(v);
  return v;
}

async function upsertContact(payload) {
  const data = await call('/contacts/upsert', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ locationId: LOCATION_ID, ...payload }),
  });
  const contact = data.contact || data;
  if (!contact || !contact.id) throw new Error('GHL upsert returned no contact id');
  return contact;
}

async function addTags(contactId, tags) {
  return call(`/contacts/${contactId}/tags`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ tags }),
  });
}

async function addNote(contactId, body) {
  return call(`/contacts/${contactId}/notes`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ body }),
  });
}

async function addToWorkflow(contactId, workflowId) {
  return call(`/contacts/${contactId}/workflow/${workflowId}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({}),
  });
}

// files: [{ fieldId, buffer, filename, mimetype }]
async function uploadCustomFiles(contactId, files) {
  if (!files.length) return null;
  const form = new FormData();
  for (const f of files) {
    const blob = new Blob([f.buffer], { type: f.mimetype || 'application/octet-stream' });
    form.append(`${f.fieldId}_${crypto.randomUUID()}`, blob, f.filename);
  }
  return call(
    `/forms/upload-custom-files?contactId=${encodeURIComponent(contactId)}&locationId=${encodeURIComponent(LOCATION_ID)}`,
    { method: 'POST', headers: headers('2021-07-28', false), body: form }
  );
}

function dataUrlToBuffer(dataUrl) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(clean(dataUrl));
  if (!m) return null;
  const buf = Buffer.from(m[1], 'base64');
  return buf.length > 200 ? buf : null; // ignore empty canvases
}

function money(v) {
  const n = toNumber(v);
  return n === '' ? clean(v) : `$${n.toLocaleString('en-US')}`;
}

// Main entry: body = text fields, files = multer files keyed by fieldname
async function submitApplication(body, files) {
  if (!API_KEY) throw Object.assign(new Error('GHL_API_KEY is not set'), { status: 500 });
  const fieldMap = await getFieldMap();
  const missing = [];

  const customFields = [];
  for (const key of CUSTOM_TEXT_FIELDS) {
    const def = fieldMap[key];
    const val = fieldValue(key, body[key], def);
    if (val === null) continue;
    if (!def) { missing.push(key); continue; }
    customFields.push({ id: def.id, field_value: val });
  }

  const { firstName, lastName } = splitName(body.full_name);
  const contactPayload = {
    firstName,
    lastName,
    name: clean(body.full_name),
    email: clean(body.email).toLowerCase(),
    phone: toE164(body.phone),
    address1: clean(body.address),
    city: clean(body.city),
    state: clean(body.state),
    postalCode: clean(body.postal_code),
    companyName: clean(body.organization),
    website: clean(body.website) || undefined,
    dateOfBirth: clean(body.date_of_birth) || undefined,
    source: 'fundyourbizz.com application',
    customFields,
  };
  Object.keys(contactPayload).forEach((k) => contactPayload[k] === '' && delete contactPayload[k]);

  const contact = await upsertContact(contactPayload);
  const contactId = contact.id;
  const problems = [];

  // Bank statements + signatures -> file custom fields
  const uploads = [];
  for (const key of FILE_FIELDS) {
    const f = files[key] && files[key][0];
    if (!f) continue;
    if (!fieldMap[key]) { missing.push(key); continue; }
    uploads.push({ fieldId: fieldMap[key].id, buffer: f.buffer, filename: f.originalname, mimetype: f.mimetype });
  }
  const sigName = clean(body.organization || body.full_name).replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'applicant';
  for (const key of SIGNATURE_FIELDS) {
    const buf = dataUrlToBuffer(body[`${key}_data`]);
    if (!buf) continue;
    if (!fieldMap[key]) { missing.push(key); continue; }
    uploads.push({ fieldId: fieldMap[key].id, buffer: buf, filename: `${key}-${sigName}.png`, mimetype: 'image/png' });
  }
  if (uploads.length) {
    try {
      await uploadCustomFiles(contactId, uploads);
    } catch (e) {
      console.error('[apply] file upload failed:', e.message);
      problems.push(`File upload failed (${e.message}). Ask the applicant to resend statements.`);
    }
  }

  try { await addTags(contactId, [APPLICATION_TAG]); } catch (e) { problems.push(`Tagging failed: ${e.message}`); }

  // Short summary note for reps (never includes SSN/EIN)
  const note = [
    'New application from fundyourbizz.com',
    `Business: ${clean(body.organization)}${body.dba ? ` (DBA ${clean(body.dba)})` : ''}`,
    `Requested: ${money(body.requested_amount)} | Monthly revenue: ${money(body.revenue)}`,
    `Use of funds: ${clean(body.use_of_funds)}`,
    `Industry: ${clean(body.industry)} | Started: ${clean(body.business_start_date_v2)}`,
    `Existing funding: ${clean(body.do_you_currently_have_funding_from_another_lender)} | Credit: ${clean(body.credit_score)}`,
    `Bank statements uploaded: ${uploads.filter((u) => !/signature/.test(u.filename)).length}`,
    missing.length ? `Fields not found in GHL: ${missing.join(', ')}` : '',
    ...problems,
  ].filter(Boolean).join('\n');
  try { await addNote(contactId, note); } catch (e) { console.error('[apply] note failed:', e.message); }

  // Enroll in the existing survey -> PDF workflow last, so every field and file is in place.
  let workflow = 'skipped (GHL_WORKFLOW_ID not set)';
  if (WORKFLOW_ID) {
    try { await addToWorkflow(contactId, WORKFLOW_ID); workflow = 'enrolled'; } catch (e) {
      workflow = `failed: ${e.message}`;
      console.error('[apply] workflow enroll failed:', e.message);
    }
  }

  if (missing.length) console.warn('[apply] custom fields missing in location:', missing.join(', '));
  console.log(`[apply] contact ${contactId} | files ${uploads.length} | workflow ${workflow}`);
  return { contactId, workflow, missing, problems };
}

async function submitContact(body) {
  if (!API_KEY) throw Object.assign(new Error('GHL_API_KEY is not set'), { status: 500 });
  const { firstName, lastName } = splitName(body.name);
  const payload = {
    firstName,
    lastName,
    email: clean(body.email).toLowerCase(),
    phone: toE164(body.phone),
    companyName: clean(body.company) || undefined,
    source: 'fundyourbizz.com contact form',
  };
  Object.keys(payload).forEach((k) => (payload[k] === '' || payload[k] === undefined) && delete payload[k]);
  const contact = await upsertContact(payload);
  try { await addTags(contact.id, [CONTACT_TAG]); } catch (e) { console.error('[contact] tag failed:', e.message); }
  const msg = clean(body.message);
  if (msg) {
    try { await addNote(contact.id, `Website contact form message:\n${msg}`); } catch (e) { console.error('[contact] note failed:', e.message); }
  }
  return { contactId: contact.id };
}

module.exports = { submitApplication, submitContact, getFieldMap, LOCATION_ID, API_KEY };
