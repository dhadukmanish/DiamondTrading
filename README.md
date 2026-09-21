# Diamond / Jewellery ERP

Monorepo: `apps/api` (Fastify + Drizzle + PostgreSQL), `apps/web` (React + Vite + Tailwind), `packages/shared` (Zod schemas & types shared by both).

## Setup
```bash
pnpm install
docker compose up -d            # postgres on :5432
cp .env.example apps/api/.env
pnpm db:push                    # create tables
pnpm db:seed                    # tenant, admin user, system masters
pnpm dev                        # api :4000, web :5173
```
Login: `admin@example.com` / `admin123`

## Layout
```
apps/api/src
  config/      env
  db/          drizzle client, schema (one file per domain), seed
  plugins/     fastify plugins (auth, error handler)
  lib/         shared helpers (errors, list query, crud factory)
  modules/     one folder per feature: routes -> service -> repository
apps/web/src
  api/         typed client + react-query hooks
  components/  ui primitives, DataTable, forms
  layouts/     AppShell (sidebar, topbar, firm switcher)
  pages/       route pages
packages/shared/src
  schemas/     zod schemas (single source of truth for validation + types)
  permissions.ts
```

## Conventions
- Every table: `id uuid pk`, `tenant_id`, `created_at`, `updated_at`; documents also `created_by`.
- Routes only parse/validate (Zod from shared) and call a service; services hold rules; repositories hold SQL.
- All list endpoints accept `?page&pageSize&search&sort&filters=` (see `lib/list-query.ts`).

## Milestones
1. ✅ Foundation — auth/JWT, firms & branches (default rules, per-user firm access), users/roles/permissions, masters (currencies, units, tax rates, categories, payment terms, sales persons, locations), document series (FY label, regulated/unregulated, row-locked allocation), custom fields + options, audit table.
2. ✅ Contacts (full form: tax, billing, multiple shipping, bank, persons, other; serial counter; `/contacts/search` for dropdowns), Chart of Accounts (system accounts seeded with `system_key` for posting rules; sub-type validation; group/parent), Products & sub-products (auto serial + SKU, service vs goods, purchase/sales accounts, `/products/search` for transaction lines).
3. ✅ Accounting engine — `lib/ledger`: `postJournal` (balanced, system-key accounts), `stockIn`/`stockOut` (FIFO lots + consumptions, negative stock costed at last rate), `unpostStock` (delete guard when lots consumed), `stockLevels`. Documents: Stock Adjustment (gain/loss journal), Stock Transfer F/B (cross-branch/firm at FIFO cost), Product Transfer (conversion). Stock View (summary cards, levels, Product History, FIFO Tracking), Branch Wise Stock, Chart of Accounts live balances, Journal section on every document.
4. ✅ Purchase cycle — `packages/shared/calc.ts` (line/discount/tax inclusive-exclusive, TDS/TCS, round-off, GST split, amount in words), `lib/party-doc.ts` (line resolution, interstate detection from firm vs contact state). Purchase Order (open → partial → billed via bill links, PO Committed), PO Return (stock out at FIFO, AP Dr, variance), Purchase Bill (stock in net of discount, Input CGST/SGST or IGST, shipping, TDS/TCS, due date from terms, paid/partial/overdue), Debit Note (bill-linked, "only correction in amount", line account), Vendor Payments (payment / advance / refund / debit-note payment; allocations with write-off, discount, TDS; advance FIFO netting; delete guards). Web: one `PartyDocForm` + `PartyDocDetail` drive all four documents; `LineGrid` with expand row + Bulk Action; `SummaryPanel`; `PartySelect` with inline "Create New Vendor".
5. ✅ Sales cycle — Estimate; Sales Order as **memo** (open orders commit stock → SO Committed / Saleable / Outstanding Memo; Return Stock screen with return + loss, loss posts Stock Adjustment Loss; cancel); Invoice (from open SO lines or direct; stock OUT at FIFO → COGS Dr / Inventory Cr; AR Dr, Sales Cr, Output GST, TCS payable / TDS receivable, round-off; SO rolls open → partial → closed; follow-ups with outcome/channel/next date); Credit Note (invoice-linked, stock back at original cost, amount-only); Customer Payments / receipts on the shared `lib/payments-engine.ts` (payment / advance / refund / credit-note refund, discount allowed, bad debts, TDS receivable, advance netting); `/contacts/:id/summary` (receivables, payables, memo, unpaid count) for the customer drawer.
6. ⏳ Jewellery, Lab, Certified Products, Reports, Settings, Dashboard.

