# PRD — Slice 3: AI Report Generation Engine

## Objective
Build the core report generation engine that takes imported client data and produces AI-written branded reports with executive summaries, KPI highlights, anomalies, wins/losses, and recommendations.

## Dependencies
- Slice 1 (Auth + Workspace) — merged ✅
- Slice 2 (Data Import) — merged ✅

## Tech Stack
- Express (existing app)
- SQLite (existing database)
- OpenAI API (gpt-4o-mini for cost efficiency, configurable)
- Environment variable: OPENAI_API_KEY

## Tasks
- [x] Create database schema: reports table (id, client_id, import_id, period, template_config_json, sections_json, status, created_at, updated_at)
- [x] Install dependency: openai (OpenAI Node SDK)
- [x] Build report template config system (JSON config defining which sections to include and their order)
- [x] Build the AI prompt engine:
  - [x] Takes imported data (JSON rows + headers) and template config
  - [x] Generates structured sections: executive_summary, kpi_highlights, anomalies, wins, losses, recommendations
  - [x] Each section is a separate AI call for reliability (not one giant prompt)
  - [x] Returns structured JSON with all sections
- [x] Build POST /api/clients/:id/reports/generate endpoint:
  - [x] Accepts: import_id, period, template_config (optional, uses default)
  - [x] Calls AI engine to generate all sections
  - [x] Stores complete report in database
  - [x] Returns the generated report
- [x] Build GET /api/clients/:id/reports endpoint (list reports for a client)
- [x] Build GET /api/clients/:id/reports/:reportId endpoint (get full report with all sections)
- [x] Build PUT /api/clients/:id/reports/:reportId endpoint (update/edit sections manually after generation)
- [x] Build DELETE /api/clients/:id/reports/:reportId endpoint
- [x] Build default report template with these sections:
  - [x] Executive Summary (2-3 paragraphs, high-level narrative)
  - [x] KPI Highlights (top metrics with period-over-period comparison if data allows)
  - [x] Anomalies (significant changes, outliers, unexpected patterns)
  - [x] Wins (positive results to highlight to the client)
  - [x] Losses / Areas of Concern (negative trends, honestly stated)
  - [x] Recommendations (3-5 actionable next steps)
- [x] Add report generation UI to dashboard (generate button per import, view report)
- [x] Handle API errors gracefully (rate limits, timeouts, invalid keys)
- [x] If OPENAI_API_KEY is not set, return a mock report with placeholder text (for testing without API)
- [x] Write tests for report generation (mock the OpenAI API, test structure)
- [x] Write tests for report CRUD endpoints
- [x] Run full test suite — all tests pass including Slice 1 and 2 tests

## AI Prompt Design
Each section gets its own prompt. Example for executive summary:

```
You are a client reporting analyst for a marketing agency. Based on the following performance data for client "{clientName}" covering period "{period}", write a concise executive summary (2-3 paragraphs).

Data columns: {headers}
Data rows: {first 50 rows as JSON}

Focus on: overall performance narrative, key trends, and whether the client should feel good or concerned. Write in a professional but direct tone. No fluff.
```

## Acceptance Criteria
- [x] Agency can generate a report from any imported dataset
- [x] Report contains all 6 sections with coherent AI-written content
- [x] Reports are stored and retrievable
- [x] Reports can be edited after generation
- [x] Works without OPENAI_API_KEY (returns mock data)
- [x] All previous tests still pass

## Completion Marker
ALL TASKS COMPLETE

## Notes for the coding agent
- Keep AI calls separate per section for reliability and debuggability
- Use gpt-4o-mini by default (cheap, fast, good enough for summaries)
- Model should be configurable via OPENAI_MODEL env var
- Limit data sent to AI: first 50 rows max, summarize if more
- Store raw AI responses in sections_json for debugging
- Do NOT break existing Slice 1 or Slice 2 functionality
