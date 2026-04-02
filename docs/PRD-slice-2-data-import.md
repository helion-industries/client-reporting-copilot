# PRD — Slice 2: Data Import (CSV + Google Sheets)

## Objective
Let agencies upload client performance data via CSV or pull from a Google Sheets URL. Store it per client per reporting period. This is the data foundation for report generation.

## Dependencies
- Slice 1 (Auth + Workspace) — merged ✅

## Tech Stack
- Express (existing app)
- SQLite (existing database)
- multer for file uploads
- csv-parse for CSV parsing
- node-fetch or built-in fetch for Google Sheets

## Tasks
- [x] Create database schema: data_imports table (id, client_id, period, source_type, raw_data_json, column_headers_json, row_count, created_at)
- [x] Install dependencies: multer, csv-parse
- [x] Build POST /api/clients/:id/imports/csv endpoint (multipart file upload, parse CSV, store as JSON)
- [x] Build POST /api/clients/:id/imports/gsheets endpoint (accepts sheets URL or ID, fetches public sheet data, stores as JSON)
- [x] Build GET /api/clients/:id/imports endpoint (list imports for a client, ordered by period desc)
- [x] Build GET /api/clients/:id/imports/:importId endpoint (get single import with full data)
- [x] Build DELETE /api/clients/:id/imports/:importId endpoint (delete an import)
- [x] CSV parsing: auto-detect headers from first row, validate data has at least 2 rows, reject empty files
- [x] Google Sheets: support public sheets only for v1 (no OAuth needed), parse the CSV export URL format
- [x] Period field: accept as string (e.g. "2026-03", "March 2026", "Q1 2026") — flexible, not strict
- [x] Add data import section to dashboard.html (upload form, sheets URL input, list of imports per client)
- [x] Add validation: reject files over 5MB, reject non-CSV files
- [x] Write tests for CSV upload (valid file, empty file, too large, wrong format)
- [x] Write tests for Google Sheets import (valid URL, invalid URL)
- [x] Write tests for import listing and deletion
- [x] Run full test suite — all tests pass including Slice 1 tests

## Acceptance Criteria
- [x] Agency can upload a CSV file for a specific client and period
- [x] Agency can provide a Google Sheets URL and import data
- [x] Imported data is stored as structured JSON with headers preserved
- [x] Agency can list all imports for a client
- [x] Agency can view a single import's full data
- [x] Agency can delete an import
- [x] Invalid files are rejected with clear error messages
- [x] All Slice 1 tests still pass

## Completion Marker
ALL TASKS COMPLETE

## Notes for the coding agent
- Keep changes scoped — one task per iteration
- Do NOT modify existing Slice 1 code unless necessary for integration
- Store raw CSV data as JSON array of objects (one per row, using headers as keys)
- Google Sheets: convert the URL to CSV export format: https://docs.google.com/spreadsheets/d/{ID}/export?format=csv
- Uploads go to a temp directory, parse, store in DB, then delete the temp file
- Do not mark tasks complete unless actually verified
