# PRD — Slice 1: Auth + Workspace Setup

## Objective
Build the foundational auth system and agency workspace model. This is the base everything else sits on.

## Tech Stack
- Node.js + Express backend
- SQLite for v1 (simple, no external DB needed)
- bcrypt for password hashing
- JWT for session tokens
- Simple HTML/CSS frontend (no React yet — keep it light for MVP)

## Tasks
- [ ] Initialize Express app in src/index.js with basic middleware (json, cors, static)
- [ ] Set up SQLite database with better-sqlite3 (sync, simple)
- [ ] Create database schema: agencies table (id, name, email, password_hash, logo_url, brand_color, created_at)
- [ ] Create database schema: clients table (id, agency_id, name, industry, created_at, archived_at)
- [ ] Build POST /api/auth/register endpoint (email, password, agency name)
- [ ] Build POST /api/auth/login endpoint (email, password → JWT)
- [ ] Build auth middleware that validates JWT on protected routes
- [ ] Build GET /api/agency endpoint (returns current agency profile)
- [ ] Build PUT /api/agency endpoint (update agency name, logo_url, brand_color)
- [ ] Build POST /api/clients endpoint (create client)
- [ ] Build GET /api/clients endpoint (list clients for agency)
- [ ] Build PUT /api/clients/:id endpoint (update client)
- [ ] Build DELETE /api/clients/:id endpoint (soft archive, not hard delete)
- [ ] Create simple login page (HTML form → POST /api/auth/login)
- [ ] Create simple register page (HTML form → POST /api/auth/register)
- [ ] Create simple dashboard page (list clients, add client button)
- [ ] Add package.json scripts: start, dev, test
- [ ] Install dependencies: express, better-sqlite3, bcryptjs, jsonwebtoken, cors

## Acceptance Criteria
- [ ] User can register with email + password + agency name
- [ ] User can log in and receive a JWT
- [ ] Protected routes reject unauthenticated requests
- [ ] User can view and update their agency profile
- [ ] User can create, list, update, and archive clients
- [ ] Database persists across restarts (SQLite file)
- [ ] No secrets committed to git

## Test Plan
- [ ] Write tests for auth endpoints (register, login, invalid credentials)
- [ ] Write tests for client CRUD endpoints
- [ ] Write tests for auth middleware (valid token, invalid token, no token)
- [ ] Run test suite — all tests pass

## Completion Marker
When everything is truly complete, replace this line with:

ALL TASKS COMPLETE

## Notes for the coding agent
- Keep changes scoped — one task per iteration
- Use better-sqlite3 (synchronous) not sqlite3 (async) for simplicity
- JWT secret should come from environment variable JWT_SECRET
- Store SQLite database at ./data/app.db
- Do not over-engineer — this is MVP
- If blocked, leave clear notes in this PRD
- Do not mark tasks complete unless actually verified
