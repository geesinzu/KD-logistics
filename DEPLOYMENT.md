# Deploying to cPanel shared hosting

This app builds to two things: `dist/boot.mjs` (a fully self-contained
server bundle — no `node_modules` needed at runtime) and `dist/public/`
(the static PWA client). The GitHub Actions workflow in
`.github/workflows/deploy.yml` builds both on GitHub's runner and
`rsync`s them straight into your cPanel Node.js app's directory — the
shared host never runs `npm install` or a build.

## One-time cPanel setup

1. **Create the MySQL database** — cPanel → MySQL Databases. Create a
   database and a user, add the user to the database with all
   privileges. Note the full names (cPanel prefixes both with your
   account username, e.g. `cpaneluser_kdlogistics`).

2. **Create the Node.js app** — cPanel → Setup Node.js App → Create
   Application.
   - **Node.js version**: 20.x (match what the workflow builds with).
   - **Application mode**: Production. This matters — the server only
     starts listening `if (NODE_ENV === "production")`; in any other
     mode it loads and does nothing, with no error printed.
   - **Application root**: a folder *outside* `public_html`, e.g.
     `kd-logistics-app`.
   - **Application URL**: your domain or a subdomain.
   - **Application startup file**: `boot.mjs`.
   - Save — this generates the passenger config and gives you the
     command to activate the app's virtual environment if you need a
     shell later.

3. **Set environment variables** — in that same Node.js App screen,
   add:
   - `DATABASE_URL` — `mysql://cpaneluser_dbuser:PASSWORD@localhost:3306/cpaneluser_dbname`
   - `JWT_SECRET` — any long random string
   - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` —
     optional, only needed for push notifications (generate with
     `npx web-push generate-vapid-keys`)

   `NODE_ENV=production` is normally set automatically by choosing
   "Production" mode above; if your cPanel version doesn't do this,
   add it explicitly.

4. **Run the database migrations once** — this pipeline deliberately
   does *not* auto-run schema migrations on every push (an unattended
   `ALTER TABLE` on every deploy is more risk than it's worth). From a
   shell with `DATABASE_URL` set (cPanel's Node.js app screen gives you
   a command to enter its virtual environment), run:
   ```
   npx drizzle-kit push
   ```
   Re-run this manually whenever `db/schema.ts` changes.

5. **Add a deploy key for GitHub Actions** — cPanel → SSH Access →
   Manage SSH Keys → Generate a new key (or import one you generate
   locally with `ssh-keygen -t ed25519 -C "github-actions"`), then
   **Authorize** the public key. Keep the private key for step 6.

## GitHub repo secrets

Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | Your server hostname or IP |
| `DEPLOY_PORT` | Your host's SSH port (often *not* 22 on shared cPanel — check Security → SSH Access in cPanel) |
| `DEPLOY_USER` | Your cPanel username |
| `DEPLOY_SSH_KEY` | The private key from step 5, full contents |
| `DEPLOY_PATH` | Absolute path to the app root, e.g. `/home/cpaneluser/kd-logistics-app` |

Also add one repo **variable** (Settings → Secrets and variables →
Actions → **Variables** tab, not Secrets — it's not sensitive):

| Variable | Value |
|---|---|
| `APP_URL` | Your live app URL, e.g. `https://kedi-logistics.com` |

This powers the workflow's smoke test (see below). Until it's set, that
step is skipped rather than failing the deploy.

Notes:
- `DATABASE_URL`/`JWT_SECRET`/`VAPID_*` are **not** GitHub secrets —
  they live only in cPanel's Node.js App environment-variables screen,
  since they're read by the server at runtime, not baked in at build
  time. The frontend build doesn't need any secrets either — nothing
  in `src/` reads a `VITE_*` env var.

## How a deploy works

1. Push to `main` (or run the workflow manually from the Actions tab).
2. GitHub Actions checks out the repo, runs `npm ci` and `npm run
   build` on its own runner.
3. It stamps a fresh `dist/tmp/restart.txt` and a minimal
   `dist/package.json`, then `rsync`s the whole `dist/` folder over
   SSH into `DEPLOY_PATH`.
4. Passenger (which powers cPanel's Node.js Selector) detects the
   changed `tmp/restart.txt` and reloads the app on the next request —
   no separate restart step needed.
5. If `APP_URL` is set, the workflow then polls
   `{APP_URL}/api/trpc/health` (an existing endpoint that checks DB
   connectivity) for up to ~30 seconds and fails the job if the app
   never comes back up — so a green run actually means the site is
   live, not just that files were copied.

## First deploy checklist

- Confirm the Node.js app shows "Production" mode and lists your env
  vars before the first deploy.
- After the first successful workflow run, visit the app URL — you
  should get the login page. If you get a blank page or 503, check
  cPanel's Node.js app logs (there's a link on the same setup screen).
- If `rsync`/SSH connection fails, double check `DEPLOY_PORT` — cPanel
  hosts frequently run SSH on something other than 22.
