# Florae · Инвентарь

CRUD panel for restaurant inventory: cutlery, tableware, bar and wine glassware, equipment.
It is built on the [florae](../florae) stack (Express + Prisma/PostgreSQL + JWT, Vite + React + antd), with
the bots, orders and chats removed. It replaces the paper/PDF count sheet. Currency is **PLN**.

## Quick start

```bash
npm install
cp .env.example .env              # set DATABASE_URL, JWT_SECRET, ADMIN_PASSWORD
docker compose -f docker-compose.dev.yml up -d   # or use any local PostgreSQL
npm run db:migrate                # apply migrations
npm run db:seed                   # load the "LOUE (Christmas)" stock sheet (12 items)
npm run web:build                 # build the panel into web/dist
npm run dev                       # http://localhost:3000, log in as ADMIN_LOGIN / ADMIN_PASSWORD
```

Frontend with hot reload: `npm run web:dev` (Vite on :5173 proxies `/api` and `/uploads`
to the backend; set `BACKEND_PORT` if the backend is not on 3000).

The first start creates the owner `ADMIN_LOGIN` with password `ADMIN_PASSWORD`, who must change
it on first login. After that the owner manages users in the panel (**Пользователи**).
From the command line: `npm run user:create -- <login> <password> [role name | OWNER|ADMIN|STAFF] [name]`.

## Installable app (PWA)

The panel is a PWA (`vite-plugin-pwa`, config in `web/vite.config.ts`):
- **Install:** "Add to Home Screen" on iPhone/Android, or the install icon in Chrome/Edge's
  address bar. It then opens full screen with its own icon.
- **Cache:** only the app shell is precached. `/api` is always network-only, so stock figures
  are never stale. Photo files (`/uploads`, immutable UUID names) are cached on the device.
- **Updates:** a new deploy shows "Доступна новая версия → Обновить". There is no silent reload,
  so an open count is not interrupted. Installed apps check for updates every hour.
- **Requirements:** browsers enable the service worker only over HTTPS (or on `localhost`).
- **Icons:** `web/public/pwa-*.png`, `apple-touch-icon.png` and `favicon-32x32.png`, taken from florae.

## Users, roles and permissions

A **role** is a named set of **permissions**. The permission catalog lives in code
(`src/auth/permissions.ts`), because a permission that no code checks would be a fake checkbox.
The owner builds roles from the catalog in **Пользователи и роли → Роли и права**: create a role,
tick its permissions, rename it, delete it (only when nobody uses it).

| Permission | Allows |
|------------|--------|
| `inventory.view` | see the inventory and each item's change history |
| `inventory.count` | enter quantities. Works on its own: the list and item cards become read-only, and history, photos and catalog stay closed. A "count-only" role is just this one permission |
| `inventory.photos` | add and delete photos |
| `items.create` | create items |
| `items.edit_sku` | change the sku (артикул) |
| `items.edit_name` | change the name |
| `items.edit_description` | change the description |
| `items.edit_category` | change the category |
| `items.edit_unit` | change the unit of measure |
| `items.edit_price` | change the price (full mode) |
| `items.edit_opening` | change the opening qty (full mode) |
| `items.archive` | archive and restore items |
| `items.delete` | delete archived items permanently |
| `counts.delete` | delete a month's count (full mode) |
| `categories.manage` | create, rename and delete categories |
| `users.manage` | create and block users, change their role, reset passwords |
| `roles.manage` | create roles and set their permissions |
| `audit.view` | see the journal of all changes |

Preset roles are created on startup if missing:
- **Владелец** always has every permission, including ones added in future versions. It can't be
  edited or deleted.
- **Администратор** has everything except users and roles.
- **Сотрудник** can view, count and add photos.

How it works:
- **Server-side checks.** The server checks permissions on every request, field by field for
  `PATCH /items/:id` (see `ITEM_FIELD_PERMISSIONS`). The UI also hides what the role can't do,
  but the server is what enforces it.
- **Changes apply at once.** Role and permissions are re-read on every request, so editing a role
  or blocking a user takes effect immediately.
- **Users (as in florae).** The server generates the start password and shows it once. The user
  must change it on first login: until then the API answers 403 `MUST_CHANGE_PASSWORD` to
  everything except `/me`. Resetting a password works the same way.
- **Guards.** Nobody can block themselves or change their own role, and at least one active owner
  must remain.
- **Own password.** Anyone can change their own password ("Сменить пароль" in the sidebar).

### Change history

Every change writes an `AuditLog` row in the same transaction as the change: who, when, which
fields, before and after.
- **Item page:** "История изменений" shows a timeline with user (name and login), date and time,
  and "was → became" for each field. It's available in both UI modes.
- **Журнал** (`audit.view`): all changes to items, counts, photos, categories, users and roles,
  filterable by section and user, paged by "Показать ещё". Deleted objects keep their name in the
  journal.

## UI modes

The panel has two modes, chosen when it is built (`web/src/features.ts`):

| Mode | What the panel shows | Build |
|------|----------------------|-------|
| **simple** (default) | Артикул, Фото, Наименование, Категория, Количество; categories page | `npm run web:build` |
| **full** | Everything below: monthly counts with a month picker, opening qty, prices, shortage/write-off sums, CSV per month, change history | `VITE_INVENTORY_MODE=full npm run web:build` |

The backend and database are the same in both modes, so switching modes loses no data. In the
simple mode, "Количество" is stored as the **current month's count** (`MonthlyCount.currentQty`).
When the current month has none, the latest earlier count is shown. Monthly history therefore
keeps building up and is all there when the full mode is turned on.

## Data model

An **item** (`items`) holds what does not change month to month. A **monthly count**
(`monthly_counts`, one row per item per month) holds the columns that do. Every month is
kept, so any past month can be opened, compared and exported. The PDF sheet was loaded as
January 2026.

| PDF column                 | Where                          | Notes                                                    |
|----------------------------|--------------------------------|----------------------------------------------------------|
| Фото                       | `Item.photoUrl`                | Upload or take a photo from the phone; compressed in the browser |
| —                          | `Item.sku`                     | "Артикул": optional, unique, searchable                  |
| Наименование               | `Item.name`                    | Unique within a category                                 |
| (section header)           | `Item.category`                | Приборы, Посуда, Барная посуда, …, with a sort order; optional in the DB |
| Открытие                   | `Item.openingQty`              | Nullable: the sheet has blanks                           |
| Цена/ед, грн               | `Item.unitPrice`               | **PLN**, `Decimal(12,2)`                                 |
| —                          | `Item.unit`                    | шт / пара / компл. (e.g. "Спецовник: 16 пар")            |
| Текущий месяц на 11.01     | `MonthlyCount.currentQty`      | Per `month` (stored as the 1st day); null = not counted yet |
| Недостача                  | `MonthlyCount.shortageQty`     |                                                          |
| Списание (в листе «бой»)   | `MonthlyCount.brokenQty`       | The sheet only has "Сумма бой", so the quantity is a separate field |
| На конец месяца            | `MonthlyCount.endOfMonthQty`   | Nullable                                                 |
| —                          | `MonthlyCount.note`            | Free text ("+20 дозаказ в пути", "2 без ручки")          |
| Сумма списания / недостачи | derived                        | `qty × Item.unitPrice` (current price), in grosze, never stored |

## Practices taken from inventory systems

- **Catalog order = count order.** Categories have a `sortOrder`, so the list follows the
  physical walk-through ("shelf-to-sheet").
- **Breakage and shortage are tracked separately**, each with its own PLN total. They are
  different losses: one is avoidable handling, the other is theft or miscounting.
- **Archive first, delete deliberately.** Hard delete works only on archived items. Archived
  items keep their history and drop out of the totals.
- **Append-only change log.** Every create, update, archive, photo change and delete writes
  an `AuditLog` row in the same transaction. The row holds only the changed fields, before
  and after, and who made the change. You can see it on the item page.
- **Money as Decimal, totals in grosze.** No float drift in totals.
- **Counts per month, history kept.** The list has a month picker (← →, months with data
  are marked with a dot). The "Прошлый" column shows the previous counted month for comparison.
- **Permission-based roles.** Configurable roles built from a permission catalog, checked
  field by field on the server. See "Users, roles and permissions".
- **Fast count entry.** "Режим пересчёта" on the list turns the count columns into inputs
  that save on blur into the selected month.
- **CSV export** of the selected month, in Excel-friendly format (`;`, UTF-8 BOM, decimal comma).

## API (all under `/api`, JWT `Authorization: Bearer`)

| Method | Path                     | Who   |                                         |
|--------|--------------------------|-------|-----------------------------------------|
| POST   | `/login`                 | —     | `{ login, password }` → `{ token }`     |
| GET    | `/me`                    | any   | includes `mustChangePassword`           |
| POST   | `/me/password`           | any   | `{ current, next }` (≥ 8 chars)         |
| GET    | `/users`                 | users.manage |                                  |
| POST   | `/users`                 | users.manage | `{ login, name, roleId }` → user + one-time `password` |
| PATCH  | `/users/:id`             | users.manage | `{ name?, roleId?, active? }`; 409 on self-lockout / last owner |
| POST   | `/users/:id/reset-password` | users.manage | → one-time `password`        |
| GET    | `/roles`, `/permissions` | roles.manage or users.manage | roles with permissions; the catalog |
| POST/PATCH/DELETE | `/roles[/:id]` | roles.manage | owner role is read-only; 409 when deleting a role in use |
| GET    | `/audit?userId&entity&cursor` | audit.view | journal, 50 per page, `nextCursor` |
| GET    | `/categories`            | any   | with active `itemCount`                 |
| POST/PATCH/DELETE | `/categories[/:id]` | admin | DELETE → 409 if the category has items |
| GET    | `/months`                | any   | months that have counts, newest first   |
| GET    | `/items?month=YYYY-MM&categoryId&q&status=active\|archived\|all` | any | each item with `count` (that month) and `previous` |
| GET    | `/items/:id`, `/items/:id/history` | any | item with all `counts`, newest first |
| POST   | `/items`                 | admin | catalog fields only                     |
| PATCH  | `/items/:id`             | admin | catalog fields; `{ archived: true }` archives |
| DELETE | `/items/:id`             | admin | 409 unless archived                     |
| PUT    | `/items/:id/counts/:month` | any | upsert that month; only sent fields change |
| DELETE | `/items/:id/counts/:month` | admin |                                       |
| POST   | `/items/:id/photos`      | any   | multipart `photos` (≤ 10 files per request, ≤ 8 MB each, ≤ 20 per item); returns the gallery |
| DELETE | `/items/:id/photos/:photoId` | any |                                       |
| POST   | `/items/:id/photos/:photoId/cover` | any | make it the cover (first photo, shown in lists) |

Errors: `{ error }` with 400 (validation, prefixed with the field name), 403, 404, 409 (state conflict).

## Scripts

`npm run db:clear -- --yes` deletes all items, counts, categories and the change log, but keeps users.
`npm run db:seed:frou-frou` loads the earlier restaurant sheet (126 items, January 2026 counts).
`npm test` runs the vitest unit and route tests. `npm run typecheck` checks types.
`npm run build` compiles to `dist/`. `npm run db:studio` opens the Prisma GUI.

## Deploy

`docker compose up -d --build`. Migrations run on every container start. Mount a
persistent volume at `UPLOADS_DIR` for photos. `JWT_SECRET` is required in production.

## Next steps (not built)

- **Price snapshot per month:** sums use the item's current price, so changing a price
  also changes past months' totals. Storing the price in each monthly count would freeze them.
- **Closing a month** (lock edits to past months).
- **Par levels and reorder alerts** per item.
- **User management UI** (users are created with the CLI script for now).
