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
From the command line: `npm run user:create -- <login> <password> [OWNER|ADMIN|STAFF] [name]`.

## Users and roles

| Role | Can |
|------|-----|
| **OWNER** (Владелец, "главный админ") | everything ADMIN can, plus managing users |
| **ADMIN** (Администратор) | catalog: create/edit items, prices, categories, archive and delete |
| **STAFF** (Сотрудник) | view everything, enter counts, add photos |

As in florae:
- The owner creates a user and the server generates the start password, which is shown once.
- The user must change it on first login. Until then the API answers 403 `MUST_CHANGE_PASSWORD`
  to everything except `/me`.
- The owner can rename users, change their role, block and unblock them, and reset passwords
  (again shown once, again a forced change).
- A blocked user loses access right away, because the role and active flag are re-read on
  every request.
- Guards: nobody can block themselves or change their own role, and at least one active owner
  must remain.
- Every user can change their own password ("Сменить пароль" in the sidebar).

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
- **Role-based permissions.** `STAFF` can enter monthly counts and photos. `ADMIN` also
  manages the catalog, prices, categories, archive and delete, and can remove a month's
  count. `OWNER` also manages users. The server enforces this, not just the UI.
- **Fast count entry.** "Режим пересчёта" on the list turns the count columns into inputs
  that save on blur into the selected month.
- **CSV export** of the selected month, in Excel-friendly format (`;`, UTF-8 BOM, decimal comma).

## API (all under `/api`, JWT `Authorization: Bearer`)

| Method | Path                     | Who   |                                         |
|--------|--------------------------|-------|-----------------------------------------|
| POST   | `/login`                 | —     | `{ login, password }` → `{ token }`     |
| GET    | `/me`                    | any   | includes `mustChangePassword`           |
| POST   | `/me/password`           | any   | `{ current, next }` (≥ 8 chars)         |
| GET    | `/users`                 | owner |                                         |
| POST   | `/users`                 | owner | `{ login, name, role }` → user + one-time `password` |
| PATCH  | `/users/:id`             | owner | `{ name?, role?, active? }`; 409 on self-lockout / last owner |
| POST   | `/users/:id/reset-password` | owner | → one-time `password`               |
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
