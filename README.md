# fundyourbizz.com

Node/Express + EJS site for Fund Your Bizz, with a 6-step funding application that writes straight into the Fund Your Bizz GHL sub-account (location `ia4IJ2mcMhzJ0nKV7ajC`).

## Application → GHL flow

`POST /api/apply`

1. **Upsert contact** (`/contacts/upsert`) — standard fields (name, email, phone, home address, company, website, DOB) plus every survey custom field, matched by `fieldKey` to the same fields the GHL survey `5Ce1i4S0up81eGQ4HeH8` uses. Field IDs are looked up live from `/locations/{id}/customFields`, so nothing is hard-coded.
2. **Upload files** (`/forms/upload-custom-files`) — the 4 bank statements into `bank_statement_1…4` and the drawn signatures (PNG) into `signature` / `second_owner_signature`.
3. **Tag** the contact `website application`.
4. **Note** with an application summary (no SSN/EIN).
5. **Enroll** the contact in the existing survey → PDF workflow (`GHL_WORKFLOW_ID`), last, so the PDF generator sees every field and file.

| Form section | GHL field keys |
|---|---|
| Business | organization (company name), dba, legal_business_type, industry, ein, business_start_date_v2, website, business_phone, business_address, business_city, business_state, business_zip, do_you_rent_or_own_your_business_space, business_description |
| Financials | requested_amount, revenue, use_of_funds, do_you_currently_have_funding_from_another_lender, owner_ownership_percent |
| Owner | full_name, address, city, state, postal_code, email, phone, social_security_number, date_of_birth, credit_score |
| Partner | partner_first_name, partner_last_name, partner_email, partner_ssn, partner_address, partner_date_of_birth_v2 |
| Statements | bank_statement_1 – bank_statement_4 |
| Sign | signature, signature_date, second_owner_signature, second_owner_signature_date |

`POST /api/contact` — contact page form → upsert + tag `website contact` + note.

## Environment variables (Railway)

| Var | Required | Notes |
|---|---|---|
| `GHL_API_KEY` | yes | Private Integration Token for the Fund Your Bizz sub-account. Scopes: contacts.write, contacts.readonly, locations/customFields.readonly, forms.write, workflows.readonly |
| `GHL_WORKFLOW_ID` | yes | ID of the existing survey → PDF workflow (from the workflow URL) |
| `GHL_LOCATION_ID` | no | defaults to `ia4IJ2mcMhzJ0nKV7ajC` |
| `GHL_APPLICATION_TAG` | no | default `website application` |
| `SITE_URL` | no | default `https://fundyourbizz.com` |

## Checks

- `GET /health` — app is up
- `GET /health/ghl` — API key works and all 33 survey fields exist in the sub-account
