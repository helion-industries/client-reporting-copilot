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
- [x] Create database schema: share_links table (id, report_id, token, expires_at, created_at)
- [x] Install dependencies: puppeteer
- [x] Build GET /api/clients/:id/reports/:reportId/preview endpoint (returns branded HTML report page)
- [x] Build the branded report HTML template:
  - [x] Agency logo and name at top
  - [x] Agency brand color as accent
  - [x] Client name and report period
  - [x] Each section rendered with clear headings
  - [x] Clean, professional styling suitable for client viewing
- [x] Build GET /api/clients/:id/reports/:reportId/pdf endpoint (renders preview HTML via Puppeteer, returns PDF)
- [x] Build POST /api/clients/:id/reports/:reportId/share endpoint:
  - [x] Generates a unique token (crypto.randomUUID or randomBytes)
  - [x] Stores in share_links with configurable expiry (default 30 days)
  - [x] Returns the shareable URL
- [x] Build GET /api/shared/:token endpoint (public, no auth required):
  - [x] Looks up share link by token
  - [x] Checks expiry
  - [x] Renders the branded report HTML (same as preview)
  - [x] Returns 404 if expired or invalid
- [x] Build GET /api/clients/:id/reports/:reportId/email-draft endpoint:
  - [x] Returns a plain text email body with:
  - [x] Subject line suggestion
  - [x] Executive summary included
  - [x] Link to full report (share link)
  - [x] Professional sign-off
- [x] Update dashboard with:
  - [x] Preview button (opens report in new tab)
  - [x] Download PDF button
  - [x] Create share link button (shows URL)
  - [x] Generate email draft button (shows copyable text)
- [x] Write tests for PDF endpoint (mock Puppeteer, verify response type)
- [x] Write tests for share link creation and retrieval (valid token, expired token, invalid token)
- [x] Write tests for email draft endpoint
- [x] Run full test suite — all 21+ tests pass

## Acceptance Criteria
- [x] Agency can preview a branded report in the browser
- [x] Agency can download the report as a PDF
- [x] Agency can create a shareable link with expiry
- [x] Shared link works without authentication
- [x] Expired/invalid share links return 404
- [x] Agency can generate an email draft with summary and share link
- [x] All previous tests still pass

## Completion Marker
ALL TASKS COMPLETE

## Notes for the coding agent
- Puppeteer: use puppeteer.launch({ headless: true, args: ['--no-sandbox'] }) for VPS compatibility
- PDF: render the same HTML as preview, just pipe to PDF
- Share tokens: use crypto.randomBytes(24).toString('hex') for URL-safe tokens
- Default share link expiry: 30 days from creation
- The shared report page should look identical to the preview — same template
- Keep it simple — no React, just server-rendered HTML with inline CSS
- Do NOT break existing Slice 1-3 functionality
