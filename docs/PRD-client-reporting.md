# PRD — AI Client Reporting + QBR Copilot for Agencies

## Objective
Build a narrow, shippable MVP that lets small B2B agencies generate branded monthly client reports and QBR packs using AI-written summaries, KPI highlights, and next-step recommendations. First revenue target: 5 paying customers within 60 days of launch.

## Target Customer
- Small marketing agencies, SEO shops, paid media agencies, RevOps consultants
- 10-50 active clients, founder-led, no dedicated ops/reporting staff
- Currently doing monthly reporting manually via Google Sheets, Slides, or copy-paste

## Core Value Proposition
"Stop spending 4 hours per client on monthly reports. Upload your data, get a branded report with executive summary, wins, losses, anomalies, and next steps in minutes."

## Constraints
- Tech stack: Node.js + Express backend, React or simple HTML frontend, PostgreSQL or SQLite
- LLM: Use OpenAI or Anthropic API for report narrative generation
- No native data source integrations in v1 — CSV and Google Sheets import only
- No white-label client portal in v1
- Budget: minimize API costs per report generation
- Security: standard auth, no credential storage for client ad accounts

## MVP Scope (v1)

### Tasks
- [ ] User auth (email + password, or OAuth)
- [ ] Workspace/agency setup (agency name, branding: logo, colors)
- [ ] Client management (add/edit/archive clients)
- [ ] Data import: CSV upload per client per period
- [ ] Data import: Google Sheets URL pull (read-only)
- [ ] Report template system (configurable sections)
- [ ] AI report generation engine:
  - [ ] Executive summary
  - [ ] KPI highlights with period-over-period comparison
  - [ ] Anomaly detection (significant changes flagged)
  - [ ] Wins and losses narrative
  - [ ] Next-step recommendations
- [ ] Report preview and editing UI
- [ ] Export: PDF generation
- [ ] Export: shareable link (read-only, expiring)
- [ ] Export: email draft with summary
- [ ] Basic analytics: reports generated, clients served

### Not in v1
- Native integrations (GA4, Google Ads, Meta, HubSpot, etc.)
- White-label client portal
- Multi-user team management
- QBR slide deck generation (future)
- Automated scheduling (future)

## Acceptance Criteria
- [ ] Agency can sign up, set branding, and add clients
- [ ] Agency can upload CSV or connect Google Sheet for a client
- [ ] System generates a complete branded report with all AI sections
- [ ] Report can be previewed, edited, and exported as PDF
- [ ] Shareable link works for client viewing
- [ ] Email draft export includes summary text
- [ ] End-to-end flow works in under 5 minutes per client report
- [ ] Report quality is good enough that an agency owner would send it to a client

## Test Plan
- [ ] Write failing tests for auth flow
- [ ] Write failing tests for data import (CSV parsing, validation)
- [ ] Write failing tests for report generation (template rendering, AI summary integration)
- [ ] Write failing tests for export (PDF generation, link creation)
- [ ] Run full test suite — all tests pass
- [ ] Manual QA: generate 3 sample reports with real-looking data
- [ ] Manual QA: verify PDF output renders correctly
- [ ] Manual QA: verify shareable link works in incognito

## Architecture (proposed)

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   API        │────▶│   Database      │
│   (React/HTML)  │     │   (Express)  │     │   (PostgreSQL)  │
└─────────────────┘     └──────┬───────┘     └─────────────────┘
                               │
                        ┌──────▼───────┐
                        │   LLM API    │
                        │  (OpenAI/    │
                        │   Anthropic) │
                        └──────────────┘
```

### Data model (core)
- **Agency**: id, name, logo_url, brand_colors, created_at
- **Client**: id, agency_id, name, industry, created_at
- **DataImport**: id, client_id, period, source_type (csv/gsheets), data_json, created_at
- **Report**: id, client_id, period, template_id, sections_json, ai_summary, status, created_at
- **ShareLink**: id, report_id, token, expires_at

## Pricing (launch)
- Setup: $499 (includes onboarding call + template customization)
- Monthly: $149/mo for up to 10 clients
- Growth: $299/mo for up to 25 clients
- Agency: $599/mo white-label + multi-user (future)

## Go-to-Market (first 5 customers)
1. Direct outreach to agency owners in founder communities (Twitter/X, indie hackers, agency Slack groups)
2. Offer "we'll set up your first 3 client reports for free" as a wedge
3. Position as "reporting copilot" not "another dashboard"
4. Use service delivery to learn exact template needs before standardizing
5. Convert service customers to SaaS subscriptions

## Completion Marker
When everything is truly complete, replace this line with:

ALL TASKS COMPLETE

## Notes for the coding agent
- Keep changes scoped — one task per iteration
- Prefer small, reversible edits
- Each task should be atomic — complete one fully before moving to the next
- Use `write` tool for full file replacement when creating new files
- If blocked, leave clear notes in this PRD
- Do not mark tasks complete unless actually verified
- Context is a cache, not state — you must be able to reconstruct from files alone
