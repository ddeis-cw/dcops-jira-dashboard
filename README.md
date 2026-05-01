# DCOPS Jira Dashboard

CoreWeave Data Center Operations — headcount planning, ticket analytics, queue health, and trend visibility across all DCT sites.

> **Two dashboards:**
> - `http://localhost:3000` — Main DCOPS planning & analytics dashboard
> - `http://localhost:3000/mbr` — Monthly Business Review (MBR) dashboard

---

## What It Does

- **194,000+ tickets** synced locally from all 7 Jira projects — no live API calls needed during use
- **Headcount visibility** — employee → site mapping from Jira Assets, title-based DCT detection
- **Server counts** — active servers per site from Jira Assets snipe-it-infrastructure schema
- **Queue health** — open/on-hold/pending tickets per site and per assignee with avg age
- **Trend analysis** — per-site sparklines across 1d/7d/30d/60d/90d/180d/365d windows
- **MBR dashboard** — executive-facing monthly summary with closed ticket breakdown by project and site
- **Incremental sync** — after first load, only changed tickets are fetched (seconds, not minutes)

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

| Variable | Where to get it |
|---|---|
| `JIRA_EMAIL` | Your Atlassian account email |
| `JIRA_TOKEN` | [id.atlassian.com → API tokens](https://id.atlassian.com/manage-profile/security/api-tokens) |
| `ASSETS_CLIENT_ID` | [developer.atlassian.com → your OAuth app](https://developer.atlassian.com/console/myapps) |
| `ASSETS_CLIENT_SECRET` | Same OAuth app — Client Secret |

`JIRA_CLOUD_ID` and `ASSETS_WORKSPACE` are pre-filled with CoreWeave values. Do not change them.

### 3. Start the server

```bash
docker compose up -d
```

Open **http://localhost:3000** in your browser.

**On first boot**, the server automatically runs a full ticket sync (~5–15 minutes for 194k+ tickets). Employee and server sync must be triggered manually after first boot:

```bash
curl -X POST http://localhost:3000/api/sync/employees
curl -X POST http://localhost:3000/api/sync/servers
```

Monitor progress:

```bash
docker compose logs -f
```

After the first sync, all data is in SQLite (`./data/dcops.db`). Tickets sync incrementally every 30 minutes. Employees and servers sync weekly on Sunday.

---

## Dashboards

### Main Dashboard — `http://localhost:3000`

Five tabs:

| Tab | What it shows |
|---|---|
| **📊 Planning** | Workload & headcount by site. Columns: Total, % Vol, Avg/Day, Avg/Wk, Avg/Mo, Headcount, DCT, T/P/W, Servers, Srvr/HC, MTTR, **Queue Health**, Suggested HC, Gap |
| **🧮 Matrix** | Assignee × site heatmap + **Queue Status by Assignee** table below (closed 30d vs open/on-hold/pending per person) |
| **📍 By Site** | Per-site summary cards |
| **📋 Tickets** | Full ticket list with **Status** column (Closed/Open/On Hold/Pending color badge) |
| **📈 Trends** | Per-site multi-line chart for DO/SDA/SDE/SDH/SDO/SDP/SDN. Window: 1d/7d/30d/60d/90d/180d/365d. Period-over-period stats and type breakdown |

### MBR Dashboard — `http://localhost:3000/mbr`

Executive monthly summary. Select a month and click **Fetch Data** — instant load from local SQLite.

---

## Project Naming

| DB key | Jira project | Display |
|---|---|---|
| `do` | dct-ops | DO |
| `sda` | service-desk-albatross | SDA |
| `sde` | service-desk-eagle | SDE |
| `sdh` | service-desk-heron | SDH |
| `sdo` | service-desk-osprey | SDO |
| `sdp` | service-desk-phoenix | SDP |
| `sds` | service-desk-snipecustomer | SDN |

---

## Manual Sync

```bash
curl -X POST http://localhost:3000/api/sync/tickets    # incremental
curl -X POST http://localhost:3000/api/sync/employees
curl -X POST http://localhost:3000/api/sync/servers
curl -X POST http://localhost:3000/api/sync/all
curl -s http://localhost:3000/api/status | python3 -m json.tool
```

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/status` | GET | Ticket counts, sync status, active syncs |
| `/api/tickets` | GET | Tickets. Params: `date_from`, `date_to`, `date_field`, `project`, `page`, `limit` |
| `/api/tickets/open` | GET | Open/on-hold/pending tickets by site and by assignee with age stats |
| `/api/tickets/by-site-project` | GET | Closed tickets by site+project (employee site fallback). Params: `date_from`, `date_to`, `date_field` |
| `/api/employees` | GET | `{ employees, dctList, dctBySite, total }` |
| `/api/servers` | GET | Server counts per site |
| `/api/sites` | GET | Aggregated ticket + headcount + server stats per site |
| `/api/trends` | GET | Time-series by site+project. Param: `window` (1d/7d/30d/60d/90d/180d/365d) |
| `/api/sync/*` | POST | Trigger syncs: `tickets`, `employees`, `servers`, `all` |
| `/api/sync/history` | GET | Last 50 sync runs |

---

## Project Structure

```
dcops-jira-dashboard/
├── src/
│   ├── server.js              # Express API + static file serving
│   ├── db.js                  # SQLite init + migration runner
│   └── sync/
│       ├── index.js           # Cron scheduler + orchestrator
│       ├── tickets.js         # Jira ticket sync + location extraction
│       ├── employees.js       # Jira Assets sync + title-based DCT detection
│       └── servers.js         # Jira Assets server count sync
├── migrations/
│   ├── 001_initial_schema.sql
│   ├── 002_drop_raw_json.sql
│   └── 003_add_employee_title.sql
├── public/
│   ├── index.html             # Main dashboard entry
│   ├── mbr.html               # MBR dashboard entry
│   ├── DCOPSJiraDashboard.jsx # Main dashboard React component
│   ├── MBRDashboard.jsx       # MBR React component
│   ├── bundle.js              # Built by esbuild at Docker build time
│   └── mbr-bundle.js          # MBR bundle (Recharts bundled directly)
├── build.js                   # esbuild config — builds both bundles
├── data/                      # SQLite DB — gitignored, Docker volume
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── package.json
```

---

## DCT Detection

DCT membership is detected at sync time from Jira Assets job titles — no hardcoded name list. Covers both "Data Center" (American) and "Data Centre" (British) spellings. To refresh:

```bash
curl -X POST http://localhost:3000/api/sync/employees
docker compose logs -f | grep "sync:employees"
```

---

## Location Resolution

Tickets have two location fields:

1. `customfield_11810` — rack-level string (e.g. `US-DTN01`, `US-WEST-07A`)
2. `customfield_10194` — DC alias (e.g. `las1`, `3PL`)

Resolution order:
1. `customfield_11810` validated against known site codes — rejects aliases like `US-WEST`
2. `customfield_10194` mapped via alias table (`las1` → `US-LAS`, `3PL` → `US-DTN`)
3. Assignee's employee site as fallback (covers ~50% of service desk tickets)

---

## Sync Schedule

| Data | Schedule |
|---|---|
| Tickets | Every 30 min (incremental) |
| Employees | Every Sunday at 2am |
| Servers | Every Sunday at 3am |

---

## Updating

```bash
git pull
docker compose up -d --build
```

The database (`./data/`) is a Docker volume — never wiped by rebuilds.

---

## Troubleshooting

### Dashboard shows no data after startup
Initial sync is still running. Monitor:
```bash
docker compose logs -f | grep "sync:tickets"
```
Expect 5–15 minutes on first boot.

---

### Employees / servers show 0 after restart
These don't auto-sync on restart. Trigger manually:
```bash
curl -X POST http://localhost:3000/api/sync/employees
curl -X POST http://localhost:3000/api/sync/servers
```

---

### Trends tab — blank chart or site dropdown empty
The endpoint is returning empty data. Verify:

```bash
curl -s "http://localhost:3000/api/trends?window=30d" | python3 -c "import json,sys; d=json.load(sys.stdin); print('sites:', len(d['sites']), 'labels:', len(d['labels']))"
```

If `sites: 0` — the `strftime` fix may be missing from the container. Check:
```bash
docker exec dcops-dashboard grep "strftime" /app/src/server.js | grep SUBSTR
```

If no output, force a clean rebuild:
```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

---

### MBR dashboard shows "Failed to fetch"
Ticket sync hasn't completed or the selected month has no data. Check:
```bash
# Ticket count
curl -s http://localhost:3000/api/status | python3 -c "import json,sys; d=json.load(sys.stdin); print('tickets:', d['tickets']['count'])"

# Test a specific month
curl -s "http://localhost:3000/api/tickets?date_from=2026-03-01&date_to=2026-03-31&limit=1" | python3 -c "import json,sys; d=json.load(sys.stdin); print('March 2026:', d['total'])"
```

---

### Container crash-looping on startup
Check logs for the specific error:
```bash
docker compose logs --tail=30
```

Common causes:
- **`Cannot find module './employees'`** — `src/sync/employees.js` is missing from the image. Verify it's committed and rebuild.
- **`npm ci` fails** — missing `package-lock.json`. Generate and commit: `npm install --package-lock-only && git add package-lock.json && git commit`

---

### Docker build uses cached layers — changes not picked up
```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

---

### Jira API token expired (401 on sync)
Regenerate at [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens), update `.env`, restart:
```bash
docker compose up -d
```

---

### Assets OAuth expired (employee/server sync fails)
OAuth tokens auto-refresh each run. If failing, verify `ASSETS_CLIENT_ID` and `ASSETS_CLIENT_SECRET` are still valid in the [Atlassian developer console](https://developer.atlassian.com/console/myapps).

---

### Queue Status by Assignee shows all users (not filtered)
Ensure tickets are loaded first (click Fetch Data in the toolbar), then apply your filters before switching to the Matrix tab. The Queue Status table mirrors exactly who is visible in the heatmap above it.

---

### Port 3000 already in use
Set `PORT=3001` in `.env` and restart.

---

## Useful One-Liners

```bash
# Full status check
curl -s http://localhost:3000/api/status | python3 -m json.tool

# DCT member count
curl -s http://localhost:3000/api/employees | python3 -c "import json,sys; d=json.load(sys.stdin); print('DCT:', len(d['dctList']), '/ Total:', d['total'])"

# Date range of synced tickets
docker exec -w /app dcops-dashboard node -e "
require('dotenv').config();
const db = require('better-sqlite3')(process.env.DB_PATH||'/app/data/dcops.db');
console.log(db.prepare('SELECT MIN(created_at) as oldest, MAX(created_at) as newest, COUNT(*) as n FROM tickets').get());
"

# Open ticket summary by site (top 10)
curl -s http://localhost:3000/api/tickets/open | python3 -c "
import json,sys; d=json.load(sys.stdin)
for s,v in sorted(d['bySite'].items(), key=lambda x:-x[1]['total'])[:10]:
    print(f'{s}: {v[\"total\"]} open, avg {v[\"avg_age\"]}d')
"

# Check a ticket's location fields directly via Jira API
docker exec -w /app dcops-dashboard node -e "
require('dotenv').config();
const auth='Basic '+Buffer.from(process.env.JIRA_EMAIL+':'+process.env.JIRA_TOKEN).toString('base64');
fetch('https://api.atlassian.com/ex/jira/'+process.env.JIRA_CLOUD_ID+'/rest/api/3/issue/DO-12345?fields=customfield_11810,customfield_10194,labels,summary',{headers:{Authorization:auth,Accept:'application/json'}})
  .then(r=>r.json()).then(d=>console.log(JSON.stringify(d.fields,null,2)));
"
```

---

## Recent Changes

| Date | Change |
|---|---|
| Apr 2026 | Added **Trends tab** — per-site sparklines, 7 time windows, period-over-period stats |
| Apr 2026 | Added **Queue Health column** to Planning tab — open count, avg age, on-hold/pending per site |
| Apr 2026 | Added **Queue Status by Assignee** to Matrix tab — closed (30d) vs open/on-hold/pending, mirrors active filter |
| Apr 2026 | Added **Status column** to Tickets tab — Closed/Open/On Hold/Pending color badge |
| Apr 2026 | Added **MBR Dashboard** at `/mbr` — instant load from SQLite, no live Jira calls |
| Apr 2026 | Fixed **location extraction** — validates against known site codes, adds DC alias map (`las1`→`US-LAS`, `3PL`→`US-DTN`) |
| Apr 2026 | Fixed **DCT detection** — title-based, covers British spelling ("Data Centre") |
| Apr 2026 | Fixed **strftime** — uses `SUBSTR(created_at,1,19)` to handle timezone-offset date strings |
| Apr 2026 | Added **`/api/tickets/open`**, **`/api/trends`**, **`/api/tickets/by-site-project`** endpoints |
| Apr 2026 | Removed hardcoded `dct-list.js` — DCT data sourced live from Jira Assets |
| Apr 2026 | Added **`escort` label** to Jira API field access — foundation for future escort ticket metrics |
