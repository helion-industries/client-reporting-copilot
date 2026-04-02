# Client Reporting Copilot

AI-powered client reporting and QBR pack generator for small agencies.

## What it does

Client Reporting Copilot turns raw CSV or Google Sheets data into client-ready performance reports. Agencies can:

- register and manage their workspace
- add and archive clients
- import reporting data from CSV or Google Sheets
- generate AI-assisted reports with editable sections
- preview reports in the browser
- export reports as PDFs
- create share links for clients
- generate email drafts for report delivery
- view basic workspace analytics on the dashboard

## Tech stack

- Node.js 22+
- Express
- SQLite via `better-sqlite3`
- OpenAI Responses API
- Puppeteer for PDF generation
- Plain HTML/CSS frontend

## Requirements

- Node.js 22+ recommended
- npm 10+
- Optional: OpenAI API key for live AI report generation

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PORT` | No | `3000` | HTTP port for the Express server |
| `JWT_SECRET` | Yes for production | `dev-secret` | Secret used to sign auth tokens |
| `OPENAI_API_KEY` | No | unset | Enables live AI-generated report sections; without it, the app falls back to mock content |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | OpenAI model used for report generation |
| `CORS_ORIGIN` | No | `*` | Allowed CORS origin. Use a single origin like `https://app.example.com` in production |
| `DB_PATH` | No | `./data/app.db` | SQLite database file path |
| `APP_BASE_URL` | No | `http://localhost:3000` | Base URL used when generating public share links |

Example `.env`:

```env
PORT=3000
JWT_SECRET=replace-this-in-production
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
CORS_ORIGIN=http://localhost:3000
DB_PATH=./data/app.db
APP_BASE_URL=http://localhost:3000
```

## Local setup

```bash
npm install
npm run dev
```

Then open:

- Home: <http://localhost:3000/>
- Login: <http://localhost:3000/login.html>
- Register: <http://localhost:3000/register.html>
- Dashboard: <http://localhost:3000/dashboard.html>

## App flow

1. Register an agency account
2. Add a client
3. Upload a CSV or import a public Google Sheet
4. Generate a report
5. Preview and edit the report
6. Download a PDF or create a share link
7. Generate an email draft for delivery

## API documentation

### Health

#### `GET /health`
Returns a simple health response.

Response:

```json
{ "ok": true }
```

### Authentication

#### `POST /api/auth/register`
Create an agency account.

Request:

```json
{
  "agencyName": "Northstar Agency",
  "email": "owner@example.com",
  "password": "secret123"
}
```

Response:

```json
{
  "token": "jwt-token",
  "agency": {
    "id": 1,
    "name": "Northstar Agency",
    "email": "owner@example.com"
  }
}
```

#### `POST /api/auth/login`
Authenticate an existing user.

#### `GET /api/agency`
Return the current agency profile.

#### `PUT /api/agency`
Update agency name and branding.

### Clients

#### `POST /api/clients`
Create a client.

#### `GET /api/clients`
List active clients.

#### `PUT /api/clients/:id`
Update a client.

#### `DELETE /api/clients/:id`
Archive a client.

### Imports

#### `POST /api/clients/:id/imports/csv`
Upload a CSV file using `multipart/form-data`.

Fields:
- `period`
- `file`

#### `POST /api/clients/:id/imports/gsheets`
Import a public Google Sheet.

Request:

```json
{
  "period": "2026-03",
  "sheetsUrl": "https://docs.google.com/spreadsheets/d/.../edit#gid=0"
}
```

You can also send `sheetId` instead of `sheetsUrl`.

#### `GET /api/clients/:id/imports`
List imports for a client.

#### `GET /api/clients/:id/imports/:importId`
Get one import including raw rows.

#### `DELETE /api/clients/:id/imports/:importId`
Delete an import.

### Reports

#### `POST /api/clients/:id/reports/generate`
Generate a report from an existing import.

Request:

```json
{
  "import_id": 1,
  "period": "2026-03"
}
```

#### `GET /api/clients/:id/reports`
List reports.

#### `GET /api/clients/:id/reports/:reportId`
Get one report.

#### `PUT /api/clients/:id/reports/:reportId`
Update report sections or status.

#### `DELETE /api/clients/:id/reports/:reportId`
Delete a report.

#### `GET /api/clients/:id/reports/:reportId/preview`
Render an HTML preview.

#### `GET /api/clients/:id/reports/:reportId/pdf`
Download a PDF export.

#### `POST /api/clients/:id/reports/:reportId/share`
Create an expiring share link.

#### `GET /api/shared/:token`
Open the public shared report view.

#### `GET /api/clients/:id/reports/:reportId/email-draft`
Generate a delivery email draft.

### Analytics

#### `GET /api/analytics`
Returns a high-level dashboard summary.

Response:

```json
{
  "analytics": {
    "reports_generated": 4,
    "clients_count": 2,
    "imports_count": 3
  }
}
```

## Security and production notes

- Auth endpoints are rate-limited to 5 requests per minute per IP.
- `helmet` sets common security headers.
- CORS is configurable via `CORS_ORIGIN`.
- SQLite data persists under `data/` by default.
- Set a strong `JWT_SECRET` in production.
- Public share links are time-limited.

## Deployment

### Docker

Build and run:

```bash
docker build -t client-reporting-copilot .
docker run --rm -p 3000:3000 \
  -e JWT_SECRET=replace-this \
  -e OPENAI_API_KEY=your-key \
  -e APP_BASE_URL=http://localhost:3000 \
  -v $(pwd)/data:/app/data \
  client-reporting-copilot
```

### Docker Compose

```bash
docker compose up --build
```

The compose file mounts `./data` to `/app/data` so the SQLite database persists across container restarts.

## Project structure

```text
public/   Static UI
src/      Express app, auth, database, report engine
tests/    Jest test suite
docs/     PRDs and build notes
data/     SQLite database files
```

## Testing

Run the full test suite:

```bash
npm test
```

## License

Proprietary — Helion Industries
