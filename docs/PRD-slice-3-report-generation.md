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
- [ ] Create database schema: reports table (id, client_id, import_id, period, template_config_json, sections_json, status, created_at, updated_at)
- [ ] Install dependency: openai (OpenAI Node SDK)
- [ ] Build report template config system (JSON config defining which sections to include and their order)
- [ ] Build the AI prompt engine:
  - [ ] Takes imported data (JSON rows + headers) and template config
  - [ ] Generates structured sections: executive_summary, kpi_highlights, anomalies, wins, losses, recommendations
  - [ ] Each section is a separate AI call for reliability (not one giant prompt)
  - [ ] Returns structured JSON with all sections
- [ ] Build POST /api/clients/:id/reports/generate endpoint:
  - [ ] Accepts: import_id, period, template_config (optional, uses default)
  - [ ] Calls AI engine to generate all sections
  - [ ] Stores complete report in database
  - [ ] Returns the generated report
- [ ] Build GET /api/clients/:id/reports endpoint (list reports for a client)
- [ ] Build GET /api/clients/:id/reports/:reportId endpoint (get full report with all sections)
- [ ] Build PUT /api/clients/:id/reports/:reportId endpoint (update/edit sections manually after generation)
- [ ] Build DELETE /api/clients/:id/reports/:reportId endpoint
- [ ] Build default report template with these sections:
  - [ ] Executive Summary (2-3 paragraphs, high-level narrative)
  - [ ] KPI Highlights (top metrics with period-over-period comparison if data allows)
  - [ ] Anomalies (significant changes, outliers, unexpected patterns)
  - [ ] Wins (positive results to highlight to the client)
  - [ ] Losses / Areas of Concern (negative trends, honestly stated)
  - [ ] Recommendations (3-5 actionable next steps)
- [ ] Add report generation UI to dashboard (generate button per import, view report)
- [ ] Handle API errors gracefully (rate limits, timeouts, invalid keys)
- [ ] If OPENAI_API_KEY is not set, return a mock report with placeholder text (for testing without API)
- [ ] Write tests for report generation (mock the OpenAI API, test structure)
- [ ] Write tests for report CRUD endpoints
- [ ] Run full test suite — all tests pass including Slice 1 and 2 tests

## AI Prompt Design
Each section gets its own prompt. Example for executive summary:

```
You are a client reporting analyst for a marketing agency. Based on the following performance data for client "{clientName}" covering period "{period}", write a concise executive summary (2-3 paragraphs).

Data columns: {headers}
Data rows: {first 50 rows as JSON}

Focus on: overall performance narrative, key trends, and whether the client should feel good or concerned. Write in a professional but direct tone. No fluff.
```

## Acceptance Criteria
- [ ] Agency can generate a report from any imported dataset
- [ ] Report contains all 6 sections with coherent AI-written content
- [ ] Reports are stored and retrievable
- [ ] Reports can be edited after generation
- [ ] Works without OPENAI_API_KEY (returns mock data)
- [ ] All previous tests still pass

## Completion Marker
When everything is truly complete, replace this line with:

ALL TASKS COMPLETE

## Notes for the coding agent
- Keep AI calls separate per section for reliability and debuggability
- Use gpt-4o-mini by default (cheap, fast, good enough for summaries)
- Model should be configurable via OPENAI_MODEL env var
- Limit data sent to AI: first 50 rows max, summarize if more
- Store raw AI responses in sections_json for debugging
- Do NOT break existing Slice 1 or Slice 2 functionality
