# Deploying PUSEWU live on Render

This takes the integrated platform from this repo to a live, always-on site with a
managed PostgreSQL database — for about **$13/month** (≈$7 web service + ≈$6
database). You pay Render with a Visa card. Everything below is done in a browser;
you don't need to run anything on your own machine except pushing the code to
GitHub once.

The repo already contains a **`render.yaml` Blueprint** that tells Render to create
both the web service and the database and wire them together, so most of this is
clicking **Apply**.

---

## What you'll end up with

- A live URL like `https://pusewu.onrender.com` that serves the **website**, the
  **member/role portal**, and the **API** — all from one place.
- A managed **PostgreSQL** database with automated backups.
- One **System Administrator** login to set everything up. No demo data.
- Later: your own domain `www.pusewu.org.zm` pointed at it.

---

## Step 1 — Put the code on GitHub

Render deploys from a Git repository, so the platform needs to live in one.

1. Create a free account at **github.com** if you don't have one.
2. Create a new **private** repository, e.g. `pusewu-platform`.
3. Upload the contents of this `pusewu-platform` folder to that repository. The
   simplest way, if you don't use Git on the command line: on the new repo page
   click **uploading an existing file**, then drag in the folders (`backend`,
   `frontend`) and files (`render.yaml`, `docker-compose.yml`, `README.md`,
   `DEPLOY_RENDER.md`). Commit.

   The `render.yaml` file must sit at the **top level** of the repository (not
   inside a subfolder), which is where it already is in this package.

## Step 2 — Create a Render account

1. Go to **render.com** and sign up (you can sign in with your GitHub account,
   which also makes the next step easier).
2. Add your **Visa card** under Billing. The free tier needs no card, but the
   always-on plans in this guide do.

## Step 3 — Deploy the Blueprint

1. In the Render dashboard, click **New ➜ Blueprint**.
2. **Connect** the GitHub repository you created in Step 1. Render will scan it and
   find `render.yaml`, then show you what it will create: a web service named
   **pusewu** and a database named **pusewu-db**.
3. Before clicking Apply, set the one secret value it asks you for:
   **`ADMIN_PASSWORD`** — type a strong password here. This becomes your first
   administrator login. (If you leave it blank, Render generates one and you'll
   read it from the logs once — setting it yourself is easier.)
4. Click **Apply**. Render now builds the Docker image, provisions the database,
   runs the schema migration and creates the admin account, then starts the
   service. The first build takes a few minutes.

## Step 4 — First login

1. When the **pusewu** service shows **Live**, click its URL
   (`https://pusewu.onrender.com` or similar) — the PUSEWU website loads.
2. Go to **Member Login** and sign in with:
   - Email: `admin@pusewu.org.zm` (or whatever you set for `ADMIN_EMAIL`)
   - Password: the `ADMIN_PASSWORD` you entered.
3. You're in as the System Administrator. Now set the platform up for real:
   - **Users & Roles** ➜ create the union's Finance Officer, Membership
     Officer(s), Branch Representative(s), and Executive accounts.
   - Sign in as the **Finance Officer** ➜ **Deduction Settings** ➜ set the % of
     basic pay and the retirement split. Until this is set, members correctly see
     "pending configuration".
   - Members can now **apply** from the homepage or `/app/apply.html`, and your
     Membership Officer approves them.

## Step 5 — Point your own domain at it (optional, recommended)

1. In the Render dashboard, open the **pusewu** service ➜ **Settings ➜ Custom
   Domains** ➜ add `www.pusewu.org.zm` (and `pusewu.org.zm` if you want the bare
   domain). Render shows you a DNS record to add.
2. At your **ZICTA registrar** (where you manage `pusewu.org.zm`), add the DNS
   record Render gave you (a CNAME for `www`). Save.
3. Wait for it to verify (minutes to a few hours). Render issues a free HTTPS
   certificate automatically.
4. **Important:** once the custom domain works, update the **`CORS_ORIGIN`**
   environment variable on the pusewu service to your real address, e.g.
   `https://www.pusewu.org.zm`, then click **Manual Deploy ➜ Deploy latest commit**
   (or just Save — it redeploys). This keeps the security setting aligned with the
   live address.

---

## Costs (confirm current prices on Render's site)

| Item                         | Plan          | Approx / month |
|------------------------------|---------------|----------------|
| Web service (API + frontend) | Starter       | ~$7            |
| PostgreSQL (with backups)    | basic-256mb   | ~$6            |
| **Total**                    |               | **~$13**       |

You can scale either up later without changing the code. If you ever want to trim
cost during the review phase only, you can start the web service on the **Free**
plan (it sleeps after 15 minutes idle and wakes in ~30–50 seconds) — but for real
members, keep it on Starter so it's always instant.

Prices change; check the figure shown in the Render dashboard before you Apply.

---

## Updating the site later

Any time you (or a developer) change the code, push the change to the GitHub repo.
Render notices and redeploys automatically. The schema migration and admin-seed run
again safely on each deploy — the migration only adds what's missing, and the
existing admin account is left untouched.

## A note on backups and go-live

Render's managed Postgres includes automated backups on paid plans — good. Before
real member data goes in, confirm in the database's dashboard that backups are on,
and do a test export. This is the one piece that matters most for a union holding
members' records.

---
*Public Service Workers Union (PUSEWU) · Workers First*
