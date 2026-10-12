# SessionScope

I built SessionScope to see how people move through a small demo website. The tracker records page views and safe clicks, the API stores those events in MongoDB, and the dashboard turns them into session details, charts, and click heatmaps.

This is a learning project, so it is not meant for regulated or sensitive data.

## What I used

React, Vite, TypeScript, Express, MongoDB with Mongoose, Zod, TanStack Query, Recharts, and Vitest.

## What it can do

- Track page views and clicks with a random session ID. A new session starts after 30 minutes of inactivity.
- Show an overview, sessions, event details, and click heatmaps in the dashboard.
- Filter and explore events by project, date, page, and session.
- Run a demo storefront with product pages, a cart, and a checkout flow that does not take payment.
- Restrict event collection by allowed website origins and validate incoming event data.
- Exclude form values, passwords, keystrokes, and page snapshots from tracking. Query strings and URL fragments are also removed.

## Project layout

- `apps/api` — Express API and MongoDB models
- `apps/dashboard` — analytics dashboard
- `apps/demo-storefront` — sample website with the tracker installed
- `packages/tracking-sdk` — browser tracking SDK

## What you need

Install Node.js 20 or newer and npm 10 or newer. For local development, use Docker Desktop for MongoDB, or install MongoDB 7 on your computer. You can use MongoDB Atlas instead.

## Run it locally

In PowerShell, open this project folder and run the copy command the first time only. If `.env` already exists, do not copy `.env.example` over it again, because that replaces your MongoDB URI with the local default.

```powershell
Copy-Item .env.example .env
npm install
docker compose up -d mongo
npm run dev
```

The apps will be available here:

- Dashboard: http://localhost:5173
- Demo storefront: http://localhost:5174
- API: http://localhost:4000
- API docs: http://localhost:4000/api/v1/docs

The local `.env` uses this MongoDB address by default:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/sessionscope
```

The API creates the demo project when it starts. If you want sample events, run `npm run seed`. The seed script only adds data when the project has no events.

## Connect to MongoDB Atlas

1. Create a cluster in Atlas and create a database user under **Database Access**.
2. Add the IP address of the computer or server that will connect under **Network Access**.
3. In Atlas, select **Connect**, choose the **Node.js Driver**, and copy the connection string.
4. Put the URI in the root `.env` file as `MONGODB_URI`. Include a database name such as `sessionscope` before the `?` in the URI.

It should have this general format:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-host>/sessionscope?retryWrites=true&w=majority
```

Replace the placeholders with your Atlas values. If the password contains special characters, URL-encode it. The API reads `MONGODB_URI`; separate `MONGODB_USERNAME` and `MONGODB_PASSWORD` variables are not needed by the app.

I keep `.env` out of Git, so credentials should go in `.env` locally and in the API host's secret environment settings when deployed. Don't put the MongoDB URI in a `VITE_` variable; those values are included in the browser build.

## Environment variables

| Variable | Used by | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | API | MongoDB connection string |
| `PORT` | API | API port; defaults to `4000` locally |
| `ALLOWED_ORIGINS` | API | Comma-separated browser origins allowed by CORS |
| `DEFAULT_PROJECT_ID` | API and frontend | Project identifier used by the demo; defaults to `demo-project` |
| `DEFAULT_PROJECT_NAME` | API | Name for the project created at startup |
| `EVENT_RETENTION_DAYS` | API | Event retention period; defaults to 90 days |
| `ADMIN_API_KEY` | API | Required for project settings updates in production |
| `LOG_LEVEL` | API | Pino logging level; defaults to `info` |
| `VITE_API_URL` | Dashboard and storefront | Base URL of the API |
| `VITE_PROJECT_ID` | Dashboard and storefront | Project identifier to query or send events for |
| `VITE_DEMO_URL` | Dashboard | Deployed demo storefront URL |
| `VITE_TRACKER_URL` | Dashboard | URL shown in the tracker installation snippet |

## Try the tracking flow

Open the storefront and visit a few pages. Click a product or button, then check the dashboard's Overview, Sessions, Events, or Click heatmap pages.

The heatmap uses normalized viewport coordinates, so it shows where clicks happened inside the visible browser area. It does not reconstruct a full-page screenshot. The dashboard's heatmap preview is a stylized canvas, not a capture of an arbitrary website.

## API routes

| Method | Route | What it does |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Confirms the API process is responding |
| `GET` | `/api/v1/ready` | Confirms MongoDB is connected |
| `POST` | `/api/v1/events` | Accepts one event or a batch of up to 100 |
| `GET` | `/api/v1/projects` | Returns project configuration |
| `PATCH` | `/api/v1/projects/:projectId` | Updates allowed origins |
| `GET` | `/api/v1/analytics/overview` | Returns dashboard totals and trends |
| `GET` | `/api/v1/sessions` | Lists filtered, paginated sessions |
| `GET` | `/api/v1/sessions/:sessionId/events` | Returns a session's events in order |
| `GET` | `/api/v1/events` | Returns events for the event explorer |
| `GET` | `/api/v1/heatmap/pages` | Lists pages with tracked clicks |
| `GET` | `/api/v1/heatmap/clicks` | Returns click coordinates for a page |

Analytics endpoints accept `projectId`. Date filters use ISO `from` and `to` values. Session listing also supports `page`, `limit`, `search`, `pageUrl`, and `sort=events`. The click endpoint requires `pageUrl`.

## Deploy it

For the live version I use MongoDB Atlas for the database, Render for the API, and two Vercel projects for the dashboard and demo storefront. I added `render.yaml` and Vercel rewrite files so the hosts know how to build the apps and keep their browser routes working.

### 1. Push the project to GitHub

Commit and push this repository. Vercel and Render both deploy from the Git repository, so the files on GitHub need to include the latest changes.

### 2. Deploy the dashboard and storefront on Vercel

Create two Vercel projects from this same repository:

- Dashboard project root: `apps/dashboard`
- Storefront project root: `apps/demo-storefront`

For both projects, enable **Include source files outside of the Root Directory** in the Root Directory build settings. These apps use shared packages from the repository's `packages` folder. Vercel should detect Vite, use `npm run build`, and publish the app's `dist` folder. The `vercel.json` files provide the route fallback for React Router pages.

Add these variables to both Vercel projects for Production and Preview, then redeploy after setting them:

```env
VITE_API_URL=https://<your-render-api-url>
VITE_PROJECT_ID=demo-project
```

For the Dashboard project, also add:

```env
VITE_DEMO_URL=https://<your-storefront-vercel-url>
```

`VITE_TRACKER_URL` is optional; by default the dashboard uses `<VITE_DEMO_URL>/tracker.js`. Vite values are included in public browser code, so only put public URLs and the project ID here. Never add `MONGODB_URI` or `ADMIN_API_KEY` to Vercel.

### 3. Add Render's IP ranges to Atlas

In Atlas, rotate the database user's password first because I accidentally shared the previous connection string while setting up the project. Then make a new connection string for the `sessionscope` database and keep it private.

Create the Render API service from the repository's `render.yaml`. Once Render creates the service, open its **Connect → Outbound** panel and add the listed IP ranges to Atlas under **Network Access**. Render's outbound ranges depend on the service region and can change, so use the ranges shown for this service. Add the IP ranges instead of the `0.0.0.0/0` allow-from-anywhere rule.

In the Render Blueprint setup, enter these values:

- `MONGODB_URI`: the new Atlas URI (keep it as a secret; include `/sessionscope` before any query string)
- `ALLOWED_ORIGINS`: the full Vercel origins, separated by commas and with no trailing slash, for example `https://my-dashboard.vercel.app,https://my-storefront.vercel.app`

The remaining API settings are in `render.yaml`. Render supplies `PORT`. The API creates the `demo-project` record on its first successful connection and uses `ALLOWED_ORIGINS` for both browser CORS and event-origin checks.

### 4. Point both Vercel apps at the API

After the API deploys, open these URLs, replacing the host with the Render URL:

- `https://<your-render-api-url>/api/v1/health` — should return `status: ok`
- `https://<your-render-api-url>/api/v1/ready` — should return `ready: true`

Set `VITE_API_URL` on both Vercel projects to the exact Render base URL (no `/api` suffix), then redeploy them. If you used a temporary URL while creating the Vercel projects, replace it now.

### 5. Verify event collection

Open the deployed storefront, visit a few pages, and click something. Then check Overview, Sessions, Events, and Click heatmap on the deployed dashboard. If the dashboard loads but tracking does not, check the Render logs and confirm that both Vercel production origins appear in Render's `ALLOWED_ORIGINS` value.

`PORT` is normally provided by the API host. Frontend `VITE_` values are public and need a new build after they change. Never set `MONGODB_URI` or `ADMIN_API_KEY` on a frontend project.

Project settings updates are protected in production by `ADMIN_API_KEY` and the `x-admin-key` request header. This project does not have user login or a secure browser flow for an admin secret, so don't put that key in the dashboard.

## Checks

Run these from the repository root:

```powershell
npm run typecheck
npm test
npm run build
```

The tests cover event validation, click coordinate bounds, SDK behavior, and dashboard rendering. There is no automated MongoDB integration suite or browser end-to-end suite yet.

## A few limitations

- Origin checks help control browser submissions, but they are not authentication; non-browser clients can forge an origin.
- Rate limits are kept in memory by each API process. A larger deployment should use shared rate limiting, monitoring, backups, and load testing.
- Retention uses MongoDB's TTL index. MongoDB deletes expired documents asynchronously, so deletion is not exact to the minute.
- The tracker is currently bundled with the demo storefront. For a separate website, host the built tracker file at a stable HTTPS URL.
- The app has no accounts or role-based access. Don't use it for sensitive or regulated analytics.
