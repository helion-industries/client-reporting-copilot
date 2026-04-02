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
- [x] Initialize Express app in src/index.js with basic middleware (json, cors, static)
- [x] Set up SQLite database with better-sqlite3 (sync, simple)
- [x] Create database schema: agencies table (id, name, email, password_hash, logo_url, brand_color, created_at)
- [x] Create database schema: clients table (id, agency_id, name, industry, created_at, archived_at)
- [x] Build POST /api/auth/register endpoint (email, password, agency name)
- [x] Build POST /api/auth/login endpoint (email, password → JWT)
- [x] Build auth middleware that validates JWT on protected routes
- [x] Build GET /api/agency endpoint (returns current agency profile)
- [x] Build PUT /api/agency endpoint (update agency name, logo_url, brand_color)
- [x] Build POST /api/clients endpoint (create client)
- [x] Build GET /api/clients endpoint (list clients for agency)
- [x] Build PUT /api/clients/:id endpoint (update client)
- [x] Build DELETE /api/clients/:id endpoint (soft archive, not hard delete)
- [x] Create simple login page (HTML form → POST /api/auth/login)
- [x] Create simple register page (HTML form → POST /api/auth/register)
- [x] Create simple dashboard page (list clients, add client button)
- [x] Add package.json scripts: start, dev, test
- [x] Install dependencies: express, better-sqlite3, bcryptjs, jsonwebtoken, cors

## Acceptance Criteria
- [x] User can register with email + password + agency name
- [x] User can log in and receive a JWT
- [x] Protected routes reject unauthenticated requests
- [x] User can view and update their agency profile
- [x] User can create, list, update, and archive clients
- [x] Database persists across restarts (SQLite file)
- [x] No secrets committed to git

## Test Plan
- [x] Write tests for auth endpoints (register, login, invalid credentials)
- [x] Write tests for client CRUD endpoints
- [x] Write tests for auth middleware (valid token, invalid token, no token)
- [x] Run test suite — all tests pass

## Completion Marker
ALL TASKS COMPLETE

## Notes for the coding agent
- Keep changes scoped — one task per iteration
- Use better-sqlite3 (synchronous) not sqlite3 (async) for simplicity
- JWT secret should come from environment variable JWT_SECRET
- Store SQLite database at ./data/app.db
- Do not over-engineer — this is MVP
- If blocked, leave clear notes in this PRD
- Do not mark tasks complete unless actually verified
