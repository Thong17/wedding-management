# Clients, users, roles and trials — plan

Status: steps 1 (backend) and 2 (roles, event Team tab, permission-aware screens) built; steps 3–4 not yet. Decisions below were made with the product owner on 2026-11-02.

## Backend API (step 1)

All rules live in `backend/events/access.py`. Hidden events answer 404; a locked login gets
403 `{"code": "account_locked", "reason": "suspended" | "trial_ended"}` everywhere except `GET /api/auth/me/`
and `POST /api/gifts/sync/`.

| Endpoint | Who |
|---|---|
| `GET/PATCH /api/auth/me/` — adds `user_type`, `client`, `lock_reason`, `access_ends_at` | everyone |
| `POST /api/auth/password/` `{current_password, new_password}` | everyone |
| `GET /api/permissions/` — permission codes and labels | everyone |
| `/api/events/` — each event has `client`, `full_access`, `permissions` (codes), `role` (compat) | by visibility |
| `/api/events/{id}/assignments/` (+ `/{assignment_id}/` PATCH `role_id` / DELETE) | full access |
| `/api/events/{id}/members/` — old Managers tab, now backed by assignments with the Default role | full access |
| `/api/clients/` (+ `?status=`, `?search=`) | platform admin; client admin reads own |
| `/api/clients/{id}/documents/` (+ `/{doc}/download/`) — multipart upload, PDF/JPEG/PNG/WebP ≤ 10 MB | platform admin; client admin reads own |
| `/api/users/` (+ `?client=`/`none`, `?type=`, `?active=`, `?search=`, `/{id}/reset-password/`) | platform admin; client admin: own client's customers |
| `/api/roles/` (+ `?client=global` / `{id}`) — `usage_count`, `editable`, `updated_by_username` | platform admin; client admin: global (read) + own |

## People

Think of a Cambodian wedding: the **client** is a wedding service business (planner, banquet hall, decorator)
that offers the gift desk as a service; its **customers** are the families hosting each wedding, whose relatives
sit at the gift (ចំណងដៃ) table and record gifts themselves.

| Type | Belongs to | Events | Manages |
|---|---|---|---|
| **Platform admin** | — | All; creates events for any client or standalone | Everything |
| **Client admin** (several per client, equal rights) | One client (the wedding business) | All of their client's; can create them | Their client's customers and roles |
| **Customer** (an individual user login) | A client, or standalone | **Only events they are assigned to** (by their client admin or the platform admin) | — |

- Customers cannot create events or add other logins. **The client creates every login** — e.g. one for the
  bride's side and one for the groom's side of the same wedding — and assigns each to that wedding.
- Standalone customers (no client) are created and assigned by the platform admin.

## Clients

A client is a business customer, managed separately from logins.

- **Business:** business name, contact person, phone, email, address.
- **Subscription:** price, currency, billing period (monthly / yearly / per event), start date, status
  (Trial → Active, or Suspended), trial end date. Payments are tracked outside the app for now.
- **Documents:** uploaded files (e.g. business license, ID card, signed contract), each with a type,
  document number, issue date, expiry date and notes. Expired or soon-to-expire documents show a warning.
- Client admins can **view** their own business info, subscription and documents, but only the platform admin edits them.

Documents are sensitive: they are served only through an authenticated endpoint (platform admin, or that
client's admins), never from the public `/media/` path, and never cached by the service worker.

## Roles and permissions

A role is a named set of permissions. Assigning someone to an event means choosing their role for that event;
a person can have different roles on different events.

| Permission | Allows |
|---|---|
| Gift desk | Record gifts at the desk (works offline) |
| Edit & void gifts | Correct or void gifts already on the server |
| Add guests | Add guests |
| Edit guests | Edit existing guests |
| Delete guests | Remove guests |
| Import guests | Upload a guest CSV |
| Export guests | Excel export and the printable QR sheet |
| View report | Totals, breakdowns, report CSV |

- **Global roles:** created by the platform admin and usable by every client. The built-in **Default** role is
  Gift desk + Add, Edit, Delete and Import guests. Clients decide per role whether customers also get
  View report and Export guests (e.g. so a family can keep its own record of who gave what).
- **Client roles:** created by a client admin, visible only inside that client.
- The **platform admin can view, create, edit and delete every client's roles** (to fix mistakes).
  Client admins can only use global roles, and fully manage their own.
- Each role records who last edited it and when.
- Editing a role applies to everyone assigned with it. A role in use cannot be deleted until those people are moved.
- Client admins and the platform admin always have every permission on their events, plus the event-level actions
  roles don't cover: edit/delete the event, assign people, manage roles.
- Every permission is enforced by the server. The UI hides what a role doesn't allow, and each device stores the
  user's role per event so the offline gift desk knows the rules.

### Assigning people to events

| Who assigns | Can assign |
|---|---|
| Platform admin | Any customer (including standalone), to any event |
| Client admin | Only their own client's customers, to their own client's events |

## Trials and lockout

- Clients have a trial end date and status; default trial length 14 days.
- **Customers of a client have no access end date of their own:** they keep access until the client deactivates
  them, and are locked only when their client is (suspended or past its trial).
- Standalone customers have their own trial date, set by the platform admin.
- A login is locked when its client is suspended or past its trial, or (standalone only) when its own date has
  passed. The platform admin is never locked.
- **Locked means:** sign-in shows only a lock screen; gifts already saved on the device still upload (the server
  accepts gift sync from locked accounts and refuses everything else). An offline device keeps working until it
  reconnects. Extending the trial or activating unlocks immediately.
- Status is computed from dates when checked, so expiry happens on time without a scheduled job.
- "Trial ends in N days" banners appear before expiry.

## Navigation

Customers keep the current top bar. Platform admins and client admins get a left sidebar (a menu button on phones):

| Platform admin | Client admin |
|---|---|
| Events | Events |
| Clients | Customers |
| Users | Roles |
| Roles | Business profile |
| Sync center | Sync center |

## Pages

1. **Clients** (platform admin): list with search and filters (status, trial ending soon, subscription). Each client
   has tabs: Business, Subscription, Documents, Users, Roles, Events.
2. **Users** (platform admin): every login (client admins, customers, standalone customers), filterable by
   client and type; create, reset password, deactivate, set a standalone customer's trial date.
3. **Roles** (platform admin: global and all clients; client admin: their own): permission checkboxes, usage count,
   last edited by.
4. **Customers** (client admin): their customer logins — create (e.g. "Sokha & Dara wedding — bride's side"),
   deactivate, reset password, and see which wedding and role each login is assigned to.
5. **Business profile** (client admin): read-only business info, subscription and documents.
6. **Event → Team tab** (replaces Managers): assign people with a role.
7. **Profile:** add Change password.
8. **Lock screen** and trial banners.

## Existing data migration

- All current data goes into one client, **"Existing data"**, set to **Active** so nobody is locked out.
- Event creators become its client admins; everyone else becomes its customers, assigned to their current
  events with the **Default** role.
- The Django superuser becomes the platform admin.

## Build order (one commit each, with tests)

1. **Backend:** models (client, documents, roles, assignments, user type, standalone trial field), the existing-data
   migration, permission checks on every endpoint, lockout with the gift-upload exception, protected document
   downloads, tests.
2. **Roles and event Team tab**, permission-aware screens, per-event role stored on the device for offline use.
3. **Sidebar, Clients and Users pages, Customers, Business profile**, Change password.
4. **Lock screen and banners**, plus an end-to-end check that the offline gift desk still behaves correctly.
