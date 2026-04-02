# PRD — Slice 4: Report Preview, PDF Export, Share Links, Email Draft

## Objective
Let agencies preview generated reports in a branded format, export as PDF, create shareable client-facing links, and generate email drafts with the report summary.

## Dependencies
- Slice 1-3 merged ✅

## Tech Stack
- Express (existing app)
- SQLite (existing database)
- puppeteer for PDF generation (headless Chrome renders HTML → PDF)
- crypto for share link tokens
- Existing agency branding (logo_url, brand_color from agency profile)

## Tasks
- [ ] Create database schema: share_links table (id, report_id, token, expires_at, created_at)
- [ ] Install dependencies: puppeteer
- [ ] Build GET /api/clients/:id/reports/:reportId/preview endpoint (returns branded HTML report page)
- [ ] Build the branded report HTML template:
  - [ ] Agency logo and name at top
  - [ ] Agency brand color as accent
  - [ ] Client name and report period
  - [ ] Each section rendered with clear headings
  - [ ] Clean, professional styling suitable for client viewing
- [ ] Build GET /api/clients/:id/reports/:reportId/pdf endpoint (renders preview HTML via Puppeteer, returns PDF)
- [ ] Build POST /api/clients/:id/reports/:reportId/share endpoint:
  - [ ] Generates a unique token (crypto.randomUUID or randomBytes)
  - [ ] Stores in share_links with configurable expiry (default 30 days)
  - [ ] Returns the shareable URL
- [ ] Build GET /api/shared/:token endpoint (public, no auth required):
  - [ ] Looks up share link by token
  - [ ] Checks expiry
  - [ ] Renders the branded report HTML (same as preview)
  - [ ] Returns 404 if expired or invalid
- [ ] Build GET /api/clients/:id/reports/:reportId/email-draft endpoint:
  - [ ] Returns a plain text email body with:
  - [ ] Subject line suggestion
  - [ ] Executive summary included
  - [ ] Link to full report (share link)
  - [ ] Professional sign-off
- [ ] Update dashboard with:
  - [ ] Preview button (opens report in new tab)
  - [ ] Download PDF button
  - [ ] Create share link button (shows URL)
  - [ ] Generate email draft button (shows copyable text)
- [ ] Write tests for PDF endpoint (mock Puppeteer, verify response type)
- [ ] Write tests for share link creation and retrieval (valid token, expired token, invalid token)
- [ ] Write tests for email draft endpoint
- [ ] Run full test suite — all 21+ tests pass

## Acceptance Criteria
- [ ] Agency can preview a branded report in the browser
- [ ] Agency can download the report as a PDF
- [ ] Agency can create a shareable link with expiry
- [ ] Shared link works without authentication
- [ ] Expired/invalid share links return 404
- [ ] Agency can generate an email draft with summary and share link
- [ ] All previous tests still pass

## Completion Marker
When everything is truly complete, replace this line with:

ALL TASKS COMPLETE

## Notes for the coding agent
- Puppeteer: use puppeteer.launch({ headless: true, args: ['--no-sandbox'] }) for VPS compatibility
- PDF: render the same HTML as preview, just pipe to PDF
- Share tokens: use crypto.randomBytes(24).toString('hex') for URL-safe tokens
- Default share link expiry: 30 days from creation
- The shared report page should look identical to the preview — same template
- Keep it simple — no React, just server-rendered HTML with inline CSS
- Do NOT break existing Slice 1-3 functionality
