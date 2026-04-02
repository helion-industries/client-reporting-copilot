# PRD — Slice 5: Polish + Deploy Prep

## Objective
Clean up the MVP for production readiness. Fix rough edges, improve the UI, add basic analytics, harden error handling, and prepare deployment config.

## Dependencies
- Slices 1-4 merged ✅

## Tasks
- [ ] Add a proper landing/home page at GET / that redirects to /login.html if not authenticated or /dashboard.html if authenticated
- [ ] Improve dashboard.html styling: cleaner layout, better spacing, responsive mobile support
- [ ] Improve login.html and register.html styling to match the dashboard
- [ ] Add navigation bar to dashboard with: agency name, logout button
- [ ] Add basic analytics endpoint GET /api/analytics (reports generated count, clients count, imports count)
- [ ] Add analytics summary card to top of dashboard
- [ ] Add proper error pages (404, 500) instead of raw JSON for browser requests
- [ ] Add request logging middleware (method, path, status, duration)
- [ ] Add rate limiting on auth endpoints (5 attempts per minute per IP)
- [ ] Add helmet middleware for security headers
- [ ] Add CORS configuration (configurable via CORS_ORIGIN env var)
- [ ] Add environment variable documentation in README.md:
  - [ ] PORT, JWT_SECRET, OPENAI_API_KEY, OPENAI_MODEL, CORS_ORIGIN, DB_PATH
- [ ] Update README.md with setup instructions, API documentation, and deployment guide
- [ ] Add a Dockerfile for containerized deployment
- [ ] Add a docker-compose.yml with the app + volume for SQLite persistence
- [ ] Ensure .gitignore covers: node_modules, data/*.db, .env, uploads/
- [ ] Run full test suite — all tests pass
- [ ] Manual walkthrough: register → add client → upload CSV → generate report → preview → download PDF → share link → email draft

## Acceptance Criteria
- [ ] App looks professional and consistent across all pages
- [ ] Dashboard shows analytics summary
- [ ] Auth endpoints are rate-limited
- [ ] Security headers are set via helmet
- [ ] README documents all env vars and setup steps
- [ ] Docker deployment works
- [ ] Full end-to-end flow works without errors
- [ ] All 27+ tests pass

## Completion Marker
When everything is truly complete, replace this line with:

ALL TASKS COMPLETE

## Notes for the coding agent
- Use express-rate-limit for rate limiting
- Use helmet for security headers
- Dockerfile should use node:22-slim, copy package*.json first for layer caching
- docker-compose volume: ./data:/app/data
- Keep styling simple — inline CSS or a single styles.css, no build tools
- The manual walkthrough is for YOUR verification, not automated testing
- Do NOT break existing Slice 1-4 functionality
