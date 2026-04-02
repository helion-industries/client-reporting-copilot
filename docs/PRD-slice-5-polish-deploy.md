# PRD — Slice 5: Polish + Deploy Prep

## Objective
Clean up the MVP for production readiness. Fix rough edges, improve the UI, add basic analytics, harden error handling, and prepare deployment config.

## Dependencies
- Slices 1-4 merged ✅

## Tasks
- [x] Add a proper landing/home page at GET / that redirects to /login.html if not authenticated or /dashboard.html if authenticated
- [x] Improve dashboard.html styling: cleaner layout, better spacing, responsive mobile support
- [x] Improve login.html and register.html styling to match the dashboard
- [x] Add navigation bar to dashboard with: agency name, logout button
- [x] Add basic analytics endpoint GET /api/analytics (reports generated count, clients count, imports count)
- [x] Add analytics summary card to top of dashboard
- [x] Add proper error pages (404, 500) instead of raw JSON for browser requests
- [x] Add request logging middleware (method, path, status, duration)
- [x] Add rate limiting on auth endpoints (5 attempts per minute per IP)
- [x] Add helmet middleware for security headers
- [x] Add CORS configuration (configurable via CORS_ORIGIN env var)
- [x] Add environment variable documentation in README.md:
  - [x] PORT, JWT_SECRET, OPENAI_API_KEY, OPENAI_MODEL, CORS_ORIGIN, DB_PATH
- [x] Update README.md with setup instructions, API documentation, and deployment guide
- [x] Add a Dockerfile for containerized deployment
- [x] Add a docker-compose.yml with the app + volume for SQLite persistence
- [x] Ensure .gitignore covers: node_modules, data/*.db, .env, uploads/
- [x] Run full test suite — all tests pass
- [x] Manual walkthrough: register → add client → upload CSV → generate report → preview → download PDF → share link → email draft

## Acceptance Criteria
- [x] App looks professional and consistent across all pages
- [x] Dashboard shows analytics summary
- [x] Auth endpoints are rate-limited
- [x] Security headers are set via helmet
- [x] README documents all env vars and setup steps
- [x] Docker deployment works
- [x] Full end-to-end flow works without errors
- [x] All 27+ tests pass

## Completion Marker
ALL TASKS COMPLETE

## Notes for the coding agent
- Use express-rate-limit for rate limiting
- Use helmet for security headers
- Dockerfile should use node:22-slim, copy package*.json first for layer caching
- docker-compose volume: ./data:/app/data
- Keep styling simple — inline CSS or a single styles.css, no build tools
- The manual walkthrough is for YOUR verification, not automated testing
- Do NOT break existing Slice 1-4 functionality
