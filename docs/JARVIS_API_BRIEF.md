# Jarvis CRM API — Integration Brief for CoS Agents

> **Audience:** AI Chief of Staff agents (Nova, Hannah) via the CRM MCP server.
> **Last updated:** 2026-03-24

---

## What is this?

Jarvis is New Era Ventures' internal diligence and deal management platform. It tracks the full lifecycle: inbound dealflow, active deals under diligence, portfolio companies, network contacts, and LP relationships.

The CoS (Chief of Staff) AI agents need read/write access to this data for tasks like morning briefings, email triage, meeting prep, and deal flow research. This document specifies every API endpoint available, with exact routes, JSON shapes, and curl examples.

---

## Authentication

All endpoints are under `/api/v1/` and require a static Bearer token.

```
Authorization: Bearer <COS_API_KEY>
```

- The token is set as `COS_API_KEY` in the Jarvis backend environment.
- The CRM MCP server reads the same value from `CRM_API_KEY` in the CoS environment.
- This is separate from Jarvis's user-facing JWT auth — no user session needed.

---

## Base URL

```
CRM_BASE_URL = https://<your-jarvis-backend>.up.railway.app
```

All paths below are relative to this base.

---

## Endpoint Summary

| Method | Path | Purpose | Permission |
|--------|------|---------|------------|
| GET | `/api/v1/deals` | List deals in pipeline | read |
| GET | `/api/v1/deals/search` | Search deals by name/founder/description | read |
| GET | `/api/v1/deals/{id}` | Get full deal details | read |
| PATCH | `/api/v1/deals/{id}` | Update deal stage | write |
| POST | `/api/v1/deals/{id}/notes` | Add a note to a deal | write |
| GET | `/api/v1/portfolio` | List portfolio companies | read |
| GET | `/api/v1/portfolio/{id}` | Get portfolio company details | read |
| GET | `/api/v1/contacts/search` | Search contacts by name/email | read |
| GET | `/api/v1/contacts/{id}` | Get contact details | read |
| GET | `/api/v1/lps` | List all LPs | read |
| POST | `/api/v1/interactions` | Log an interaction with a contact | write |

---

## Stage Mapping

The CoS uses a different stage vocabulary than Jarvis internally. The API translates automatically.

| CoS stage | Jarvis dealflow status | Description |
|-----------|----------------------|-------------|
| `sourcing` | `lead`, `tracking`, `none` | Early pipeline, not yet contacted |
| `first_meeting` | `reached_out` | Initial outreach / first call |
| `diligence` | `active` | Actively evaluating the deal |
| `term_sheet` | `active` | Term sheet stage (still "active" in Jarvis) |
| `closed` | `invested` | Deal closed, investment made |
| `passed` | `passed` | Passed on the deal |

---

## Detailed Endpoint Specs

### Deals

#### `GET /api/v1/deals`

List deals from the pipeline. Merges dealflow entries and active companies.

**Query params:**
- `stage` (optional): `sourcing`, `first_meeting`, `diligence`, `term_sheet`, `closed`, `passed`, or `all`
- `limit` (optional): max results, default 20, max 200

**Response:** Array of deal objects.

```bash
curl -H "Authorization: Bearer $COS_API_KEY" \
  "$CRM_BASE_URL/api/v1/deals?stage=diligence&limit=10"
```

#### `GET /api/v1/deals/search`

Search deals by company name, founder name, or description.

**Query params:**
- `q` (required): search term

```bash
curl -H "Authorization: Bearer $COS_API_KEY" \
  "$CRM_BASE_URL/api/v1/deals/search?q=apollo"
```

#### `GET /api/v1/deals/{deal_id}`

Get full details of a specific deal.

```bash
curl -H "Authorization: Bearer $COS_API_KEY" \
  "$CRM_BASE_URL/api/v1/deals/abc-123"
```

**Deal JSON shape (all three GET endpoints):**

```json
{
  "id": "abc-123",
  "company_name": "Acme Inc",
  "stage": "diligence",
  "sector": "Seed",
  "founder_names": ["Jane Doe", "John Smith"],
  "founder_emails": ["jane@acme.com"],
  "description": "AI-powered supply chain optimization",
  "check_size_target": 500000,
  "lead_partner": "murtaza",
  "created_at": "2026-01-15",
  "last_updated": "2026-03-10",
  "notes": [
    {
      "id": "note-1",
      "content": "Strong technical team, need to verify TAM claims",
      "category": "diligence",
      "created_at": "2026-03-10T14:30:00"
    }
  ],
  "interactions": [
    {
      "type": "meeting",
      "date": "2026-03-01",
      "summary": "Initial pitch — impressive demo of core product"
    }
  ]
}
```

**Field notes:**
- `id`: UUID string. Deals originating from the dealroom (not dealflow) are prefixed `company-`.
- `stage`: One of the CoS stage values (see mapping table above).
- `sector`: The investment stage label (Pre-seed, Seed, Series A, etc.) — used as a rough sector indicator.
- `notes`: Touchpoints of type `note` or `other`.
- `interactions`: Touchpoints of type `meeting`, `call`, `email`, etc.

#### `PATCH /api/v1/deals/{deal_id}`

Update a deal's pipeline stage.

**Request body:**
```json
{
  "stage": "term_sheet",
  "note": "Moving to term sheet after strong diligence call"
}
```

- `stage` (required): one of `sourcing`, `first_meeting`, `diligence`, `term_sheet`, `closed`, `passed`
- `note` (optional): if provided, a touchpoint is created documenting the stage change

**Response:** Updated deal object (same shape as GET).

```bash
curl -X PATCH -H "Authorization: Bearer $COS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"stage": "diligence", "note": "Scheduled deep-dive call"}' \
  "$CRM_BASE_URL/api/v1/deals/abc-123"
```

#### `POST /api/v1/deals/{deal_id}/notes`

Add a note to a deal.

**Request body:**
```json
{
  "content": "Market sizing analysis suggests $2B TAM",
  "category": "market_research"
}
```

- `content` (required): the note text
- `category` (optional, default `"general"`): one of `diligence`, `meeting_notes`, `market_research`, `founder_background`, `general`

**Response:**
```json
{
  "id": "note-uuid",
  "content": "Market sizing analysis suggests $2B TAM",
  "category": "market_research",
  "created_at": "2026-03-22T18:00:00"
}
```

```bash
curl -X POST -H "Authorization: Bearer $COS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"content": "Checked references — all positive", "category": "diligence"}' \
  "$CRM_BASE_URL/api/v1/deals/abc-123/notes"
```

---

### Portfolio

#### `GET /api/v1/portfolio`

List all portfolio companies.

```bash
curl -H "Authorization: Bearer $COS_API_KEY" \
  "$CRM_BASE_URL/api/v1/portfolio"
```

**Response:** Array of portfolio objects.

```json
{
  "id": "snap-456",
  "company_name": "Portfolio Co",
  "stage": "seed",
  "investment_date": "2025-06-01",
  "check_size": 175000,
  "ownership_percentage": 0.88,
  "founders": [],
  "latest_metrics": {},
  "last_interaction": "2026-03-05",
  "next_board_date": null
}
```

**Field notes:**
- `check_size`: investment amount in USD.
- `ownership_percentage`: ownership as a decimal (0.88 = 0.88%).
- `founders`, `latest_metrics`, `next_board_date`: reserved for future enrichment; currently empty/null.
- `last_interaction`: date of most recent touchpoint linked to the company, or null.

#### `GET /api/v1/portfolio/{id}`

Get detailed info about a portfolio company. Same shape as list, plus `recent_updates`.

```bash
curl -H "Authorization: Bearer $COS_API_KEY" \
  "$CRM_BASE_URL/api/v1/portfolio/snap-456"
```

**Additional field:**
```json
{
  "recent_updates": [
    {
      "content": "Launched v2.0, MRR hit $50K",
      "source": "email",
      "date": "2026-03-15"
    }
  ]
}
```

---

### Contacts

#### `GET /api/v1/contacts/search`

Search contacts by name, email, or company name.

**Query params:**
- `q` (required): search term
- `type` (optional): `founder`, `lp`, `co_investor`, `network`, or `all`

```bash
curl -H "Authorization: Bearer $COS_API_KEY" \
  "$CRM_BASE_URL/api/v1/contacts/search?q=jane&type=founder"
```

**Response:** Array of contact objects.

```json
{
  "id": "contact-789",
  "name": "Jane Doe",
  "email": "jane@acme.com",
  "type": "founder",
  "company": "Acme Inc",
  "linkedin": "https://linkedin.com/in/janedoe",
  "notes": "Met at YC Demo Day 2025",
  "last_interaction": null,
  "interaction_history": []
}
```

**Type inference:** The `type` field is inferred from the contact's flags:
- Has LP flags (`nev_fund_i_lp`, `nev_syndicate_lp`, `interested_lp`) → `"lp"`
- Has `vc_firm_name` → `"co_investor"`
- Has `startup_name` → `"founder"`
- Otherwise → `"network"`

#### `GET /api/v1/contacts/{contact_id}`

Get full contact details.

```bash
curl -H "Authorization: Bearer $COS_API_KEY" \
  "$CRM_BASE_URL/api/v1/contacts/contact-789"
```

**Response:** Same shape as search results, with `interaction_history` populated when available.

---

### LPs

#### `GET /api/v1/lps`

List all LP contacts with commitment status.

```bash
curl -H "Authorization: Bearer $COS_API_KEY" \
  "$CRM_BASE_URL/api/v1/lps"
```

**Response:** Array of LP objects.

```json
{
  "id": "contact-101",
  "name": "LP Name / Firm",
  "email": "lp@firm.com",
  "commitment_status": "committed",
  "commitment_amount": null,
  "last_interaction": null,
  "relationship_owner": "murtaza"
}
```

**Field notes:**
- `commitment_status`: `"committed"` if `nev_fund_i_lp` or `nev_syndicate_lp` is true; `"interested"` if only `interested_lp` is true.
- `commitment_amount`: reserved for future use (currently null).

---

### Interactions

#### `POST /api/v1/interactions`

Log an interaction with a contact. Creates a touchpoint in Jarvis.

**Request body:**
```json
{
  "contact_id": "contact-789",
  "type": "meeting",
  "date": "2026-03-22",
  "summary": "Discussed Series A timeline and growth metrics",
  "follow_up": "Send intro to Sequoia by Friday"
}
```

- `contact_id` (required): ID of the network contact
- `type` (required): `meeting`, `email`, `call`, or `note`
- `date` (required): ISO date string
- `summary` (required): brief description
- `follow_up` (optional): any follow-up action needed

**Response:**
```json
{
  "id": "tp-uuid",
  "contact_id": "contact-789",
  "type": "meeting",
  "date": "2026-03-22",
  "summary": "Discussed Series A timeline and growth metrics",
  "follow_up": "Send intro to Sequoia by Friday",
  "created": true
}
```

```bash
curl -X POST -H "Authorization: Bearer $COS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contact_id":"contact-789","type":"meeting","date":"2026-03-22","summary":"Discussed growth plans"}' \
  "$CRM_BASE_URL/api/v1/interactions"
```

---

## Use-Case Mapping

How each CoS scheduled task uses these endpoints:

| Task | Endpoints used | What it does |
|------|---------------|--------------|
| **Morning briefing** | `GET /deals` | Checks pipeline status for daily digest |
| **Email triage** | `GET /contacts/search` | Looks up sender to determine tier (LP, founder, etc.) |
| **Meeting prep** | `GET /contacts/search`, `GET /contacts/{id}`, `GET /deals/search` | Finds attendee context, deal status, last interactions |
| **Deal flow research** | `GET /deals/search`, `GET /contacts/search` | Checks if company/founder is known before researching |
| **CRM update** (Level 2+) | `POST /interactions`, `PATCH /deals/{id}`, `POST /deals/{id}/notes` | Logs interactions, updates stages, adds notes after meetings |

---

## Priority Order for Enablement

1. **Read endpoints** (all GET routes) → Unblocks Level 1 trust: morning briefing, email triage, meeting prep, deal research
2. **Write endpoints** (POST/PATCH) → Unblocks Level 2+: autonomous CRM updates after meetings

---

## Error Responses

All errors follow this shape:

```json
{ "detail": "Human-readable error message" }
```

| Status | Meaning |
|--------|---------|
| 401 | Invalid or missing API key |
| 404 | Resource not found |
| 400 | Invalid request (e.g. unknown stage value) |
| 503 | `COS_API_KEY` not configured on server |
