---
name: Dealflow People Tracker PRD
overview: A short PRD for adding a "People Tracker" to the Dealflow tab so users can track individuals (name, LinkedIn, notes, source) alongside companies, with a simple table and minimal backend.
todos: []
isProject: false
---

# PRD: People Tracker (Dealflow Tab)

## Context

The Dealflow tab today tracks **companies** only ([DealflowEntry](backend/app/models/dealflow_entry.py): name, website, stage, notes, source, etc.). Sometimes the team wants to track **people** (e.g. founders, operators, investors) who may or may not be tied to a specific dealflow company. There is no current way to maintain a list of tracked people in one place.

**DealflowFounder** ([backend/app/models/dealflow_founder.py](backend/app/models/dealflow_founder.py)) is per-company (founders of a dealflow entry), not a standalone people list.

---

## Goal

Add a **People Tracker** within the Dealflow tab so users can maintain a simple list of people they're tracking, with: **name**, **LinkedIn**, **notes**, and **source**.

---

## User Stories

- As a user, I can open the Dealflow tab and see both companies and a way to view/manage tracked people.
- As a user, I can add a person with name, LinkedIn URL, notes, and source.
- As a user, I can view a list of tracked people in a table (columns: Person, LinkedIn, Notes, Source) with search/filter by source if useful.
- As a user, I can edit and delete tracked people.

---

## Scope

### In scope

- **Placement:** Dealflow tab. Either:
  - **Sub-tabs:** "Companies" (current table) and "People" (new table), or
  - **Single page:** Two sections — "Companies" (existing) and "People tracker" (new table below or in a second card).
- **Data:** One new entity, e.g. **TrackedPerson** (or DealflowPerson).
  - **Fields:** name (required), linkedin_url (optional), notes (optional), source (optional; same or similar source options as dealflow: Murtaza, Carter, Friend, Twitter, Newsletter, Event, Other).
  - **Optional for v1:** Link to a dealflow entry (company) — "this person is associated with this company" — can be deferred.
- **Backend:** New model, migration, CRUD API (create, list, get, update, delete). Reuse existing patterns from [backend/app/routers/dealflow.py](backend/app/routers/dealflow.py) and [backend/app/schemas/dealflow.py](backend/app/schemas/dealflow.py).
- **Frontend:** New section or sub-tab in [frontend/src/app/dealflow/page.tsx](frontend/src/app/dealflow/page.tsx) (or a dedicated `PeopleTracker` component): table with columns Person, LinkedIn (clickable), Notes, Source; Add person form; inline or modal edit; delete with confirmation.

### Out of scope (v1)

- Linking a tracked person to a dealflow company (can add later).
- Import/export of people.
- Dedicated person detail page (list + inline edit is enough for v1).

---

## Data Model

**TrackedPerson** (new table `tracked_persons`)


| Column           | Type       | Notes                                                                      |
| ---------------- | ---------- | -------------------------------------------------------------------------- |
| id               | PK         | UUID                                                                       |
| name             | string     | Required                                                                   |
| linkedin_url     | string     | Nullable                                                                   |
| notes            | text       | Nullable                                                                   |
| source           | string     | Nullable (e.g. murtaza, carter, friend, twitter, newsletter, event, other) |
| added_by_user_id | FK → users | Nullable, for audit                                                        |
| created_at       | datetime   |                                                                            |
| updated_at       | datetime   |                                                                            |


Optional later: `dealflow_entry_id` FK to link person to a company.

---

## UI (Conceptual)

```
Dealflow
  [ Companies ]  [ People ]   <- sub-tabs

  People
  "People you're tracking (founders, operators, etc.)"
  [ + Add person ]

  | Person      | LinkedIn     | Notes        | Source   | Actions |
  | Jane Doe    | [icon link]  | Met at conf  | Event    | Edit · Delete |
  | John Smith  | [icon link]  | …            | Carter   | Edit · Delete |
```

- **Add person:** Form with Name (required), LinkedIn URL, Notes (textarea), Source (dropdown). Reuse same source options as dealflow where possible.
- **Table:** Person (name), LinkedIn (link icon opening URL in new tab), Notes (truncated), Source. Row actions: Edit (inline or small modal), Delete (with ConfirmDialog).
- Styling consistent with existing Dealflow companies table ([frontend/src/app/dealflow/page.tsx](frontend/src/app/dealflow/page.tsx)).

---

## Technical Approach

1. **Backend**
  - New model: [backend/app/models/tracked_person.py](backend/app/models/tracked_person.py) (or under `dealflow/` if preferred).
  - New schemas: `TrackedPersonCreate`, `TrackedPersonUpdate`, `TrackedPersonOut` in a new schema file or in [backend/app/schemas/dealflow.py](backend/app/schemas/dealflow.py).
  - Migration in [backend/app/database.py](backend/app/database.py): create `tracked_persons` table and any FK.
  - New router: e.g. [backend/app/routers/tracked_persons.py](backend/app/routers/tracked_persons.py) with `POST /`, `GET /`, `GET /{id}`, `PATCH /{id}`, `DELETE /{id}`. Register under something like `/api/dealflow/people` or `/api/tracked-persons` and protect with existing auth.
2. **Frontend**
  - API client in [frontend/src/lib/api.ts](frontend/src/lib/api.ts): e.g. `dealflowApi.people` or `trackedPersonsApi` with list, create, update, delete.
  - Types in [frontend/src/types/index.ts](frontend/src/types/index.ts): `TrackedPerson` interface.
  - Dealflow page: add sub-tabs "Companies" | "People". When "People" is active, render a table + "Add person" form; reuse table/button/confirm patterns from the companies list. Optional: extract a small `PeopleTrackerTable` component for clarity.

---

## Success Criteria

- User can switch to "People" in Dealflow and see a list of tracked people.
- User can add a person with name, LinkedIn, notes, and source.
- User can edit and delete people; list updates and persists.
- People tracker is clearly separate from the companies list but in the same tab.

---

## Open Questions

1. **Sub-tab vs. single page:** Prefer "Companies" and "People" as sub-tabs (only one list visible at a time), or always show both sections on the same page (companies above, people below)?
2. **Source options:** Reuse exact same source dropdown as dealflow companies (Murtaza, Carter, Friend, Twitter, Newsletter, Event, Other), or a different list?
3. **URL:** Should "People" have its own route (e.g. `/dealflow/people`) for bookmarking, or stay as client-side sub-tab state only?

This PRD is enough to implement the feature; open questions can be decided during build or in a short product sync.