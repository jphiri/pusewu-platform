# PUSEWU Digital Platform — Integrated System

The complete PUSEWU platform in one package: the public website, the member/role
portal, the REST API, and the PostgreSQL database — wired together and ready for
your review and deployment.

```
pusewu-platform/
├── frontend/            Website + portal (static: HTML, CSS, JS)
│   ├── index.html       Public homepage
│   ├── app/             Portal (login, apply, member + all role pages)
│   ├── css/  js/  img/
│   └── 404.html, robots.txt, sitemap.xml, site.webmanifest, .htaccess
├── backend/             REST API (Node.js + Express + PostgreSQL)
│   ├── src/             app, routes, middleware, db, utils
│   ├── migrations/      PostgreSQL schema
│   ├── scripts/         migrate.js, seed.js (initial admin only)
│   ├── Dockerfile       Builds API image incl. the frontend it serves
│   └── package.json
└── docker-compose.yml   Database + API (which serves the frontend) — one command
```

The API also **serves the frontend from the same origin**, so there are no
cross-origin issues: visiting the server root loads the website, `/app/...` loads
the portal, and `/api/...` is the API. This is the whole system running as one.

---

## What "connected" means here

- The **frontend** no longer uses any in-browser demo data. Every portal screen
  calls the **API** over `fetch`, sending a JWT it receives at login.
- The **API** reads and writes the **PostgreSQL** database for every operation.
- There is **no demo data and no demonstration mode.** The database starts empty
  except for **one System Administrator account** you use to set everything up.
- The percentage deduction, retirement split, six roles, typed-name signing and
  role permissions all operate on real data end-to-end.

You said you'll do the final review and go-live. This package is built to run
correctly and to be deployed by you; it does not put anything on the public
internet by itself.

---

## Run it for review (one command)

Requires Docker Desktop.

```bash
cd pusewu-platform
# Recommended: set real secrets first (see below). For a quick local review:
docker compose up --build
```

This starts PostgreSQL, applies the schema, creates the initial administrator,
and starts the API+frontend on **http://localhost:4000**.

Open **http://localhost:4000** — the website loads. Click **Member Login** and
sign in as the administrator (printed in the API logs on first run, or set via
env vars below). From there:

1. **Administrator** → *Users & Roles*: create your Finance Officer, Membership
   Officers, Branch Representatives, and Executive accounts.
2. **Finance Officer** → *Deduction Settings*: set the % of basic pay and the
   retirement split. Until this is set, members see "pending configuration".
3. Members **apply** at `/app/apply.html` (or from the homepage), signing by
   typing their full name in capitals.
4. **Membership Officer** → *Applications*: approve them; approval activates the
   member and their PMEC deduction.
5. Members log in to see their subscription, growing retirement savings, cases,
   loans, welfare and training.

To stop: `docker compose down` (add `-v` to also wipe the database volume).

## Configuration (set before real use)

Create a `.env` file next to `docker-compose.yml` (compose reads it automatically):

```env
# A long random secret — e.g. `openssl rand -hex 48`
JWT_SECRET=your_long_random_secret_here
# Strong DB password
PGPASSWORD=your_strong_db_password
# The public origin the site will be served from
CORS_ORIGIN=https://www.pusewu.org.zm
# Initial administrator (first run only) — change the password after logging in
ADMIN_EMAIL=admin@pusewu.org.zm
ADMIN_PASSWORD=set_a_strong_password_here
ADMIN_FIRST_NAME=System
ADMIN_SURNAME=Administrator
```

If `ADMIN_PASSWORD` is left blank, the seed generates a random one and prints it
once in the logs — copy it, log in, and change it immediately.

## Run without Docker (for developers)

Requires Node.js 20+ and PostgreSQL 14+.

```bash
cd backend
cp .env.example .env         # edit DATABASE_URL, JWT_SECRET, ADMIN_* , and set
                             # FRONTEND_DIR=../frontend so the API serves the site
npm install
npm run migrate
node scripts/seed.js         # creates the initial admin
npm start                    # http://localhost:4000 serves API + frontend
```

---

## Going live (your checklist)

This is the part you said you'd own. In outline:

1. **Domain & TLS** — point `www.pusewu.org.zm` at your host; terminate HTTPS at a
   reverse proxy (nginx/Caddy) or your platform's load balancer in front of the
   API on port 4000.
2. **Managed PostgreSQL** — use a managed database with automated backups; set
   `DATABASE_URL` and `PGSSL=true`.
3. **Secrets** — set a strong `JWT_SECRET` and DB password via your host's secret
   manager, not in files.
4. **Initial admin** — set `ADMIN_EMAIL`/`ADMIN_PASSWORD`; change the password at
   first login; then create the union's real staff accounts.
5. **Email** — set up the union mailboxes (info@, membership@, grievances@,
   generalsecretary@) as covered previously.
6. **PMEC import** — implement the monthly PMEC file import to populate the
   `contributions` table and drive paid/at-risk/lost status (endpoint stub point
   noted in the backend README).
7. **Security review** — independent review / penetration test before real member
   data; confirm Data Protection Act, 2021 handling (retention, subject access).
8. **Backups & monitoring** — database backups, uptime and error monitoring.

See `backend/README.md` for the full API reference and the endpoint-level detail.

---
*Public Service Workers Union (PUSEWU) · Workers First · Solidarity in Action, Empowered We Rise*
