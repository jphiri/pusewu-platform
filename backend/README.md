# PUSEWU Member Portal — Backend API

Node.js + Express + PostgreSQL backend for the PUSEWU member portal. Provides
authentication, the membership application and approval flow, the configurable
percentage-based deduction, retirement-savings tracking, cases, loans, welfare
claims, training, and administration — for all six user roles.

> **Status:** working reference backend. It is intended to be connected to the
> PUSEWU front-end and reviewed/hardened by your development team before it
> handles real member data (see **Security notes** and **Before production**).

---

## 1. What's inside

```
pusewu-backend/
├── src/
│   ├── server.js            Entry point (starts HTTP server)
│   ├── app.js               Express app: security, CORS, routes
│   ├── db/pool.js           PostgreSQL connection pool + transaction helper
│   ├── middleware/
│   │   ├── auth.js          requireAuth (JWT) + requireRole (RBAC)
│   │   └── errors.js        async wrapper + central error handler
│   ├── routes/
│   │   ├── auth.js          login, me
│   │   ├── applications.js  submit, list, approve, reject
│   │   ├── members.js       member dashboard, savings, cases, loans, welfare, training
│   │   ├── finance.js       deduction settings, PMEC reconciliation, fund
│   │   └── admin.js         users & roles, branch, executive
│   └── utils/
│       ├── auth.js          bcrypt + JWT helpers
│       ├── finance.js       percentage deduction calculation
│       └── refs.js          reference-code generators
├── migrations/001_init.sql  Full PostgreSQL schema
├── scripts/
│   ├── migrate.js           Runs migrations
│   └── seed.js              Creates the initial admin (no demo data)
├── docker-compose.yml       Postgres + API, one-command startup
├── Dockerfile
├── .env.example             Copy to .env
└── README.md
```

---

## 2. Quick start (Docker — recommended)

Requires Docker Desktop.

```bash
docker compose up --build
```

This starts PostgreSQL, runs the schema migration, creates the initial admin, and starts the
API on **http://localhost:4000**. Check it:

```bash
curl http://localhost:4000/api/health
# {"ok":true,"service":"pusewu-backend"}
```

To stop: `docker compose down` (add `-v` to also delete the database volume).

## 3. Quick start (without Docker)

Requires Node.js 20+ and a running PostgreSQL 14+.

```bash
# 1. Create the database and user (example)
createdb pusewu
psql -c "CREATE USER pusewu WITH PASSWORD 'pusewu_dev_password'; GRANT ALL ON DATABASE pusewu TO pusewu;"

# 2. Configure
cp .env.example .env      # then edit DATABASE_URL / PG* and JWT_SECRET

# 3. Install and set up
npm install
npm run setup             # runs migrate + seed

# 4. Run
npm start                 # http://localhost:4000
```

## 4. Initial administrator

The database starts empty except for one **System Administrator** account created
by `scripts/seed.js` from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (or a printed random
password if unset). There is **no demo data**. Log in as the administrator to
create the union's real staff (Finance, Officers, Branch Reps, Executive), then
Finance sets the deduction rate before members apply.

## 5. API reference

All requests/responses are JSON. Protected endpoints require a header:
`Authorization: Bearer <token>` from the login response.

### Auth
| Method | Path                | Role    | Purpose                        |
|--------|---------------------|---------|--------------------------------|
| POST   | /api/auth/login     | public  | Log in; returns `{token,user}` |
| GET    | /api/auth/me        | any     | Current user                   |

**Example**
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"finance@pusewu.org.zm","password":"your-finance-password"}'
```

### Applications
| Method | Path                              | Role            | Purpose                     |
|--------|-----------------------------------|-----------------|-----------------------------|
| POST   | /api/applications                 | public          | Submit application + sign   |
| GET    | /api/applications                 | officer, admin  | List applications           |
| POST   | /api/applications/:id/approve     | officer, admin  | Approve → activate member   |
| POST   | /api/applications/:id/reject      | officer, admin  | Reject                      |

The application body requires `signedName` to be the applicant's **full name in
CAPITAL letters** (typed-signature attestation, ECT Act 2021), plus `basicPay`
for the percentage calculation.

### Member (role: member)
| Method | Path                               | Purpose                          |
|--------|------------------------------------|----------------------------------|
| GET    | /api/members/me                    | Dashboard: profile, deduction, savings, open cases |
| PATCH  | /api/members/me                    | Update own phone/station/etc.    |
| GET    | /api/members/me/cases              | List own cases + timeline        |
| POST   | /api/members/me/cases              | Lodge a case                     |
| GET    | /api/members/me/loans              | List own loans                   |
| POST   | /api/members/me/loans              | Apply for a loan                 |
| GET    | /api/members/me/welfare            | List own welfare claims          |
| POST   | /api/members/me/welfare            | File a funeral-grant claim       |
| GET    | /api/members/trainings             | Trainings + own RSVP status      |
| POST   | /api/members/trainings/:id/rsvp    | RSVP to a training               |
| GET    | /api/members/case-library          | Anonymised case library          |

### Finance (role: finance; read also allowed for admin, exec)
| Method | Path                     | Purpose                                        |
|--------|--------------------------|------------------------------------------------|
| GET    | /api/finance/settings    | Current deduction settings                     |
| PUT    | /api/finance/settings    | Set rate (% of basic pay) + retirement split   |
| GET    | /api/finance/pmec        | Reconciliation counts by ministry              |
| GET    | /api/finance/fund        | Retirement-fund summary                        |

**Set the deduction**
```bash
curl -X PUT http://localhost:4000/api/finance/settings \
  -H "Authorization: Bearer <finance-token>" -H "Content-Type: application/json" \
  -d '{"deductionRate":1.5,"retirementMode":"percent","retirementShare":20,"deductionCode":"F396"}'
```

### Administration
| Method | Path                        | Role   | Purpose                    |
|--------|-----------------------------|--------|----------------------------|
| GET    | /api/admin/users            | admin  | List users                 |
| POST   | /api/admin/users            | admin  | Create a user (any role)   |
| PATCH  | /api/admin/users/:id/role   | admin  | Change a user's role       |
| DELETE | /api/admin/users/:id        | admin  | Remove a user              |
| GET    | /api/admin/branch           | rep    | Own-branch members         |
| GET    | /api/admin/executive        | exec, admin | Oversight aggregates  |

---

## 6. How the percentage deduction works

`src/utils/finance.js` computes each member's monthly deduction from their
`basic_pay` and the single `settings` row:

- `deduction_rate` — percent of basic pay (e.g. `1.5` → 1.5%).
- `retirement_mode` — `percent` (share of the deduction) or `fixed` (flat amount).
- `retirement_share` — the percentage or the fixed amount, per the mode.

Example: basic pay K10,000 at 1.5% → **K150** deduction; with `percent`/20 →
**K30** to retirement, **K120** to union operations. A member on K6,000 pays
**K90** with **K18** to retirement — proportional, as required. Until Finance
saves a rate, `configured` is `false` and member endpoints report the deduction
as not yet configured.

This is intentionally identical to the front-end `PUSEWU.computeDeduction`, so
the two never disagree.

---

## 7. Security notes (already in place)

- Passwords hashed with **bcrypt** (configurable rounds).
- **JWT** bearer tokens; role encoded in the token, checked per route.
- **Role-based access control** on every protected endpoint (`requireRole`).
- **helmet** security headers, **CORS** restricted to configured origins.
- **Rate limiting** globally and tighter on login.
- Input **validation** with `zod` on all write endpoints.
- Parameterised SQL everywhere (no string-built queries) → guards against SQL injection.
- **Audit log** of sensitive actions (approvals, role changes, settings updates).

## 8. Before production (your team's checklist)

- [ ] Replace `JWT_SECRET` with a long random secret; rotate periodically.
- [ ] Put the API behind HTTPS (same domain as the site, e.g. `/api`).
- [ ] Use a managed PostgreSQL with backups; set `PGSSL=true`.
- [ ] Add real SMS/email (e.g. for any verification or notifications you introduce).
- [ ] Implement PMEC monthly file import (endpoint + parser) to populate `contributions`.
- [ ] Add refresh tokens / session revocation if longer sessions are needed.
- [ ] Add automated tests and CI.
- [ ] Independent security review / penetration test before real member data.
- [ ] Confirm compliance with the Data Protection Act, 2021 (data retention, subject-access).

## 9. Connecting the front-end

Point the website's portal calls at this API base (e.g. `https://www.pusewu.org.zm/api`).
In this integrated platform the front-end is already wired to this API: it calls
these endpoints over `fetch`, stores the returned JWT, and sends it as
`Authorization: Bearer <token>`. The API also serves the front-end from the same
origin (see the top-level `README.md`), so no separate hosting or CORS setup is
needed for them to work together.
