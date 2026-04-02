# Client Reporting Copilot

AI-powered client reporting and QBR pack generator for small B2B agencies.

## What It Does

Stop spending 4 hours per client on monthly reports. Upload your data, get a branded report with executive summary, wins, losses, anomalies, and next steps — in minutes.

## Target Users

- Small marketing agencies, SEO shops, paid media agencies, RevOps consultants
- 10–50 active clients, founder-led, no dedicated ops/reporting staff
- Currently doing monthly reporting manually via Google Sheets, Slides, or copy-paste

## MVP Scope (v1)

- User authentication (email/password or OAuth)
- Workspace/agency setup with branding (logo, colors)
- Client management (add/edit/archive)
- Data import: CSV upload and Google Sheets URL
- AI-powered report generation:
  - Executive summary
  - KPI highlights with period-over-period comparison
  - Anomaly detection
  - Wins and losses narrative
  - Next-step recommendations
- Report preview, editing, and export (PDF, shareable link, email draft)

## Tech Stack

- **Backend:** Node.js + Express
- **Frontend:** React or HTML
- **Database:** PostgreSQL
- **LLM:** OpenAI / Anthropic API

## Architecture

```
Frontend (React/HTML) → API (Express) → Database (PostgreSQL)
                                      → LLM API (OpenAI/Anthropic)
```

### Core Data Model

- **Agency** — name, logo, brand colors
- **Client** — belongs to agency, name, industry
- **DataImport** — CSV/Sheets data per client per period
- **Report** — generated report with AI sections
- **ShareLink** — expiring read-only links for client viewing

## Getting Started

```bash
npm install
npm run dev
```

## Project Structure

```
src/          — Application source code
tests/        — Test suites
docs/         — Documentation and PRDs
```

## License

Proprietary — Helion Industries
