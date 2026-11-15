# Inventory Optimization Module for a Cloud-Based Hotel Management System

A full-stack web application that tracks hotel inventory in real time and recommends **what to order, how much, and when**, using explainable inventory-management formulas applied to the hotel's own consumption data.

Built as a standalone module (React + Express + MongoDB) that can later be plugged into a larger cloud hotel management system. All data is scoped by `hotelId`, so the same deployment can serve many hotels.

> Internship project, Need Technosoft Pvt. Ltd.

---

## Contents

1. [Features](#features)
2. [Technology stack](#technology-stack)
3. [Architecture](#architecture)
4. [Getting started](#getting-started)
5. [Environment variables](#environment-variables)
6. [Deployment (Vercel + Render + MongoDB Atlas)](#deployment-vercel--render--mongodb-atlas)
7. [Demo accounts and sample data](#demo-accounts-and-sample-data)
8. [Optimization algorithms](#optimization-algorithms)
9. [API reference](#api-reference)
10. [Roles and permissions](#roles-and-permissions)
11. [Testing](#testing)
12. [Security](#security)
13. [Project structure](#project-structure)
14. [Known limitations and future work](#known-limitations-and-future-work)

---

## Features

| Area | What it does |
|---|---|
| **Dashboard** | Live KPIs (items, stock value, low/out-of-stock, expiring, pending POs, monthly consumption, purchases, wastage) and six charts: monthly consumption, inventory by category, purchasing expenses, stock-level overview, top 5 consumed products, wastage trend. Also shows recent activity, recent POs, low-stock alerts and quick actions. Every number is aggregated from the database. |
| **Inventory** | CRUD with SKU, category, unit, min/max/reorder levels, unit cost, supplier, location, expiry date, image and per-item optimization parameters. Search, filtering by category and status, sorting and pagination. Automatic status: In stock, Low stock, Out of stock, Overstocked, Expiring soon, Expired. Deleting archives the item so its history is kept. |
| **Stock movements** | Stock In, Stock Out (consumption), Adjustment, Return, Transfer and Wastage. Each movement records before/after balances, user, reason, reference number and time. Stock can never go negative, even with concurrent requests. Changes run in database transactions. |
| **Suppliers** | CRUD, lead times, payment terms, status, supplied products, purchase history and totals. Suppliers that are still referenced cannot be deleted; they can be deactivated instead. |
| **Purchase orders** | Draft → Pending approval → Approved → Ordered → Partially received / Received (or Cancelled). Totals and tax are calculated on the server. Only an admin can approve. Receiving goods creates Stock In movements and updates the status automatically. Duplicate receiving is prevented with idempotency keys and optimistic locking. |
| **Optimization engine** | Low-stock detection, moving-average demand forecast with a data-quality indicator, calculated reorder point, EOQ, suggested order quantity, overstock detection, and expiry/wastage risk. It counts stock already on order (inventory position) and gives a priority and a plain-language reason for every recommendation. Draft POs are created only when the user confirms. |
| **Reports** | 10 reports: current inventory, low stock, stock movements, monthly consumption, supplier purchases, purchase orders, expiry, wastage, valuation and optimization. Filters for date range, category, product, supplier and status. Charts, plus **CSV** and **PDF** export. |
| **Alert center** | Database-backed notifications for low stock, out of stock, expiring (≤30 days, ≤7 days), expired, overstock, POs awaiting approval, PO status changes and significant stock adjustments. Read/unread is tracked per user, with severity levels. Condition alerts resolve automatically when the condition clears. An hourly background scan catches expiry changes caused by the date alone. |
| **Administration** | Users and roles, staff assignment to categories, hotel settings (expiry windows, forecast window, EOQ cost defaults, tax), and an audit log of important operations. |
| **UI** | Responsive layout (desktop, tablet, mobile drawer) with loading, empty and error states, toasts, confirmation dialogs and role-aware navigation. |

## Technology stack

| Layer | Technologies |
|---|---|
| Frontend | React 18, Vite 6, Tailwind CSS 4, React Router 6, Axios, Recharts, Lucide React, React Hook Form + Zod, date-fns |
| Backend | Node.js (≥ 18.18), Express 5, JWT (`jsonwebtoken`), bcrypt hashing (`bcryptjs`), Zod validation, Helmet, CORS, express-rate-limit, Multer (image upload), PDFKit (PDF export), dotenv |
| Database | MongoDB (replica set recommended), Mongoose 8 |
| Testing | Vitest, Supertest, mongodb-memory-server (real `mongod` in a replica set) |

`bcryptjs` is a pure-JavaScript implementation of bcrypt. It produces the same `$2b$` hashes as the native `bcrypt` package, but needs no C++ build tools on Windows.

## Architecture

```
React SPA (Vite)  ──HTTP/JSON──►  Express REST API  ──Mongoose──►  MongoDB
  pages/            /api/*          routes/       → authenticate (JWT) → authorize (role)
  components/                       middleware/   → validate (Zod) → sanitize
  services/ (Axios)                 controllers/  → thin: parse request, call service, audit
  context/ (auth, toasts)           services/     → business logic (stock, PO workflow,
                                                     optimization engine, alerts, reports)
                                    models/       → schemas, indexes, validation
```

Design decisions:

- **Business logic lives in services, not in controllers or React components.** `services/optimization/algorithms.js` contains only pure functions (no database access), so each formula is unit-tested on its own.
- **One code path for stock changes.** All stock changes go through `stockService.recordMovement`. It uses an atomic `findOneAndUpdate` with `$inc` and a `currentStock ≥ quantity` filter, so overselling is impossible even with concurrent requests. The movement record and consumption record are written in the same transaction.
- **Transactions where available.** On a replica set (local `npm run db:start`, or Atlas), multi-document operations such as receiving a PO run in transactions. On a standalone `mongod`, the code still works: stock updates stay atomic, but a multi-step operation that fails halfway is not rolled back.
- **Multi-tenant ready.** Every collection has a `hotelId`. Every query is scoped by the signed-in user's `hotelId`, which comes from the JWT/database and never from request parameters. Cross-hotel access returns 404, and this is covered by tests.
- **Demand vs. stock-out.** Consumption (`stock_out`) is copied to `ConsumptionRecords`, which feed the forecast. Wastage, transfers and adjustments change stock but are **not** counted as demand.

## Getting started

### Prerequisites

- Node.js 18.18+ (developed on Node 22)
- MongoDB, in one of these forms:
  - **Option A (no install):** `npm run db` starts a local MongoDB replica set using a `mongod` binary that is downloaded once (about 70 MB) into the npm cache. Data is kept in `server/.mongo-data/`.
  - **Option B:** MongoDB Atlas. Paste the connection string into `server/.env`.
  - **Option C:** an installed MongoDB Community Server. For transactions, start it as a replica set (`mongod --replSet rs0`, then run `rs.initiate()` once in `mongosh`).

### Install and run

```bash
# 1. Install dependencies for root, server and client
npm run install:all

# 2. Configure the API
cp server/.env.example server/.env        # then set JWT_SECRET (and MONGO_URI if not using option A)
#   generate a secret: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3. Start MongoDB (option A only; keep this terminal open)
npm run db

# 4. In a second terminal: load demo data (deletes existing data in that database)
npm run seed

# 5. Start API (http://localhost:5000) and web app (http://localhost:5173)
npm run dev
```

Open **http://localhost:5173** and sign in with a [demo account](#demo-accounts-and-sample-data).

Useful individual commands:

| Command | Purpose |
|---|---|
| `npm --prefix server run dev` | API only, auto-restart on changes |
| `npm --prefix client run dev` | Web app only (proxies `/api` and `/uploads` to port 5000) |
| `npm test` | Backend test suite |
| `npm run build` | Production build of the web app into `client/dist` |

## Environment variables

`server/.env` (never committed; see `server/.env.example`):

| Variable | Required | Default | Description |
|---|---|---|---|
| `JWT_SECRET` | yes | none | Secret for signing tokens. In production the server refuses to start unless it is at least 32 characters and not the `.env.example` placeholder. |
| `MONGO_URI` | no | `mongodb://127.0.0.1:27017/hotel_inventory?replicaSet=rs0` | MongoDB connection string |
| `PORT` | no | `5000` | API port |
| `NODE_ENV` | no | `development` | `production` hides internal error details |
| `JWT_EXPIRES_IN` | no | `8h` | Token lifetime (one work shift) |
| `CLIENT_ORIGIN` | no | `http://localhost:5173` | Comma-separated list of origins allowed by CORS |
| `ALERT_SCAN_INTERVAL_MINUTES` | no | `60` | How often expiry/stock alerts are re-evaluated |
| `BCRYPT_ROUNDS` | no | `12` | bcrypt cost factor |
| `CLOUDINARY_URL` | on Render | empty (local disk) | `cloudinary://<api_key>:<api_secret>@<cloud_name>`. When set, item images are stored in Cloudinary instead of `server/uploads/` |
| `TRUST_PROXY` | no | empty (off) | Number of reverse proxies in front of the API (e.g. `1` on Render, Railway or behind Nginx) so rate limiting sees real client IPs |

`client/.env` (optional; see `client/.env.example`): `VITE_API_URL` (default `/api`) and `VITE_SHOW_DEMO_ACCOUNTS` (set to `false` to hide the demo shortcuts on the login page). No secrets are stored in the frontend.

## Deployment (Vercel + Render + MongoDB Atlas)

> **Current live deployment:** https://hotel-inventory-optimization.vercel.app. The frontend and the API run together as one Vercel project (root `vercel.json` + `api/index.mjs`, functions in the Mumbai region `bom1`), with MongoDB Atlas (Mumbai) as the database and item images stored in MongoDB (`IMAGE_STORAGE=database`). Vercel environment variables: `MONGO_URI`, `JWT_SECRET`, `CRON_SECRET`, `NODE_ENV=production`, `IMAGE_STORAGE=database`, `TRUST_PROXY=1`, `JWT_EXPIRES_IN=8h`, `VITE_SHOW_DEMO_ACCOUNTS=true`. A daily Vercel Cron job calls `/api/cron/alert-scan`. The steps below describe the alternative split setup (Render API + Vercel frontend + Cloudinary).

| Part | Host | Config in this repo |
|---|---|---|
| Frontend (React build) | Vercel, root directory `client` | `client/vercel.json` (SPA rewrites so deep links like `/inventory` work on refresh) |
| API (Express) | Render web service, root directory `server` | `render.yaml` (Blueprint: build, start, health check, env vars) |
| Database | MongoDB Atlas (replica set, so transactions work) | `MONGO_URI` |
| Item images | Cloudinary | `CLOUDINARY_URL` (Render's disk is wiped on every deploy) |

**Order of steps**

1. **MongoDB Atlas**: create a free M0 cluster, a database user, and allow network access from `0.0.0.0/0` (Render's free tier has no fixed IP). Copy the `mongodb+srv://...` connection string and add the database name: `.../hotel_inventory?retryWrites=true&w=majority`.
2. **Load the demo data into Atlas** from your computer (the seed refuses to run when `NODE_ENV=production`):
   ```powershell
   cd server
   $env:MONGO_URI="mongodb+srv://<user>:<password>@<cluster>.mongodb.net/hotel_inventory?retryWrites=true&w=majority"
   npm run seed
   Remove-Item Env:MONGO_URI
   ```
3. **Cloudinary**: create a free account and copy the *API environment variable* (`cloudinary://...`).
4. **Render**: New → Blueprint → select this repository (it reads `render.yaml`). Enter `MONGO_URI`, `CLOUDINARY_URL`, and for now `CLIENT_ORIGIN=https://placeholder.vercel.app`. `JWT_SECRET` is generated automatically. Wait for the deploy, then open `https://<service>.onrender.com/api/health`: it must show `"database":"connected"`.
5. **Vercel**: Add New → Project → import this repository, set **Root Directory** to `client`, and add the environment variable `VITE_API_URL=https://<service>.onrender.com/api` (and `VITE_SHOW_DEMO_ACCOUNTS=true` to keep the demo shortcuts). Deploy.
6. **Back on Render**: set `CLIENT_ORIGIN` to the Vercel production URL (e.g. `https://hotel-inventory.vercel.app`, no trailing path) and save. Render redeploys automatically.
7. Open the Vercel URL and sign in with a demo account.

Notes: Render's free instance sleeps after about 15 minutes without traffic, so the first request after a pause can take up to a minute. `VITE_API_URL` is baked in at build time, so redeploy the Vercel project after changing it. With demo accounts shown publicly, anyone can sign in as the demo admin; re-run step 2 to reset the data.

## Demo accounts and sample data

| Role | Email | Password |
|---|---|---|
| Admin | `admin@demo.com` | `Admin@123` |
| Inventory Manager | `manager@demo.com` | `Manager@123` |
| Staff (Kitchen, all categories) | `staff@demo.com` | `Staff@123` |
| Staff (Housekeeping, assigned to Toiletries, Guest Room Supplies and Cleaning Materials) | `housekeeping@demo.com` | `Staff@123` |

`npm run seed` creates the fictional **Himalayan Grand Hotel** (Kathmandu, prices in NPR):

- 8 categories, 7 suppliers (one inactive) with lead times, and 20 items (rice, wheat flour, cooking oil, sugar, tea, coffee, mineral water, milk, cleaning liquid, hand wash, shampoo, bath towels, bedsheets, toilet paper, kitchen gloves and more).
- **120 days of simulated operations.** The simulation runs day by day: consumption with weekend peaks and a festival-season increase, reorders when stock reaches the reorder point, deliveries after the supplier lead time, plus occasional wastage, returns, adjustments and transfers. The result is about 2,300 stock movements and about 2,200 consumption records with consistent before/after balances, and about 100 received purchase orders.
- Demo scenarios as of today:
  - low stock (rice, cooking oil, coffee, milk), out of stock (toilet paper), overstock (bath towels)
  - expired milk, water expiring in 5 days
  - one PO in each workflow state (draft, pending approval, approved, ordered, partially received, cancelled)
  - active notifications and an audit trail

The seed is deterministic (fixed random seed), so every run produces the same data relative to today's date.

## Optimization algorithms

All calculations live in `server/services/optimization/`. `algorithms.js` holds the pure formulas and `optimizationService.js` applies them to database data. Every result comes with its inputs, so it can be explained and checked.

### A. Low-stock detection

```
Current Stock ≤ Reorder Point  →  Low Stock (or Out of Stock when stock = 0)
```

This uses the item's configured reorder point. It is checked after every stock movement and opens or resolves an alert automatically.

### B. Economic Order Quantity (EOQ)

```
EOQ = √( (2 × D × S) / H )
D = annual demand          = average daily demand × 365   (from consumption records)
S = ordering cost per order = item.orderingCost, else hotel default
H = annual holding cost/unit = item.holdingCostPerUnit, else hotel holding-cost rate × unit cost
```

If D, S or H is missing, the API returns `canCalculate: false` and lists the missing inputs. **No values are invented.**

### C. Reorder point

```
Reorder Point = (Average Daily Demand × Lead Time) + Safety Stock
```

Lead time comes from the item, falling back to the supplier. Safety stock is configured per item (0 if not set, and the UI says so). As guidance only, the engine also shows a statistical safety stock, `1.65 × σ(daily demand) × √lead time` (about a 95% service level). Managers can apply the calculated reorder point to the item with one confirmed click.

### D. Demand forecasting: simple moving average

1. Consumption records are bucketed into a **continuous daily series**. Days without consumption count as 0, so the average is not overstated. The series starts at the item's first consumption, and today is excluded because it is incomplete.
2. Average daily demand = mean of the last *N* days (N = forecast window, default 30).
3. Predicted demand = average × forecast horizon (default 30 days).
4. Trend: the last 7 days are compared with the whole window (more than ±15% means rising or falling).
5. **Data quality:** *insufficient* (< 7 days of history or < 3 days with consumption), *low* (< 14 days or very irregular, CV > 1.5), *medium* (< 30 days or CV > 0.75), otherwise *high*. With insufficient data, the engine does not calculate EOQ or the reorder point.

This is a classical statistical method. The UI states that it is **not** an AI or machine-learning prediction.

### E. Overstock detection

`current stock > maximum stock` → recommends pausing purchases, and shows the excess quantity, its value and days of stock at the current consumption rate.

### F. Expiry and wastage management

Items are classified as expired, expiring within 7 days (critical) or expiring within 30 days. Both windows are configurable. The engine estimates the stock that **will not be used before expiry**:

```
at-risk quantity = current stock − (average daily demand × days to expiry)
```

It then recommends actions: use first (FEFO), move to a higher-use outlet, avoid reordering, or record as wastage.

### G. Recommendations and suggested quantity

A reorder is recommended when the **inventory position** (stock on hand + quantity on approved/ordered POs) is at or below 120% of the reorder point. Draft and pending POs are not counted, but they are shown in the reason so the same item isn't ordered twice.

Suggested quantity:

1. `max(EOQ, shortfall to reorder point)`, if EOQ is available.
2. Otherwise, order up to the maximum stock level.
3. Otherwise, the shortfall plus forecast demand over the horizon.

The result is capped at the maximum stock level.

Priority:

- **critical:** out of stock with nothing on order, or stock runs out before the supplier lead time
- **high:** at or below the reorder point
- **medium:** within 20% of the reorder point

Example reason produced by the engine:

> *Basmati Rice stock (48 kg) is at or below its calculated reorder point of 73.97 kg. Average consumption is 16.32 kg/day over the last 30 days, so current stock lasts about 2.9 day(s) against a 3-day supplier lead time. Consider ordering 352 kg (Economic Order Quantity (EOQ), capped at maximum stock level).*

Selected recommendations become **draft** purchase orders (one per supplier) only after the user confirms. They then go through the normal approval workflow.

## API reference

Base URL: `/api`. All endpoints except login and health require `Authorization: Bearer <token>`. Responses have the form `{ success, data, meta?, message? }`; errors have the form `{ success: false, message, details? }` with field-level `details` for validation errors (400).

Role abbreviations: **A** = admin, **M** = inventory manager, **S** = staff.

| Method | Endpoint | Roles | Description |
|---|---|---|---|
| GET | `/health` | public | API and database status |
| POST | `/auth/login` | public | `{ email, password }` → `{ token, user }`. Rate-limited: 20 failed attempts per 15 min. |
| GET | `/auth/me` | A M S | Current user and hotel settings |
| POST | `/auth/logout` | A M S | Invalidates all of the user's tokens |
| PUT | `/auth/password` | A M S | `{ currentPassword, newPassword }` → new token |
| GET | `/dashboard` | A M S | KPIs, charts, recent activity |
| GET | `/categories` | A M S | List with item count and stock value |
| POST / PUT | `/categories`, `/categories/:id` | A M | Create / update |
| DELETE | `/categories/:id` | A | Only if no items use it |
| GET | `/items` | A M S | `search, category, supplier, status, sort, order, page, limit` |
| GET | `/items/:id` | A M S | Detail with computed status |
| GET | `/items/:id/movements` | A M S | Stock history (paginated) |
| POST | `/items` | A M | Create (optional `openingStock` recorded as Stock In) |
| PUT | `/items/:id` | A M | Update (stock changes only through movements) |
| DELETE | `/items/:id` | A M | Archive (blocked while on an open PO) |
| POST | `/items/:id/image` | A M | Multipart `image` (JPG/PNG/WebP, max 2 MB) |
| GET | `/movements` | A M S | `item, category, type, from, to, search, page, limit` |
| POST | `/movements` | A M S* | `{ itemId, type, quantity, direction?, reason?, department?, toLocation?, referenceNo?, occurredAt? }`. *Staff may only record `stock_out`. |
| GET | `/suppliers`, `/suppliers/:id` | A M | List, or detail with products, purchase history and stats |
| POST / PUT / DELETE | `/suppliers`, `/suppliers/:id` | A M | Delete only when unreferenced |
| GET | `/purchase-orders`, `/purchase-orders/:id` | A M | `status, supplier, search, from, to` |
| POST / PUT | `/purchase-orders`, `/purchase-orders/:id` | A M | `{ supplier, items:[{item, quantity, unitPrice?}], taxRate?, notes?, expectedDeliveryDate? }`. Only drafts can be edited. |
| POST | `/purchase-orders/:id/submit` | A M | Draft → Pending approval |
| POST | `/purchase-orders/:id/approve`, `/reject` | A | Pending → Approved / Draft (`{ note? }`) |
| POST | `/purchase-orders/:id/order` | A M | Approved → Ordered |
| POST | `/purchase-orders/:id/cancel` | A M | Only if nothing has been received |
| POST | `/purchase-orders/:id/receive` | A M | `{ idempotencyKey, lines:[{lineId, quantity}], notes? }` |
| GET | `/optimization/recommendations` | A M | Reorder, overstock, expiry and per-item analysis |
| GET | `/optimization/items/:id` | A M | Forecast detail with 90-day history and projection |
| POST | `/optimization/items/:id/apply-reorder-point` | A M | Save the calculated reorder point |
| POST | `/optimization/purchase-orders` | A M | `{ items:[{item, quantity}] }` → draft POs grouped by supplier |
| GET | `/reports` | A M | Report catalogue |
| GET | `/reports/:key` | A M | `from, to, category, item, supplier, status, movementType, poStatus, withinDays, format=json\|csv\|pdf` |
| GET | `/notifications` | A M S | `state=active\|resolved\|all, unread, severity, type, page` |
| GET | `/notifications/unread-count` | A M S | Badge counts |
| PATCH | `/notifications/:id/read`, `/:id/unread`, `/read-all` | A M S | Per-user read state |
| POST | `/notifications/scan` | A M | Re-evaluate all alerts now |
| GET / POST / PUT / DELETE | `/users`, `/users/:id` | A | Manage users (DELETE deactivates) |
| PUT | `/users/:id/password` | A | Reset password (signs the user out) |
| GET / PUT | `/settings` | A M S read, A write | Hotel profile and inventory settings |
| GET | `/audit-logs` | A | `entityType, action, user, from, to` |

Report keys: `inventory`, `low-stock`, `movements`, `consumption`, `supplier-purchases`, `purchase-orders`, `expiry`, `wastage`, `valuation`, `optimization`.

## Roles and permissions

| Capability | Admin | Inventory Manager | Staff |
|---|:-:|:-:|:-:|
| View dashboard, inventory, alerts | ✓ | ✓ | ✓ (limited to assigned categories, if set) |
| Record consumption (Stock Out) | ✓ | ✓ | ✓ |
| Other movements (in, adjust, return, transfer, wastage) | ✓ | ✓ | |
| Add/edit/delete items, manage categories and suppliers | ✓ | ✓ | |
| Create, submit, order and receive purchase orders | ✓ | ✓ | |
| Approve or reject purchase orders | ✓ | | |
| Optimization recommendations, reports | ✓ | ✓ | |
| Users, hotel settings, audit log, delete categories | ✓ | | |

Permissions are enforced by the API on every request. The UI hides what a role cannot use, and shows an "Access restricted" page if someone navigates there directly.

## Testing

```bash
npm test          # runs server/tests with Vitest
```

The suite starts a real MongoDB replica set in memory (`mongodb-memory-server`), so transactions and indexes behave as they do in production. **Current result: 5 files, 78 tests, all passing.**

| File | Covers |
|---|---|
| `algorithms.test.js` | Low-stock rule, EOQ (including missing parameters), reorder point, safety stock, zero-filled daily series, SMA, forecast and data quality, trend, order quantity and caps, priority, expiry classification, wastage risk |
| `auth.test.js` | Hashing, login, enumeration-safe errors, validation, NoSQL operator stripping, protected routes, logout and password-change token invalidation, deactivated users |
| `inventory.test.js` | Item CRUD and validation, opening stock, duplicate SKU, read-only stock, search/filter/sort/pagination, archive rules, every movement type, **negative stock prevention including 5 concurrent requests**, alert open/resolve/no-duplicate, significant-adjustment notifications, expiry alerts, per-user read state |
| `workflow.test.js` | Server-side PO totals, the full approval workflow with role checks, partial and full receiving, **duplicate and concurrent receive prevention**, cancel rules, inactive suppliers, supplier history and delete rules, the optimization engine on real data (ROP, EOQ, capped quantity, priority, reason text), missing EOQ parameters, insufficient data, inventory position with on-order stock, applying the ROP, draft POs from recommendations, overstock/expiry, dashboard values, all 10 reports, CSV formula-injection guard, PDF output, report filters |
| `security.test.js` | Role matrix across endpoints, admin-only settings and users, staff limits, assigned-category restriction, **tenant isolation** (read, write, cross-hotel references, dashboard and report scoping) |

Development also included an end-to-end check through the Vite proxy, plus a headless-browser pass over every page for each role, including mobile width.

## Security

- Passwords hashed with bcrypt (cost 12). Hashes are never returned by the API.
- JWT with a `tokenVersion` claim, so logout, password change, role change or deactivation invalidates existing tokens immediately.
- Role-based authorization on every route, plus business-rule checks in services (for example, only admins approve POs).
- Zod validation of bodies, query strings and route params. Unknown fields are stripped. Keys starting with `$` or containing `.` are removed (NoSQL injection). Search input is regex-escaped.
- Tenant isolation: `hotelId` always comes from the authenticated user.
- Helmet security headers, an allow-list for CORS, a 1 MB JSON body limit, and a login rate limit.
- Uploads: type allow-list, 2 MB limit, random file names.
- CSV exports escape formula characters (`= + - @`) to prevent spreadsheet formula injection.
- Centralised error handler. Internal errors are hidden in production.
- Audit log of logins, item/supplier/category changes, stock movements, PO actions, settings, user management and report exports.
- `.env` is git-ignored. The frontend contains no secrets.

## Project structure

```
├── package.json            # root scripts (install:all, db, seed, dev, test, build)
├── server/
│   ├── server.js           # bootstrap: DB connection, HTTP server, background alert scan
│   ├── app.js              # Express app (middleware, routes, error handling)
│   ├── config/             # env loading, MongoDB connection, transaction detection
│   ├── models/             # Hotel, User, Category, Supplier, InventoryItem, StockMovement,
│   │                       # ConsumptionRecord, PurchaseOrder, Notification, AuditLog, Counter
│   ├── middleware/         # auth (JWT + roles), validate (Zod), sanitize, upload, errorHandler
│   ├── validators/         # Zod schemas per module
│   ├── controllers/        # thin request handlers
│   ├── services/           # business logic
│   │   ├── stockService.js         # the only code path that changes stock
│   │   ├── purchaseOrderService.js # workflow and receiving
│   │   ├── alertService.js         # notification rules
│   │   ├── dashboardService.js / reportService.js / exportService.js
│   │   └── optimization/           # algorithms.js (pure) + optimizationService.js
│   ├── routes/             # route table with role guards
│   ├── seed/               # demo data and 120-day simulation
│   ├── scripts/localMongo.js
│   └── tests/
└── client/
    └── src/
        ├── App.jsx                 # routes (lazy-loaded pages, role guards)
        ├── layouts/AppLayout.jsx   # sidebar + top bar
        ├── pages/                  # one file per screen
        ├── components/             # ui/ (design system), charts/, inventory/, purchasing/,
        │                           # suppliers/, optimization/, layout/
        ├── context/                # AuthContext, ToastContext
        ├── hooks/                  # useApi, lookups
        ├── services/               # Axios instance and endpoint modules
        └── utils/                  # formatting, status maps
```

## Known limitations and future work

- **Single storage location per item.** A partial transfer is recorded in the history, but the item keeps one location. Multi-location stock would need a per-location balance collection.
- **Expiry is tracked per item, not per batch/lot.** FEFO batch tracking would be the next step for perishables.
- **Censored demand.** Days when an item was out of stock count as zero demand, which can understate the average after a stock-out. A future version could exclude stock-out days from the window.
- **Forecasting is a simple moving average** by design (explainable). Seasonal methods such as exponential smoothing or Holt-Winters could be added behind the same interface in `algorithms.js`.
- **Notifications are polled** every 60 s. Real-time push (WebSocket or Server-Sent Events) can be added on top of the existing notification collection.
- **Single hotel in the UI.** The data model and API are multi-tenant, but onboarding a new hotel and a super-admin console are not built yet.
- **Backdated entries.** A movement can be dated in the past. It updates current stock immediately, and the item ledger lists it in the order it was recorded (so balances always chain), while reports use its stated date.
- **Not yet production-hardened:** uploaded images are stored on the API server's local disk (use object storage such as S3/Cloudinary on hosts with ephemeral disks); the JWT is kept in `localStorage` (an httpOnly-cookie session would reduce XSS impact); only the login endpoint is rate-limited; there is no automated backup or CI pipeline. Run the API against a replica set (Atlas or `npm run db`): on a standalone MongoDB, multi-document transactions are unavailable.
- **Dependency upgrades pending:** `npm audit` reports a Zod 3 memory-exhaustion advisory (mitigated here by the 1 MB body limit and `.max()` caps, fixed in Zod 4) and a React Router 6 open-redirect advisory (not reachable: the app only navigates to internal paths). Both fixes are major-version upgrades. The other advisories are in dev/test tools (Vitest, Vite, nodemon) that are not deployed.
- **Integration points for the full hotel management system:** room occupancy as a demand driver, F&B point-of-sale consumption feeds, single sign-on, and accounting export for purchase orders.
