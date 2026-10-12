# SessionScope

## Setup steps

I built SessionScope as my product analytics assignment. To run it locally, I use Node.js 20 or newer, npm 10 or newer, and MongoDB. Docker Desktop is the easiest way to run MongoDB for development.

1. Copy the example environment file in the repository root. In PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

   If `.env` already exists, keep it and edit the values you need instead of copying over it.

2. Install the dependencies and start MongoDB:

   ```powershell
   npm ci
   docker compose up -d mongo
   ```

   If I want to use Atlas instead, I put its connection string in `.env` as `MONGODB_URI` and skip the Docker MongoDB step.

3. Start the apps:

   ```powershell
   npm run dev
   ```

   The dashboard runs at `http://localhost:5173`, the demo storefront at `http://localhost:5174`, and the API at `http://localhost:4000`. API docs are at `http://localhost:4000/api/v1/docs`.

4. The API creates the `demo-project` project when it first connects. To add sample events to an empty project, run `npm run seed` from the repository root.

## Tech stack

- React, TypeScript, and Vite for the dashboard and demo storefront
- TanStack Query and Recharts for fetching and displaying analytics
- Node.js, Express, and TypeScript for the API
- MongoDB Atlas or local MongoDB, accessed through Mongoose
- Zod for validating incoming events
- A small browser tracking SDK in `packages/tracking-sdk`
- Vitest for unit and component tests

## Assumptions and trade-offs

- I use a public project ID to identify which project an event belongs to. It is not a secret and does not authenticate a visitor.
- The tracker records page views and safe clicks. It does not collect form values, passwords, keystrokes, page snapshots, query strings, or URL fragments.
- A random browser session ID is stored in local storage. A new session starts after 30 minutes without activity. This is simple for the demo, but it is not the same as identifying a signed-in user across devices.
- Click heatmaps use coordinates relative to the visible browser viewport. They do not capture or recreate a full-page screenshot.
- The dashboard polls the API for current analytics rather than using a WebSocket connection. This keeps the first version simple, with a small delay before new events appear.
- The demo storefront's checkout does not take payment.
- Event records expire after 90 days using MongoDB's TTL index. MongoDB removes expired records asynchronously, so the timing is approximate.
- Allowed-origin checks help reject accidental or unwanted browser submissions, but they are not authentication. This assignment has no accounts or role-based access, so I would not use it for sensitive or regulated analytics.
- API rate limits are stored in process memory. A larger deployment would need shared rate limiting, monitoring, backups, and load testing.

## What the app does

- Tracks page views and safe clicks on the demo storefront or another site where I install the tracker.
- Shows an overview, sessions, individual events, and click heatmaps.
- Lets me filter analytics by date, event type, session, and page.
- Keeps event collection and project settings in MongoDB.

## Project layout

- `apps/api` — Express API and MongoDB models
- `apps/dashboard` — analytics dashboard
- `apps/demo-storefront` — sample website with the tracker installed
- `packages/tracking-sdk` — browser tracking SDK
- `packages/shared-types` — types shared across apps

## Environment variables

The local defaults are in `.env.example`. The API loads the repository-root `.env` file.

| Variable | Used by | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | API | MongoDB connection string |
| `PORT` | API | API port; defaults to `4000` locally |
| `ALLOWED_ORIGINS` | API | Comma-separated browser origins, without trailing slashes |
| `DEFAULT_PROJECT_ID` | API and frontend | Project ID; defaults to `demo-project` |
| `DEFAULT_PROJECT_NAME` | API | Name for the project created at startup |
| `EVENT_RETENTION_DAYS` | API | Event retention period; defaults to 90 days |
| `ADMIN_API_KEY` | API | Protects project settings updates in production |
| `LOG_LEVEL` | API | Pino logging level; defaults to `info` |
| `VITE_API_URL` | Dashboard and storefront | Base URL of the API; no `/api` suffix |
| `VITE_PROJECT_ID` | Dashboard and storefront | Project ID to query or send events for |
| `VITE_DEMO_URL` | Dashboard | Storefront URL used in dashboard links |
| `VITE_TRACKER_URL` | Dashboard | Optional URL shown in the installation snippet |

For local work, `.env.example` uses `mongodb://127.0.0.1:27017/sessionscope`. For Atlas, I use a URI like:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-host>/sessionscope?retryWrites=true&w=majority
```

I keep `.env` out of Git. I set `MONGODB_URI` and `ADMIN_API_KEY` only on the API host. `VITE_` variables are included in the browser build, so I only put public URLs and the project ID there.

## Deploying my version

I use MongoDB Atlas for the database, Render for the API, and two Vercel projects for the dashboard and storefront.

### Render API

I create the Render service from the repository's `render.yaml`. The API build command installs development dependencies because TypeScript and type packages are needed to compile:

```bash
npm ci --include=dev && npm run build --workspace @sessionscope/api
```

The start command is:

```bash
npm run start --workspace @sessionscope/api
```

In Render, I set:

- `MONGODB_URI` to my private Atlas connection string, including `/sessionscope` before any query string
- `ALLOWED_ORIGINS` to the deployed dashboard and storefront origins, separated by commas, with no trailing slash

For example:

```env
ALLOWED_ORIGINS=https://my-dashboard.vercel.app,https://my-storefront.vercel.app
```

I allowlist the Render service's outbound IP ranges in Atlas **Network Access**. I copy those ranges from the Render service's **Connect → Outbound** panel instead of opening the database to every IP.

### Vercel dashboard and storefront

I create two Vercel projects from this repository:

- Dashboard root directory: `apps/dashboard`
- Storefront root directory: `apps/demo-storefront`

Both apps use shared packages outside their root directory, so I enable Vercel's option to include source files outside the root directory.

In **both** projects, I set these environment variables for Production (and Preview if needed):

```env
VITE_API_URL=https://<my-render-api-url>
VITE_PROJECT_ID=demo-project
```

In the dashboard project, I also set:

```env
VITE_DEMO_URL=https://<my-storefront-vercel-url>
```

After changing a Vite environment variable, I redeploy that Vercel project so the value is included in its browser build. I never put `MONGODB_URI` or `ADMIN_API_KEY` in Vercel.

### Check the deployment

I check these API URLs after deploying:

- `https://<my-render-api-url>/api/v1/health` should return `status: ok`
- `https://<my-render-api-url>/api/v1/ready` should return `ready: true`

Then I open the deployed storefront, visit a page, and click something. The dashboard should show the new event shortly afterward. If it does not, I check the browser Network tab for the request to `/api/v1/events` and check Render logs for the same time.

## API routes

| Method | Route | What it does |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Confirms the API process is responding |
| `GET` | `/api/v1/ready` | Confirms MongoDB is connected |
| `POST` | `/api/v1/events` | Accepts one event or a batch of events |
| `GET` | `/api/v1/projects` | Returns project configuration |
| `PATCH` | `/api/v1/projects/:projectId` | Updates allowed origins |
| `GET` | `/api/v1/analytics/overview` | Returns totals and trends for the dashboard |
| `GET` | `/api/v1/sessions` | Lists filtered, paginated sessions |
| `GET` | `/api/v1/sessions/:sessionId/events` | Returns a session's events in order |
| `GET` | `/api/v1/events` | Returns events for the event explorer |
| `GET` | `/api/v1/heatmap/pages` | Lists pages with tracked clicks |
| `GET` | `/api/v1/heatmap/clicks` | Returns click coordinates for a page |

Analytics endpoints accept `projectId`. Date filters use ISO `from` and `to` values. Session listing also supports `page`, `limit`, `search`, `pageUrl`, and `sort=events`. The click endpoint requires `pageUrl`.

## Checks

From the repository root, I can run:

```powershell
npm run typecheck
npm test
npm run build
```

There is no automated MongoDB integration test or browser end-to-end test yet.
