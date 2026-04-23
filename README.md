# DCOPS Jira Dashboard

CoreWeave Data Center Operations — headcount planning, server inventory, and ticket analytics across all DCT sites.

---

## What It Does

- **Live ticket data** — pulls from all 7 Jira projects (dct-ops, albatross, eagle, heron, osprey, phoenix, snipecustomer)
- **Headcount visibility** — employee → site mapping sourced from Jira Assets (People schema)
- **Server counts** — active servers per site from Jira Assets (snipe-it-infrastructure schema)
- **Incremental sync** — after the first full load, only changed tickets are fetched (seconds, not minutes)
- **No proxy needed** — all Jira/Assets API calls are made server-side

---

## Requirements

| Requirement | Version |
|---|---|
| Docker + Docker Compose | Any recent version |
| Node.js (local dev only) | ≥ 18 |
| Jira personal API token | With access to all 7 projects |
| Jira Assets OAuth2 app | With `read:cmdb` scope |

---

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/ddeis-cw/dcops-jira-dashboard
cd dcops-jira-dashboard
```

### 2. Configure credentials

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable | Where to get it |
|---|---|
| `JIRA_EMAIL` | Your Atlassian account email |
| `JIRA_TOKEN` | [id.atlassian.com → API tokens](https://id.atlassian.com/manage-profile/security/api-tokens) |
| `ASSETS_CLIENT_ID` | [developer.atlassian.com → your OAuth app](https://developer.atlassian.com/console/myapps) |
| `ASSETS_CLIENT_SECRET` | Same OAuth app — Client Secret |

`JIRA_CLOUD_ID` and `ASSETS_WORKSPACE` are pre-filled with CoreWeave's values. Do not change them.

### 3. Start the server

```bash
docker compose up -d
```

Open **http://localhost:3000** in your browser.

**On first boot**, the server automatically runs a full sync:
- Tickets: ~5–10 minutes (73k+ tickets)
- Employees: ~2 minutes
- Servers: ~15 minutes (323k objects)

Progress is logged to the container: `docker compose logs -f`

After the first sync, all data is stored locally in SQLite (`./data/dcops.db`). Tickets sync incrementally every 30 minutes. Employees and servers sync weekly on Sunday.

---

## Updating the Dashboard

After pulling new changes from git:

```bash
git pull
docker compose up -d --build
```

The database (`./data/`) is stored outside the container and is **never affected by rebuilds**. Downtime is typically under 10 seconds.

---

## Manual Sync

Trigger a sync immediately via the API without restarting the server:

```bash
# Sync tickets only (incremental if previously synced)
curl -X POST http://localhost:3000/api/sync/tickets

# Sync employees (from Jira Assets)
curl -X POST http://localhost:3000/api/sync/employees

# Sync server counts (from Jira Assets — takes ~15 min)
curl -X POST http://localhost:3000/api/sync/servers

# Sync everything
curl -X POST http://localhost:3000/api/sync/all
```

Check sync status:

```bash
curl http://localhost:3000/api/status
```

---

## Local Development (without Docker)

```bash
npm install
cp .env.example .env   # fill in credentials
npm run dev            # starts server with hot-reload via nodemon
```

The dashboard files are served from `public/`. To update the dashboard UI, edit `public/HeadcountPlanning.jsx` and refresh the browser.

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/status` | GET | Ticket counts, sync status, active syncs |
| `/api/tickets` | GET | All tickets. Optional: `?since=ISO_DATE`, `?project=X` |
| `/api/employees` | GET | Employee → site map `{ "Name": "US-DTN" }` |
| `/api/servers` | GET | Server counts per site `{ "US-DTN": 9543 }` |
| `/api/sites` | GET | Aggregated stats per site |
| `/api/sync/tickets` | POST | Trigger incremental ticket sync |
| `/api/sync/employees` | POST | Trigger employee sync |
| `/api/sync/servers` | POST | Trigger server sync |
| `/api/sync/all` | POST | Trigger full sync of all three |
| `/api/sync/history` | GET | Last 50 sync runs with status |

---

## Project Structure

```
dcops-jira-dashboard/
├── src/
│   ├── server.js          # Express API + static file serving
│   ├── db.js              # SQLite initialization + migration runner
│   └── sync/
│       ├── index.js       # Sync orchestrator + cron scheduler
│       ├── tickets.js     # Jira ticket sync (incremental)
│       ├── employees.js   # Jira Assets employee sync
│       └── servers.js     # Jira Assets server count sync
├── migrations/
│   └── 001_initial_schema.sql
├── public/
│   ├── index.html
│   ├── HeadcountPlanning.jsx
│   └── MBRDashboard.jsx
├── data/                  # SQLite database — gitignored, Docker volume
├── Dockerfile
├── docker-compose.yml
├── .env.example           # Credential template — safe to commit
├── .env                   # Real credentials — NEVER commit
└── package.json
```

---

## Sync Schedule

| Data | Schedule | Method |
|---|---|---|
| Tickets | Every 30 minutes (incremental) | Jira REST API with `updated >=` cursor |
| Employees | Every Sunday at 2am | Jira Assets — People schema 128, objectId range scan |
| Servers | Every Sunday at 3am | Jira Assets — schema 127, rack location attribute |

---

## Credential Requirements

### Jira API Token (`JIRA_EMAIL` + `JIRA_TOKEN`)
- Must have read access to: `dct-ops`, `service-desk-albatross`, `service-desk-eagle`, `service-desk-heron`, `service-desk-osprey`, `service-desk-phoenix`, `service-desk-snipecustomer`

### Jira Assets OAuth2 App (`ASSETS_CLIENT_ID` + `ASSETS_CLIENT_SECRET`)
- Must have the `read:cmdb` scope
- Managed at [developer.atlassian.com/console/myapps](https://developer.atlassian.com/console/myapps)

---

## Hosting on an Internal Server

1. Deploy the server on any VM accessible via VPN
2. Set `PORT=3000` (or any port) in `.env`
3. Team members on VPN access it at `http://<server-ip>:3000`
4. No individual credential setup required — credentials live on the server only

For automatic deploys on git push, add this to your CI pipeline:

```yaml
deploy:
  only: [main]
  script:
    - ssh deploy@your-server "cd dcops-jira-dashboard && git pull && docker compose up -d --build"
```

---

## Troubleshooting

**Dashboard shows no data after startup**
→ The initial sync is still running. Check progress: `docker compose logs -f`

**Ticket sync returns 0 results**
→ Verify `JIRA_TOKEN` is valid at `http://localhost:3000/api/status`. Regenerate at [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens) if expired.

**Employee or server sync fails with 401**
→ The OAuth app token has expired or the `read:cmdb` scope is missing. Check with your Jira admin.

**Port 3000 already in use**
→ Set `PORT=3001` (or any available port) in `.env` and restart.
