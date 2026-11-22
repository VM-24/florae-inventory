# Florae Inventory

Restaurant inventory CRUD (items + categories). Derived from `../florae`, but with only the inventory domain.
See README.md for setup, field mapping and API.

## Layout

```
src/
  index.ts            entry: env check, admin bootstrap, listen
  app.ts              express app (createApp — used by tests too)
  config.ts           CURRENCY='PLN', JWT secret, uploads dir
  http/errors.ts      HttpError, asyncHandler, central errorHandler (Zod/Prisma → HTTP)
  auth/               JWT middleware (+ forced password change gate), login/me/users routes, users.ts (owner bootstrap, user management)
  items/              schemas (zod) · repository (prisma + audit in one tx) · routes · serialize · money
                      Item = catalog; MonthlyCount = one month of counts per item (month = 1st day)
  categories/routes.ts
  audit/audit.ts      diff() + writeAudit() — append-only log, changed fields only
  storage/files.ts    photo files under UPLOADS_DIR, served at /uploads; rows in item_photos (first = cover)
prisma/schema.prisma, prisma/seed.ts (LOUE warehouse sheets: category = warehouse, upsert by sku, idempotent)
prisma/seed-frou-frou.ts  earlier restaurant sheet (not the default: npm run db:seed:frou-frou)
web/                  Vite + React 18 + antd 6; pages: Inventory, ItemPage, Categories, Login
  src/features.ts     FULL_MODE flag (VITE_INVENTORY_MODE=full); default is the simple mode
  src/pages/simple/   simple mode: Артикул, Фото, Наименование, Категория, Количество
  src/pages/          full mode pages (Inventory, ItemPage) — kept, used when FULL_MODE
test/                 vitest; route tests mock src/items/repository
```

## Rules

- Two UI modes, one backend. Do not delete full-mode pages or DB columns: the user plans to return to them.
  Simple-mode "Количество" = `MonthlyCount.currentQty` of the month chosen in the MonthPicker (?month=YYYY-MM);
  when that month has none, the latest earlier count is shown greyed with "*".
  A new feature that touches items should work in both modes, or be gated by `FULL_MODE`.
- Money: `Decimal(12,2)` in DB, `lineTotal()` (grosze) for sums. Never add floats for totals.
- Sums (`brokenSum`, `shortageSum`, `currentValue`) are derived in `serializeCount` — never stored.
- Months travel as `YYYY-MM` in the API (`monthKey` schema) and are stored as the first day of the month.
- Every mutation writes `AuditLog` inside the same `prisma.$transaction`.
- Roles: OWNER ⊃ ADMIN ⊃ STAFF. Catalog routes use `requireAdmin` (ADMIN or OWNER), user management `requireOwner`; monthly counts (PUT) and photos are open to STAFF.
- Users: never return `passwordHash`; issued/reset passwords are returned once and set `mustChangePassword` (API locked until changed). Keep the self-lockout and last-owner guards in `updateUser`.
- Hard delete only for archived items (409 otherwise).
- UI language is Russian; code and comments are English.

## Verify

```bash
npm test && npm run typecheck && npm --prefix web run build
```
