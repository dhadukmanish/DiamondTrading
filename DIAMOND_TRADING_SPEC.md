# Diamond Trading / Jewellery ERP — Implementation Specification

Repository: https://github.com/dhadukmanish/DiamondTrading (monorepo). Reference system: Flomiz (devbilling.flomiz.com) — every screen below mirrors it; where this spec and the reference differ, this spec wins (differences are called out as **Decision**).

Status legend used throughout: ✅ implemented (milestones M1–M5), ⏳ pending. Section 19 lists what is done and what remains, with phases and acceptance criteria.

---

## 0. Goals, stack, conventions

- Full jewellery + diamond-trading ERP: multi-tenant → multi-firm → multi-branch → users with roles. Scope = everything in the reference.
- Lightweight, optimized, clean architecture (SOLID/DRY, layered routes → services → repositories). No stored balances: every ledger/stock figure derives from journal lines and stock movements.
- **Stack**: React 18 + Vite + TypeScript + Tailwind (web); Node 20 + Fastify 5 + TypeScript + Drizzle ORM (api); PostgreSQL 16 (UUID PKs); Zod (shared validation + types); JWT auth with roles/permissions; pnpm workspaces.
- **Repo layout**
  ```
  packages/shared/src      zod schemas (single source of truth), permissions, calc.ts (money math)
  apps/api/src             config/ db/(schema, seed) plugins/(auth, errors) lib/(crud, list-query, documents, ledger/, party-doc, payments-engine, counters) modules/<feature>/
  apps/web/src             api/(client, hooks, lookups, inventory) auth/ components/(ui, DataTable, MasterPage, form/, doc/) layouts/AppShell pages/<area>/
  deploy/, docker-compose.prod.yml, apps/*/Dockerfile, .github/workflows/deploy.yml
  ```
- **Conventions**: every table has `id uuid pk`, `tenant_id`, `created_at`, `updated_at`; documents also `firm_id, branch_id, series_id, number, doc_no, date, reference_no, notes, status, total_value, created_by`. Numeric money columns `numeric(18,4)`, rates `numeric(6,3)`. Routes only parse (Zod) and call services; services hold rules; all writes to a document + its journal + its stock movements happen in one DB transaction. All list endpoints accept `?page&pageSize&search&sort=-field&filters=[{field,op,value}]&firmId`.
- **URL structure** mirrors the reference: `/contacts`, `/jewellery/...`, `/accounting/...`, `/settings/...`, `/reports/...`.
- Dev: `pnpm install; docker compose up -d; cp .env.example apps/api/.env; pnpm db:push; pnpm db:seed; pnpm dev` → API :4000, web :5173 (proxy /api). Seed login `admin@example.com / admin123`.

---

## 1. Global / cross-cutting UI patterns

### 1.1 Shell ✅
- Login page (email/password). After login: left sidebar (white, 240px) with section headers **OVERVIEW** (Home, Contacts), **JEWELLERY** (Designs, Labour, Rate Template, Jewellery Products, Manufacturing, Material Recovery, Customer Metal, Vendor Material, Stock View ›), **ACCOUNTING** (Dashboard, Chart Of Accounts, Products & Inventory ›, Certified Products, Lab Issue / Return, Production ›, Purchase ›, Sales ›, Transactions ›, Banking, Reports). Active item: light-blue background, blue text. Bottom card "Need Help & Support?".
- Top bar: sidebar toggle, **firm switcher** dropdown (right), mail icon, notifications bell with badge count, settings gear, user avatar circle with name + tenant name. Dev banner "Development Environment" (red strip) in non-prod.
- Home dashboard: cards **User Information** (email, role, tenant/firm), **User Management** (link to users/roles/permissions), **Organizations** (firms & branches count).
- Visual: primary blue `#1A6BD1`, page bg `#F7F8FA`, cards white with 1px `#E5E7EB` border, Inter font, 14px base. Status badges: Draft orange, Open/Confirmed blue, Paid/Closed/Approved green, Overdue/Cancelled red, Partially orange.

### 1.2 DataTable (every list screen) ✅ (basic) / ⏳ (filter builder, customize columns, export/import)
- Search box (placeholder names the searchable fields, e.g. "Search by bill no, vendor, date, amount, status…"), **Filter** button (dropdown; active-filter count badge), **+ Add** (primary), report icon (bar-chart → opens related report), three-dot menu.
- Columns per module; sortable column headers (caret, column ⋮ menu); first column is a link to the detail view; bulk-select checkboxes; row actions (edit pencil, delete trash, view-journal, revert) — actions hidden when the row is locked (Closed/Paid/Billed → `-`).
- Pagination: "Rows per page" select (10/20/50/100), "Showing 1–10 of 20", page numbers with ‹ ›. Horizontal scrollbar for wide tables. Empty state with "Create first …" button.
- **Filter builder**: rows of field → operator (Contains, Equals, Not equals, Starts with, >, ≥, <, ≤, In, Between, Is null, Not null) → value; "Add filter", "Remove all", **Save** filter (per user per module, named), Cancel, Filter.
- **Three-dot menu**: Sort by (submenu of columns), Export (xlsx/csv), Import (wizard), Customize Columns; some modules add extras (Change Currency; Update Sale Price / Discount).
- **Customize Columns** modal: search, drag-reorder, checkboxes, first column locked, "N of M selected", Reset to Default, Save (per-user preference). Column count up to ~58 (custom fields included).
- Money cells: currency-wise display (`₹291.20`, `USD-1,250.00`, `د.إ`), negative red. Mobile numbers masked (`••••••2001`) with eye icon to reveal.

### 1.3 Import wizard (list-level) ⏳
4 steps Upload → Map Fields → Preview → Results. "Download Import Template". Supports .xlsx/.xls/.csv. Module-specific rules (match by SKU or name, auto-create, duplicate guards; custom-field columns matched by label).

### 1.4 Import Items from Excel (line-item level, inside any transaction form) ⏳
- 3 steps: Upload → Map Fields → Preview (no Results step; rows land in the grid). Download Template. .xlsx/.xls/.csv, **max 5000 rows**.
- Template sheet `Line Items` columns: `SKU / Product Code | Product Name | Sub Product Name | Quantity | Pcs | Rate | Description` (same for every document type; tax/discount/HSN come from product master).
- Rules (shown in "How it works" box): match by SKU/Product Code, Product Name, or Sub Product Name (≥1 required); SKU matches product **or** sub-product, parent wins on collision; case-insensitive, trims whitespace; lookup priority SKU → Product Name → Sub Product Name; Quantity/Rate/Description optional (blank → fill in form before save); Pcs optional, whole-number only (decimals round to nearest; blank = empty; **Certified/Jewellery items stay locked at 1 pc**); unmatched rows listed for review and skipped; if a product is **already on the document** its qty/pcs/rate/description are **updated** (blank cells keep existing), otherwise a new line is **added**.

### 1.5 Transaction form (shared base for all party documents) ✅
Layout: page title "New <Doc>"; card **<DOC> DETAILS**; card **LINE ITEMS**; two cards **Additional details** (left, 3/5) + **SUMMARY** (right, 2/5); sticky bottom bar with buttons.
- Header fields: **Firm\*** (default firm preselected, `Name (Default)`), **Branch\*** (firm-dependent, clearable; **hidden when the firm has ≤1 branch** and auto-set), **Series & Number\*** (searchable series dropdown showing `PREFIX-26/27-` + editable number + refresh icon; live `Preview: POK-26/27-22` on the right; number read-only for Regulated series), **Date\*** (default today; format per firm), party (**Vendor\***/**Customer\***, dropdown label `SerialNo-DisplayName` e.g. `81-CORI ZUCKERMAN`, searchable, sticky "+ Create New Vendor/Customer" opening the full contact form in a modal; **pencil icon** next to a selected party = quick-edit), Shipping Address (disabled "Select vendor first" until party selected; party's shipping addresses), Reference/Bill No, **Currency & Exchange Rate\*** (currency dropdown `INR - Indian Rupee` + rate input; rate locked to 1 when currency = firm base), Expected/Due date, Notes.
- Party selection prefills: contact-level default discount (Flat/%) onto every line, payment terms (→ due date = date + days; "Custom" → contact's custom due days), currency from branch default.
- **Scan SKU** bar: text input "Type or scan SKU (comma-separated for multiple)", + button, camera/barcode button. Each SKU adds a line (certified/jewellery → pcs 1).
- **Stock type filter** dropdown left of grid (label "All Products"; options All Products, General, Loose Diamond, Metal, Stone, Certified, Jewellery) — filters the product picker only.
- **Tax Type\*** dropdown right of grid header: Tax Exclusive (default) / Tax Inclusive.
- Line grid columns: expand caret | Sr No | **Product\*** (searchable; options show stock `Name (STOCK - 300)`; "+ Create New …") | **Sub Product\*** (variant; shows `(Stock: 123 | PCS: 0)`) | Pcs | **Qty\*** | **Rate\*** | Discount (Flat/% toggle + value) | **Tax\*** (tax rate dropdown incl. "Out of Scope") | Amount | delete. Expanded row: HSN/SAC (search), Unit, Description (+ **Account\*** on Debit/Credit Note). Totals row. Pcs locked at 1 and disabled for Certified/Jewellery variants; rate prefilled from purchase price (purchase docs) or selling price (sales docs).
- Grid actions: **+ Add New Item**, **Import from Excel**, **+ Create Product ▾** (Product / Certified Product / Jewellery Product / Jewellery Products (Multi) — each opens the full quick-add form in a modal; saved product auto-selects into the current line), **Bulk Action** (modal "Set one field on every line item": Field\* (Discount / Tax / Rate…), Value\* (Flat/% + value for discount; tax dropdown for tax); Cancel / Apply — applies to **all** lines), and on invoices **"N Open Sales Order(s)"** (on bills: open purchase orders) → picker modal of pending order lines (Order, Date, Product, Pending Qty, Rate; Add / Add all).
- Additional details: Internal Notes (not visible to client), Printable Notes (appears on printed document), Terms & Conditions (invoice), rich-text **Estimate Detail** (estimate), Attachments (drag & drop, any file up to 10 MB; uploads after save).
- Summary card: Subtotal; Shipping Charges (bill: type dropdown None/… + amount); **TDS | TCS** toggle + "Select rate…" dropdown + computed amount (TDS shown as `- 0.00` red); Adjustment (input); Round Off (read-only, sales docs); **GRAND TOTAL** bar (blue) `USD-0.00` with currency prefix.
- Buttons: Cancel, Save as Draft, **Save as Open** (primary split-button ▾ with more options: Save & New, Save & Print). PO Return: Save ▾ (Draft/Confirmed). Estimate/SO: Save ▾. Payment: Save as Draft / Save as Paid.
- Every master dropdown (customer, vendor, product, account, category, area, lab…) has inline "+ Create New …" quick-add.
- Top-right of sales forms: **customer insight card** "Vishal Barad's Details — ⚠ 1 Unpaid Invoice" (expandable) → **Customer Details drawer**: avatar, contact person, company, type badge; **Outstanding Receivables** (eye icon → breakup); **Outstanding Memo** (value of open SO pending qty); GST Details (treatment, Place of Supply `24-GUJARAT`); Billing Address; Contact Persons (name, designation, email, phone). Vendor forms show Outstanding Payables. Data from `GET /contacts/:id/summary` ✅ (drawer UI ⏳).

### 1.6 Document detail view (shared) ✅ (basic) / ⏳ (PDF templates, print/email/whatsapp, tabs)
- Master-detail: left list panel (back arrow, title, search, +; cards: party name, status badge, doc no, amount, date); right: doc number + STATUS badge; action buttons: Edit (pencil), **Print ▾**, **PDF ▾**, **XLS ▾** (dropdowns list templates), Email, **WhatsApp ▾**, **$ Record Payment** (bills/invoices; prefilled payment form), calendar (invoice follow-up), Attachments (paperclip), three-dot ⋮ (Cancel <doc> orange, Delete red; SO: Return Stock, Cancel Order, Delete; Certified: Purchase/Sale submenus).
- Tabs: **Details** (PDF preview) / **Activity Logs**; payments: **Overview / Payment Slip / Activity**; invoices add **Follow-ups**; sales orders **Preview / Return / Activity Logs**.
- PDF preview: firm block (name, address, phone), doc title in red caps, meta block (No, Date, PO Number/Order Number, Due Date, Place of Supply `Gujarat (24)`), party block ("VENDOR" / "BILL TO" + "SHIP TO" with address, phone), item table, tax summary (IGST 12% ₹31.20 / CGST+SGST), totals (Discounted Amount, Subtotal, tax, Grand Total, Paid Amount (−), Remaining Amount), amount in words italic, footer terms band ("Payment will be processed as per agreed terms."), **Authorized Signatory** line. Footer: `PDF Template: 'Classic Estimate' — Change` (switch template per document).
- Bottom **Journal entries** section: table Account | Debit | Credit with totals — from the document's auto-posted entry.
- Activity tab: "View Audit Trail ›" link + record activity list (created, status change, emailed, whatsapp sent, edited); empty: "No activity found for this record".
- Delete/Cancel rules: Cancel = status cancelled + reverse journal + release stock (record kept); Delete = remove document with its journal and movements, blocked when downstream references exist (payments, notes, consumed lots).

### 1.7 Document numbering ✅
`document_series`: tenant, firm (null = all firms), branch (null = firm-level counter; reference numbers restart per branch), doc_type, prefix (POK, PORK, PK/PP, DNK/DNP, VPK/VPP, EK/EP, SOK/SOP, SORK, IK/IP, CNK, CPK, AK/AP, STP, ITK/ITP, PIK…), separator `-`, use_financial_year (adds `26/27`, FY from firm's fy_start_month; Melee firm uses `PK-26` without FY and no separator before number → `PK-261`), next_number, padding, **series_type Regulated / Unregulated** (regulated: number fixed to counter; unregulated: user may override), is_default, is_active. Multiple series per doc type per firm. Allocation is row-locked inside the document transaction; preview endpoint is non-locking.

### 1.8 Accounting engine ✅
- `journal_entries` (firm, branch, date, source_type, source_id, doc_no, narration, status posted) + `journal_lines` (account, contact_id for party sub-ledger, variant_id, debit, credit, narration). Balanced check (|Dr−Cr| < 0.005). Accounts referenced by `system_key` (see §4). Deleting a document deletes its entry.
- `stock_movements` (branch, variant, date, direction in/out, qty, pcs, rate, value, source, contact, doc_no, note) + **FIFO** `stock_lots` (one per IN; qty_remaining/pcs_remaining/rate) + `stock_lot_consumptions`. OUT consumes oldest lots (row-locked); insufficient stock → remainder costed at last known IN rate (**negative stock allowed**, shown red; make configurable). Undo on delete: IN lots must be unconsumed (else 409 "Stock from this document has already been used by later transactions"); OUT consumptions are returned to their lots.
- `stockLevels()` → Total In/Out, Qty, Pcs, Value (Σ lot qty_remaining × rate), Avg Rate per variant/branch. SO Committed = Σ open/partial SO pending qty; PO Committed = Σ open/partial PO unbilled qty; Saleable = Qty − SO Committed.
- Approval/revert on transfers (Approved status; revert = delete with reversal).

### 1.9 Custom fields engine ✅ (definitions/options) / ⏳ (render in forms/lists)
`custom_fields` (module, key, label, type text/number/date/dropdown/multiselect/boolean/url, required, show_in_list, sort) + `custom_field_options` (**value stored, display_value shown**, sort) + `custom` JSONB on records. "Configure Options" inline from any dropdown (modal: Value | Display value rows, add/remove, Save whole list); rename/remove in Settings → Custom Fields. Diamond attributes (Shape, Clarity, Color, Cut…, Depth %, Table %) are custom fields of module `certified_products`.

### 1.10 Global masters ✅
Tenants; **Firms** (name, legal name, GSTIN, PAN, address, phone, email, state code, base currency, **date_format** DD-MM-YYYY / MM-DD-YYYY / YYYY-MM-DD, **fy_start_month**, gst_applicable, is_default) — firm switch changes date format, series set, branch visibility, currency; **Branches** (firm, name, code, address, state code, default currency, is_default) — seen: Royal Diamond (VESU, Adajan, Singapore), Melee Diamond Inc (New York); Users/Roles/Permissions (`<module>.<view|create|update|delete>`, `*` = all; per-user firm access; Administrator system role); Currencies AED/CAD/INR/USD (code, name, symbol, decimals); Tax rates GST 0/0.25/1.5/3/5/12/18/28 % (type gst) + Out of Scope, Exempt, Nil; Units PCS, CT (3 dp), G, KG, NOS; Categories (user-defined, hierarchical); Locations Country→State (code = GST state code)→City→Area (dependent dropdowns; Area disabled until City; "+" quick-add); **Payment terms** (Configure Payment Terms modal: Term Name | Number of Days | Mark as Default | delete; + Add New; Save list; special "Custom" option = manual days); Sales persons.

---

## 2. Contacts (`/contacts`) ✅

**List**: Contact (contact person / display name link + `#serial`), Company Name, Type badge (Customer / Vendor / Customer & Vendor / Broker), Email, Mobile (masked, eye reveals), Created At, Actions. Search name/email/mobile/GSTIN.

**Form** (page; the same component is the quick-add modal from any Vendor/Customer dropdown with Type preset; modal buttons Cancel/Save only; "Files will be uploaded after saving"):
- **TAX DETAIL**: GST Treatment\* (Registered Business – Regular / Composition, Unregistered Business, Consumer, Overseas, SEZ, Deemed Export), GSTIN, PAN.
- **CONTACT DETAIL**: Firm\* (default prefilled, clearable), Type\*, Display / Company\*, Primary Contact Person, Mobile (country-code selector, default +91), Email, **Serial No\*** (auto next number, editable).
- **BILLING ADDRESS**: Address (textarea), Country, State, City, Area (dependent; + add), Latitude/Longitude with **Map** (picker) and **Current** (geolocation) buttons, Pincode, Google Map URL (+ navigate icon).
- **SHIPPING ADDRESSES** (multiple; **Copy Billing**; **+ Add Address**): Address, Company Name, Mobile (+91), **GSTIN**, Country/State/City/Area, Pincode, Google Map URL; remove ×.
- **BANK DETAILS**: Bank Name, Account No, Branch, IFSC/Routing, SWIFT Code.
- **CONTACT PERSONS** (multiple; + Add Person): Name\*, Mobile (+91) with **Is WhatsApp Number** checkbox, Email, Designation, Notes.
- **OTHER DETAILS**: DOB, Sales Person, Reference (contact), **Broker** (contacts of type Broker), Discount (Flat/% + value → default on document lines), Payment Terms (list + Custom; Custom → custom due days), Credit Limit (currency + amount), Default TDS %, Default TCS %, **Default Rate Template** (jewellery), Price List, **Remark** (textarea), Attachments.
- Tables: `contacts` (billing + bank flattened), `contact_shipping_addresses`, `contact_persons`, attachments ⏳.
- APIs: CRUD, `GET /contacts/search?type=vendor|customer|broker|all&term=` → `{label:"81-CORI ZUCKERMAN", discountType, discountValue, paymentTermsId, customDueDays, gstTreatment, billStateId}`, `GET /contacts/next-serial`, `GET /contacts/:id/summary` (receivables, payables, memo, unpaid invoice count, GST, addresses).

---

## 3. Chart of Accounts (`/accounting/chart-of-accounts`) ✅

- List: Name (System badge = seeded, no edit/delete, "View" only), Type (Assets blue / Liabilities orange / Equity gray / Income green / Expenses red), Sub Type, Nature (Debit/Credit), Group (Yes/No), Balance (live from journal; negative red), Actions. Search, "Remove 0 Balance Account" checkbox, grouping dropdown (No grouping / by Type / Sub Type), three-dot: Sort by, Change Currency ⏳.
- Modal: Account Name\*, Account Type\* [Assets, Liabilities, Equity, Income, Expenses], Sub Type\* (type-dependent: Assets → Cash, Bank, Accounts Receivable, Inventory, Fixed Asset, Other Current Asset, Other Asset; Liabilities → Accounts Payable, Credit Card, Tax Payable, Other Current Liability, Long Term Liability; Equity; Income → Sales, Other Income; Expenses → Cost of Goods Sold, Expense, Other Expense), Firm (All Firms or specific), Parent Account (same type), Currency\*, "Group account (non-postable)" checkbox, Notes (500).
- Nature: asset/expense = debit; liability/equity/income = credit. Balance = Σ(debit−credit) or reverse by nature, firm-filtered.
- Payment "Paid Through" dropdown lists accounts of sub-type Cash, Bank, Other Current Liability, Credit Card with live balance: `AMERICAN BANK (Bank) (₹17,86,588.44)`.

**Seeded system accounts** (`system_key` → name, type, sub type): accounts_receivable (Asset/AR); inventory_asset (Asset/Inventory); petty_cash, undeposited_funds (Asset/Cash); input_cgst, input_sgst, input_igst, tds_receivable, tcs_receivable, vendor_advances, advance_tax (Asset/Other Current Asset); accounts_payable (Liability/AP); gst_payable, output_cgst, output_sgst, output_igst, tds_payable, tcs_payable (Liability/Tax Payable); brokerage_payable, employee_reimbursements, opening_balance_adjustments, customer_advances (Liability/Other Current Liability); opening_balance_equity, retained_earnings (Equity); sales (Income/Sales); discount_received, stock_adjustment_gain, rounding_off (Income/Other Income); cogs (Expense/COGS); discount_allowed, bad_debts, bank_fees, brokerage_expense, write_off, stock_adjustment_loss, shipping_expense (Expense/Expense); adjustment, dimension_adjustments, purchase_variance (Expense/Other Expense).

---

## 4. Products & Inventory

### 4.1 Products (`/accounting/products`) ✅
- List: Name (expand caret → sub-products table: Name, SKU/Barcode, Purchase, Sales, Avg Rate, Stock Reminder, Current Stock, Certificate No, Category), Unit, Purchase, Sales (currency-wise), Avg Rate, Stock, Stock Status badge, Certificate No; search Name/SKU/HSN; reports: Product Detail Report, Material Detail Report ⏳.
- **Create Product** form/modal: **BASIC INFORMATION** — Product Type toggle Service | Goods (default Goods; Service → HSN label becomes **SAC Code** (e.g. 998311) and the **Inventory section is hidden**; Additional Fields still shown), Stock Status [In Available / Stock Out / Temporary Stock Out / Disable], Stock Type [General / Loose Diamond / Metal / Stone / Certified / Jewellery], Product Name\*, Serial No. (auto, editable), Unit, HSN Code (e.g. 8471), Category (multi), Short Description, Product Details ("shown on the public shop product page"). **COMMERCIALS** — PURCHASE toggle → Account\* (default Cost of Goods Sold) + Price; SALES toggle → Account\* (default Sales) + Price; Currency\*; M.R.P.; Tax (default GST 0%). **INVENTORY** toggle → Tracking Type [SKU Tracking (Per Sub-Product Unique Number)] (enum, extensible). **PRODUCT IMAGES** (collapsible, multi) ⏳. **ADDITIONAL FIELDS** (custom fields e.g. Certificate No). **SUB-PRODUCTS** inline grid: Image, Sub-Product Name\* ("Auto from template if blank"), SKU (auto `SKU-00198`, editable e.g. `PROD-L-BLK`), Purchase Price, Selling Price, Stock Reminder, Certificate No, Category [CVD / HPHT / NATURAL — configurable]; "+ Add Sub-Product". A product with no sub-products gets one default variant named after the product (stock/prices live on variants).
- Tables `products`, `product_variants` (tenant-unique SKU), `product_categories`, `counters` (serials/SKU). `GET /products/search?term&stockType` for line pickers (matches product name, variant name, SKU, barcode).

### 4.2 Certified Products (`/accounting/certified-products`) ⏳ — one stone = one product with one variant, stock_type = certified
- Summary bar: Total, Stock, Memo, Net Rate, Net Value; icons scan/view/print. Bulk actions on selection: **On Hold** (hold customer / hold broker), **Purchase ▾** (Purchase Order Alt+P / Purchase Bill Alt+B / Debit Note Alt+D / PO Return Alt+T), **Sale ▾** (Estimate / Sales Order / Invoice / Credit Note) → opens the document form prefilled with the selected stones (pcs 1, qty = carat).
- Filters panel: Remove Zero Stock, Only Available For Sale; Shape chips (Round, Princess, Oval, Marquise, Pear, Cushion, Emerald, Asscher, Radiant, Heart, Triangle, Trilliant, B Trilliant, B Trapezoid); Lab (GIA, IGI, MP); Carat min/max; Category; Colour D–Z; Clarity (FL, IF, VVS1, VVS2, VS1, VS2, SI1, SI2, SI3, I1, I2, I3, VS); Cut (Excellent, Very Good, Good, Fair, Poor, Ideal); Polish/Symmetry (Excellent…Poor); Fluorescence. Multi-select, Clear all, Done.
- Columns (58): Name, SKU, Sub Product Name, Firm, Branch, Weight, Status, Hold Customer Name, Hold Broker Name, Lab, Discount Type, Discount Value, HSN/SAC, Unit, Tax, Rapaport Price, RapBack, Price/Carat, Total Sales Price, Total Purchase Price, Total Price, SO Committed, PO Committed, Saleable Qty, Party Name, Module No, Currency, Category, Sales A/c, Purchase A/c, Description, Purchase Price, Selling Price, Attachments, Created + custom fields. Three-dot: Export, Import, Update Sale Price / Discount (bulk), Customize Columns.
- **Add Certified Product** (full + quick-add modal): Name / Sub Product Name ("Auto from template if blank" → name template in Settings), SKU\*, Stock Status, HSN/SAC, Unit, Tax (GST 0%), Currency\*, Category, Lab, Sales A/C\* (Sales), Purchase A/C\* (COGS), Purchase Price, Selling Price, MRP (full only), Discount Type (Percentage/Amount) + Discount Value ("+ = premium"), Description ("Internal notes about the piece"); custom fields in order: Discount, Length, Image Link | Video Link, Certificate No, Stock Number | Shape, Clarity, Color | Repo Rate Size (Rapaport carat brackets 0.01-0.03, 0.04-0.07, 0.08-0.14, 0.15-0.17, 0.18-0.22 … 0.4-0.49, 0.5-0.59 …), Size, Cut\* | Fluorescence Intensity\*, Polish\*, Symmetry\* | Cert Comment, Measurements Width, Crown Height, Shade, Milky, Eye Clean, Depth %\*, Table %\*. Full form adds "Add stock" checkbox (opening carat → "Stock Added") and buttons Save / Save & Print Barcode; quick-add: Cancel/Save only, no stock block.
- Pricing: Rapaport price list × (1 + RapBack%) → Price/Carat; Total = Price/Carat × weight.

### 4.3 Stock View (`/accounting/inventory/stock-view`, also `/jewellery/stock-view/metal|gemstone`) ✅
- Summary cards: Total Items, SO Committed Stock, Low Stock Items, Total Stock Value, Total Inventory Asset Value (currency-wise).
- Filters: All Firms, All Branches, stock type, Remove Zero Stock, search, report icon.
- Columns: Product, Sub Product, SKU, Unit, Total In, Total Out, Pcs, Current Qty (red if negative; "Low" badge when ≤ stock reminder), SO Committed (+Pcs), PO Committed (+Pcs), Saleable Qty (+Pcs), Current Value (FIFO), Inventory Asset Value, Avg Rate, Purchase Price, Selling Price; Total row. Row actions: **Product History**, **FIFO Tracking**.
- **Product History** modal: Date, Branch, Contact, Document (link) + note, In Qty/Pcs/Rate, Out Qty/Pcs/Rate, Value, running Qty/Pcs; Report button → `/reports/product-history` ⏳ (standard report layout: Filters Firm/Branch/date presets/More Filters, Run Report, Export, grouped rows, Subtotal/Total).
- **FIFO Tracking** modal: Received, Branch, Document, Qty In, Remaining, Pcs In, Pcs Left, Rate, Value (consumed lots greyed).
- **Branch Wise Stock View**: pivot rows Product/Sub Product, columns = branches, Total; filters Firm (Category, Product, Item ⏳); print/export ⏳.

### 4.4 Stock Adjustment (`/accounting/inventory/adjustment`) ✅
List: Number, Date, Mode, Ref No, Total Value, Created By, actions (edit ⏳/journal/delete). Form: Firm\*, Branch\*, Adjust# (series), Date\*, Reference No, **Mode of Adjustment\*** [Quantity Adjustment / Value Adjustment], Note; items: Product\* (shows stock), Sub Product, Qty Available, **Qty Adjusted (+/−)\***, Pcs Adjusted, New Qty on Hand (red if negative), Rate (disabled for removals — costed at FIFO); Add New Item, Import from Excel. Posting: +qty → stock IN at rate, `Inventory Asset Dr / Stock Adjustment (Gain) Cr`; −qty → stock OUT FIFO, `Stock Adjustment (Loss) Dr / Inventory Asset Cr`. Detail view with items + journal.

### 4.5 Stock Transfer F/B (`/accounting/inventory/transfer`) ✅
List: Number, Date, From (Firm/Branch), To, Ref No, Status (Approved), Total Value, Created By; actions revert/delete. Form: Firm\* + From Branch\*, To Firm\* + To Branch\* (≠ from), Transfer#, Transfer Date\*, Ref No, Notes; Scan SKU; items Product\*, Sub Product, Available, Pcs, Qty\*, Unit Price (FIFO avg, estimated), Total. Posting: OUT at FIFO from source, IN at that cost at destination; journal Inventory Asset Dr / Inventory Asset Cr (audit). Detail with PDF ⏳ + journal.

### 4.6 Product Transfer (`/accounting/inventory/item-transfer`) ✅
Product-to-product conversion within a branch. Form: Firm\*, Branch\*, Transfer#, Date\*, Ref, Notes; items From Product/Sub Product → To Product/Sub Product, Available, Pcs, Qty\*, Unit Price, Total. Posting: OUT from source variant at FIFO, IN to target at same cost.

---

## 5. Purchase module ✅

### 5.1 Purchase Orders (`/accounting/purchase/orders`)
- List: Order #, Firm, Branch, Date, Vendor, Amount, Status (Draft / Open / Partial / Billed), Created By.
- Form (ORDER DETAILS): Firm\*, Branch\*, Order#\* (POK series), Vendor\*, Shipping Address (vendor-dependent), Order Date\*, Bill No (optional), Currency & Exchange Rate\*, Expected Date; line items per §1.5; Internal/Printable Notes, Attachments; Summary (Subtotal, TDS/TCS, Adjustment, Grand Total); Cancel / Save as Draft / Save as Open ▾.
- No posting. Open orders commit stock (PO Committed). `GET /purchase/orders/open/:contactId` returns pending lines (orderId, docNo, itemId, variant, pendingQty, rate, tax, discount) for the bill's "Open Purchase Orders" picker. Bill lines carry `sourceLineId`; billed_qty updates; status open → partial → billed; billed orders cannot be edited/deleted.

### 5.2 Purchase Order Returns (`/accounting/purchase/order-returns`)
- List: Return #, Firm, Branch, Date, Vendor, Amount, Status (Draft orange / Confirmed blue), Created Date & Time, Created By, Actions (edit/delete).
- Form "New Purchase Order Return": Firm\*, Return#\* (PORK/PORP), Vendor\*, Return Date\*, Currency & Exchange Rate\*, Shipping Address; line grid; Internal Notes + Attachments (no printable notes); Summary without shipping; Cancel / Save ▾ (Draft/Confirmed). **Standalone** (no PO link).
- Posting (Confirmed): stock OUT at FIFO; journal `Accounts Payable Dr (vendor) grand | Inventory Asset Cr cost, Input GST Cr tax, Purchase Price Variance Cr (net − cost)`.

### 5.3 Purchase Bills (`/accounting/purchase/bills`)
- List: Bill #, **Order Number** (vendor's bill no), Firm, Branch, Date, Vendor, Amount, Paid (green), Balance (red if > 0), Expense (`-` unless expense linked), Status (Draft / Open / Partial / Paid / **Overdue** = due date passed & balance > 0), Actions (delete hidden when paid). Report icon.
- Form (BILL DETAILS): Firm\*, Branch\*, Bill#\* (PK-26/27- / PP-26/27-; series dropdown searchable "Select or search series"), **Order Number\*** (vendor bill no, required), Vendor\*, Bill Date\*, Sales Person, Currency & Exchange Rate\*, Payment Terms (default from vendor; Custom), Due Date (auto = bill date + days). Line items (§1.5; "N Open Purchase Orders" picker). Summary adds **Shipping Charges** (dropdown None/… + amount). Buttons Cancel / Save as Draft / Save as Open.
- **Decision**: inventory is valued **net of line discount, before tax** (reference posts gross with a separate AP debit — not followed).
- Posting (Open): stock IN per tracked goods line at `taxable/qty`; journal `Inventory Asset Dr Σtaxable (goods) | line purchase account Dr (services/non-tracked) | Input CGST + Input SGST (same state) or Input IGST Dr | Shipping & Freight Dr | Adjustment Dr/Cr | TCS Receivable Dr (if TCS) || Accounts Payable Cr (vendor) grand total | TDS Payable Cr (if TDS)`. Due date, PO billed_qty, PO status.
- Detail: PDF (Bill #, Date, PO Number, Place of Supply; VENDOR; items # Item HSN/SAC Description Pcs Qty Unit Rate Discount Discount % Tax % Tax Amt Amount; IGST/CGST+SGST summary; Discounted Amount, Subtotal, tax, Grand Total, Paid, Remaining; words; Authorized Signatory; terms band), actions Edit / Print ▾ / PDF ▾ / XLS ▾ / Email / WhatsApp ▾ / **$ Record Payment** / Debit Note / Attachments / ⋮; tabs Details / Activity Logs; Journal. Delete blocked if payments or debit notes exist.
- `GET /purchase/bills/outstanding/:contactId?all=` for allocation grids and DN "Bill No" dropdown.

### 5.4 Debit Notes (`/accounting/purchase/debit-notes`)
- List: Note #, Firm, Branch, Date, Vendor, Reason, Amount, Status (Open / Closed green; closed = no actions), Created Date & Time, Created By.
- Form (DEBIT NOTE DETAILS): Firm\*, Branch\*, Debit Note#\* (DNK/DNP), Date\*, Vendor\* (+pencil edit), **Bill No** dropdown (enabled after vendor; `Bill No - PP-26/27-4`; **Unpaid Bill** checkbox filters to open/partial, default off; list icon → pick bill lines ⏳), Currency & Exchange Rate\*. Grid with expand row **Account\***; **"Only Correction in Amount"** checkbox (info) = no stock movement. Internal + Printable Notes, Attachments; Summary. Buttons Draft / Open.
- Posting (Open): `Accounts Payable Dr (vendor) grand | Inventory Asset Cr FIFO cost (goods, not amount-only) | line account Cr taxable (amount-only/services) | Input GST Cr tax | Purchase Price Variance Cr difference`. Status → Closed when fully applied by a "Debit Note Payment". Delete blocked if applied.

### 5.5 Vendor Payments (`/accounting/purchase/vendor-payments`)
- List: Payment #, Firm, Branch, Date, Vendor, Type badge (Payment blue / Refund orange / Debit Note Payment / Advance), Amount, Status (Paid green / Draft orange), Created Date & Time, Created By.
- Form (PAYMENT DETAILS): Firm\*, Branch\*, Vendor\* (+pencil), Payment#\* (VPK/VPP), Payment Date\*, **Payment Mode\*** [Bank Transfer, Cash, Cheque, Credit Card, Debit Card, UPI, Others], **Payment Type\*** [Payment, Debit Note Payment, Advance, Refund], Currency & Exchange Rate\* (rate e.g. 0.010516 when doc currency ≠ base), **Amount\*** (label shows `Total Pending: ₹5,413.50` once vendor chosen), **Paid Through\*** (Cash/Bank/OCL accounts with balance), Reference No, Search Bill No ("All bills (1)"). Internal / Printable Notes, Attachments. Buttons Cancel / Save as Draft / **Save as Paid**.
- **BILL ALLOCATION** (types Payment → open bills; Debit Note Payment → open debit notes; hidden for Advance/Refund): Bill Date | Module No | Bill Type badge | Total Amount | **Write-off** (input) | **Discount** (F/% + value) | **TDS / TCS** (toggle + rate → −amount) | Amount Due | **Payment** (input, capped at due) | delete. Only targets in the payment's currency. Empty: "No outstanding bills found — This vendor has no pending bills".
- **Apply Advance Payment**: Available Advance (Σ unallocated of earlier paid payments/advances), Amount to Apply (disabled when 0), **Available Advance Payments** list (`VPP-26/27-1  05 May 2026  ₹500.00`). Advance is consumed oldest-first and applied to the allocated bills after cash/discount/write-off/TDS.
- **Payment Summary**: Amount Paid, Advance Amount Apply (green), Amount used for Payments (blue), Pending Amount (red), Amount in Excess (= amount − allocated → stays as vendor advance).
- Posting (Paid): payment/advance `Accounts Payable Dr (vendor) amount+discount+writeoff+TDS | Paid Through Cr amount, Discount Received Cr, Write-off Cr, TDS Payable Cr`; refund / debit-note payment (money comes back) `Paid Through Dr | Accounts Payable Cr`. Advance application posts nothing (already AP Dr). Bill paid_amount/status; DN applied/closed.
- Detail (`/accounting/purchase/vendor-payments/:id`): master-detail list; header `VPK-26/27-7` PAID; actions Edit, Email, WhatsApp ▾, ⋮ (Cancel Payment / Delete); tabs **Overview** (hero: ₹ amount, vendor, Payment Date, paid-through account; PAYMENT DETAILS grid: Payment Type badge, Payment Date, Currency, Paid Through, Payment Mode, Ref No; **BILL ALLOCATIONS** table Bill Type (`Purchase_bill`/debit note), Bill #, Vendor Bill Number, Date, Amount, Applied; blue footer Allocated Amount, Unallocated / Advance, **NET PAID AMOUNT**; Internal Notes, Attachments (n); **Journal entries**) / **Payment Slip** (PDF from template; if none: "No template preview available — Create one in Settings → Print Templates → Vendor Payment") / **Activity** ("View Audit Trail ›").
- Delete guard: advance from this payment used by a later payment → 409.

---

## 6. Sales module ✅

Sidebar Sales ›: Estimates, Sales Orders, Sales Order Returns, Invoices, Credit Notes, Customer Payments (+ Proforma Invoice exists as a print doc type ⏳).

### 6.1 Estimates (`/accounting/sales/estimates`)
- List: Estimate #, Firm, Branch, Date, Customer, Amount, Valid Until, Sales Person, Status (Draft / Sent / Accepted / Closed = converted), Created Date, Actions (locked when Closed). Series EK/EP; counters per branch.
- Form: Firm\*, Branch\*, Estimate#\*, Valid Until, Customer\*, Shipping Address, Estimate Date\*, Currency & Exchange Rate\*, Payment Terms; grid; Internal Notes, Printable Notes ("Notes to appear on the printed estimate"), **Estimate Detail** rich-text editor (CKEditor-style: bold/italic/underline/strike, lists, align, image, table, emoji, font/size, Source) ⏳ rich UI (plain textarea ✅), Attachments; Summary with **Round Off**; Cancel / Save ▾. Convert to Sales Order / Invoice ⏳ (marks Closed).
- Detail PDF "Classic Estimate": ESTIMATE, Estimate #, Date, Place of Supply; BILL TO with full billing address; items; totals; words; Authorized Signatory. No Edit when Closed.

### 6.2 Sales Orders (`/accounting/sales/orders`) — **memo / approval**
- List: Order #, Firm, Branch, Date, Customer, Amount, Status (Open / Partially / Closed / Cancelled), Created Date & Time, Created By, Actions (Open → edit+delete; Partially → edit only; Closed → none). Series SOK/SOP; `SOK-261` for Melee.
- Form: Firm\*, Branch\*, Sales Order#\*, Currency & Exchange Rate\*, Customer (reference optional; **Decision: required**), Shipping Address, Order Date\*, Payment Terms, Expected Date (default today); grid; Internal/Printable Notes, Attachments; Summary with Round Off; Cancel / Save as Draft / Save as Open.
- Semantics: Open order = goods issued on memo; stock stays in Current Qty but appears in **SO Committed**; Saleable = Current − Committed; customer **Outstanding Memo** = Σ pending qty × rate. Per line counters: qty, invoiced_qty/pcs, returned_qty/pcs, loss_qty/pcs; pending = qty − invoiced − returned − loss; status open → partial → closed (all pending 0).
- Detail: tabs **Preview / Return / Activity Logs**; actions ⟳ **Convert to Invoice** (invoice form prefilled with pending lines via `?fromOrder=`), Return Stock, ⋮ Return Stock / Cancel Order / Delete. PDF "Detailed Sales Order": BILL TO + SHIP TO; columns # Item Name, Quantity, Received Qty (= returned), Invoice Qty, Pending Qty, Unit, Rate, Discount, Discount %, Discount (Amt+%), Tax %, Tax Amount, Amount; words currency-aware ("Seventy Eight Thousand Dollars Only"). Returns list section.
- **Return Stock** screen (modal): read-only Customer, Firm, Branch, Currency, Tax Type; **Series\*** (SORK-26/27-) with preview; Scan SKU + Scan button + camera; **All Return Stock** checkbox; grid: Issue Product (name / SKU + code), Issue Qty, Return Date, Pcs, **Loss Qty**, **Return Qty**, Sales Qty & Pcs (invoiced), Pending Qty & Pcs; buttons Cancel / **Return** / **Return & Convert to Invoice**. Validation return + loss ≤ pending. Posting: return releases commitment (no journal); loss → stock OUT FIFO + `Stock Adjustment (Loss) Dr / Inventory Asset Cr`. Sales Order Returns list ✅ API.

### 6.3 Invoices (`/accounting/sales/invoices`)
- List: Invoice #, Firm, Branch, Date, Customer, Amount, Due Date, Balance, Status (Draft / Open / Partially / Paid / Overdue), Created By. Series IK/IP.
- Form (INVOICE DETAILS): Firm\*, Branch\* (locked when from SO), Invoice#\*, Invoice Date\*, Customer\* (locked + pencil when from SO), Shipping Address, **Consignee (Dispatch From)** (contact), Currency & Exchange Rate\*, Payment Terms, Due Date, **Linked Sales Orders** (read-only chips; multiple SO per invoice). Customer insight card (§1.5). Grid (lines from SO show `10101 (STOCK - 123)` + pencil quick-edit product; tax "Out of Scope" allowed) + **"1 Open Sales Order"** picker. ADDITIONAL DETAILS: Internal Notes ("won't be visible to the client"), Printable Notes, **Terms & Conditions**, Attachments. Summary: TDS/TCS, Adjustment, Round Off, Grand Total. Cancel / Save as Draft / Save as Open.
- Posting (Open): stock OUT FIFO per tracked goods line; journal `Accounts Receivable Dr (customer) grand | Sales (line sales account) Cr taxable, Output CGST+SGST / IGST Cr, TCS Payable Cr (if TCS), TDS Receivable Dr (if TDS), Adjustment, Rounding Off Dr/Cr | Cost of Goods Sold Dr cost / Inventory Asset Cr cost`. SO invoiced_qty + status roll.
- Detail: actions Edit, Print ▾, PDF ▾, XLS ▾, Email, WhatsApp ▾, **calendar (follow-up)**, Attachments, ⋮; **$ Record Payment**, Credit Note; tabs Details / **Follow-ups** / Activity Logs; Journal; Paid/Remaining in totals. Delete blocked if receipts or credit notes exist.
- **Follow-ups** section: count badge, **+ Add Follow-up** modal (`IK-26/27-12 · DASS DIAMONDS`): Outcome chips [Promised to pay, Partial payment promised, No response, Disputed, Other], Channel chips [Call, WhatsApp, Email, Visit, Other], Comment ("Use @ to mention a teammate" ⏳ mentions/notifications), Next follow-up (date + time), Cancel / Save Follow-up. List shows outcome badge, channel, time, user, comment, next date.

### 6.4 Credit Notes (`/accounting/sales/credit-notes`)
Mirror of debit notes for customers: Invoice No dropdown (+ Unpaid filter), Reason, Only Correction in Amount, line Account\*, Round Off. Posting (Open): `Sales (line account) Dr taxable, Output GST Dr tax, Rounding/Adjustment | Accounts Receivable Cr (customer) grand | Inventory Asset Dr cost / COGS Cr cost` (stock IN at the original invoice line cost; else last IN rate). Closed when applied via Credit Note Payment.

### 6.5 Customer Payments (`/accounting/sales/customer-payments`)
Same screens as Vendor Payments with labels Customer / **Deposit To** / Invoice allocation / Credit Note; types [Payment, Credit Note Payment (refund of a credit note), Advance, Refund]. Posting (Paid): payment/advance `Deposit To Dr amount | Accounts Receivable Cr (customer) amount+discount+writeoff+TDS, Discount Allowed Dr, Bad Debts Dr, TDS Receivable Dr`; refund / credit-note payment `Accounts Receivable Dr | Deposit To Cr`. Advance netting identical to vendors.

---

## 7. Jewellery module ⏳ (from reference; not yet implemented)

- **Designs** (`/jewellery/designs`): list Design No, Tag No, Net Wt (g), Category, Stone/Diamond, Status, Actions; search design no/tag; **Costing Report** icon next to Add. Form: Design No\* (DSN-001), Status (Draft), Tag No, Gross Weight (g), Net Weight (g), Metal Value, Category, Rate Template, Combo Designs (multi-select + "Combine Materials": merges component material lines, duplicates summed). Material Details grid: Product Type (General / Loose Diamond / Metal / Stone / Certified / Jewellery) → Product → Sub-item (dependent), Pcs, Weight, Main flag; Add material. Images: Design Images (multi), CAD Images (multi), Sample Image (single, 5 MB, JPG/PNG/GIF/WebP). Tables designs, design_materials, design_combos, design_images.
- **Labour** (`/jewellery/master/labour`): list Serial #, Name, Metal Charge, Stone/Pc, Diamond/Pc. Modal: Labour Name\*, Serial Number\*, Metal Charge Basis\* [Per Gram (× net weight) / Fixed (flat) / Percentage (of metal value) / Per Metal Type (rate × net weight; grid Metal + Rate/g, Add Rate)], Rate field changes by basis; Stone Charge/Piece, Diamond Charge/Piece. Save / Save & New. Tables labours, labour_metal_rates.
- **Rate Template** (`/jewellery/master/rate-templates`): list Serial #, Template Name, Type, Purchase Making, Sales Making. Modal: Template Name\*, Serial Number\*, Type\* [Lump Sum / Material Wise / Gross Weight], Labour Charge (Purchase)\*, Labour Charge (Sales)\*.
- **Jewellery Products** (`/jewellery/products`): list Name, SKU, Description, Status, Mode, Actions; search name/SKU/barcode; reports Product Detail / Material Detail; sortable Base Metal, Pure Wt, Purity %, Diamond Pcs, Tag No, Gross/Net Wt. Form: Firm\*, Branch\*, Mode toggle (Purchased / Manufactured), Design (auto-fill materials), Name\*, SKU (auto), Stock Status, Tag No, HUID, Gross Wt, Net Wt, Metal Value, Purchase Price, Sales Price, Category, Size (category-dependent), Tax, Currency\*, Sales Account\*, Purchase Account\*, Description; Material grid: Product Type, Product, Sub-item, Pcs, Weight, Rate, Sales Rate, Making Cost, Certificate No; Images (multi). Rule: Purchased piece — materials descriptive only, no stock movement; piece enters stock via Purchase Bill. Manufactured — via Manufacturing Receive. "Jewellery Products (Multi)" = bulk create several pieces in one grid.
- **Manufacturing** (`/jewellery/manufacturing`) — job-work issue to vendor: list Issue #, Date, Vendor, Design, Status, Expected Return. Form (New Manufacturing Issue): Firm\*, Branch, Series & Number\*, Issue Date\*, Expected Return Date, Vendor\*, Customer (Job Work), Design\* (materials auto-load), Rate Template, Tag No (finished piece), Currency & Exchange Rate, Notes, Issue Photos. Materials to Issue grid: Product Type, Product, Sub-item, **Receive As**, Pcs, Weight, Main, Rate, **Material Source** (own stock / vendor material / customer metal); Import from Excel; button "Issue to Vendor". **Manufacturing Receive** step (consumes issued material / vendor material / customer metal, creates finished product, applies labour via rate template) — screen not captured ⏳.
- **Material Recovery** (`/jewellery/material-recovery`): list Document No, Type, Piece, Piece Status, Date, Recovered, Loss. Form (Separate Material): Firm\*, Branch, Type\* [Separate Material / Dispose Product], Piece\* (jewellery product), Date\*, Series & Number\*; piece's material lines load → select what to recover, loss.
- **Customer Metal** (`/jewellery/customer-metal`): customer's gold for job work; never enters inventory, no payable; credited as fine weight against customer until used or settled. List Receipt #, Date, Customer, Fine Weight Credited. **Balances** page: Customer, Metal, Purity, Fine Weight Held, Age (days), Receipts, Actions. Form: Firm\*, Branch, Date\*, Customer\*, Note; grid Metal, Received Purity (22K), Credit As (Fine 24K), Gross Weight (4 dp), Tunch % (default 91.500), Fine Weight (calc = gross × tunch/100), Description; total credited. Tables customer_metal_receipts, customer_metal_ledger.
- **Vendor Material Stock** (`/jewellery/vendor-material`): own material issued to vendor in advance; stays in inventory; posts nothing until Manufacturing Receive uses it or Return brings it back. List Firm, Branch, Vendor, Material, Type, Variant/Purity, Weight, Pcs, Avg Rate, Value; row opens history. Modal (Issue Material to Vendor): Firm\*, Branch, Issue Date\*, Vendor\*, Stock Type filter, Material\*, Variant/Purity\*, Weight\* (4 dp), Pieces, Rate\* (prefilled from stock cost), Note. Return document. Table vendor_material_ledger.
- **Stock View** (metal / gemstone): same as §4.3 filtered by stock type.

## 8. Lab Issue / Return (`/accounting/lab-process`) ⏳
List: Product (SKU · Lab), Issue Details (date, weight), Return Details (date, weight, cert no), Property Comparison (issue vs return Shape/Clarity/Color, ✓ on change), Cost & Price (Lab Cost, Insurance), Lab Status, Actions. Staged modal: **Ready To Lab** — Certified Product\* (+quick add), Lab\*, Issue Date\*, Insurance Amount, Issue Weight (ct), Shape/Clarity/Color; **Result received from lab** — Result Date\*, Lab Cost, Return Weight (ct) + all diamond attributes (updates the stone); **Recheck** (repeatable): Recheck Date, attributes, Received; **Returned to stock** — Return Date\*, Certificate No\*. Imports: Import Ready To Lab, Import Lab Issue. Tables lab_processes, lab_rechecks. Lab cost posts to stone cost (Inventory Dr / AP Cr lab vendor).

## 9. Production → Production Report ⏳
Tabs Product Consumption / Product Production / Wastage. Filters Firm, Process (master), Date From/To. Columns Product, Total Qty, Damage Qty, Unit, Total Value, Batches.

## 10. Transactions, Banking, Reports ⏳ (screens not captured — implement standard)
- Transactions: Manual Journal (series, date, lines account/contact/debit/credit, narration; balanced), Expenses (vendor optional, expense account lines, paid through), Opening Balances.
- Banking: bank accounts list with balances, statement import & reconciliation.
- Reports: standard layout (Filters Firm/Branch/date presets This Month/FY YTD/Last 12 Months/custom + More Filters; Run Report; Export; grouped rows with Subtotal/Total). Minimum set: Product History, Stock Summary, Sales/Purchase registers, Receivables/Payables ageing (0–30/31–60/61–90/90+), Party ledger, Trial Balance, P&L, Balance Sheet, GST summary (GSTR-1/3B), TDS/TCS, Day book, Cash/Bank book.

## 11. Print templates (Settings → Accounting Setup → Custom Print, "Document Layouts") ⏳
- Header: firm filter (All Firms), **Create Template**, **Import**. Toggle "Use next-gen print renderer (Paged.js) — Experimental" (repeats large headers on every page; auto-disabled with "push footer to bottom" or 2-copies-per-page).
- Doc-type tabs: Invoice, Estimate, Proforma Invoice, Sales Order, Purchase Order, Purchase Bill, Credit Note, Debit Note, Vendor Payment, Customer Payment, Stock Transfer, Package, Shipment, Jewellery Receive, Jewellery Issue.
- Template cards: thumbnail, name, `A4 portrait · <preset>`; presets Classic, Standard Classic, Compact, Detailed, Standard, Minimal, Modern; badges **Default** (star) and **Regulated** (reserved for regulated series); actions duplicate, set default, share/export, fork, delete; "Create New — Start from blank or preset".
- Three concrete layouts seen for Purchase Bill: (a) Default/red: full columns incl. Description, Discount %, Tax Amt; (b) **Classic/blue**: columns #, Item, HSN/SAC, Pcs, Qty, Rate, Discount, Tax %, Amount; totals add **Paid Amount (−)** and **Remaining Amount**; (c) **Boxed/tally style**: bordered grid, big firm name, phone right, Bill/Date/PO + Place of Supply boxes, columns #, Item Name, HSN/SAC, Qty, Rate, Tax %, Amt, fixed-height body, Total row, "Total In Words" left + totals right, **Terms & Conditions** box, **Received By** + **For, <Firm> / Authorized Signatory**.
- Schema `print_templates` (firm nullable, doc_type, name, preset, page size/orientation, is_default, is_regulated, config JSONB: columns, show_paid_remaining, show_terms, footer_text, copies_per_page, push_footer, logo). Generator: HTML template + config → PDF (Puppeteer/Paged.js). Print ▾ / PDF ▾ menus list templates; document stores chosen template id.

## 12. Settings ⏳ (except ✅ firms, branches, users, roles, masters, series, custom fields)
Sidebar: Organization ›, Users & Roles ›, Customization › (Custom Fields, Document Series, Customize Columns defaults, name templates), Accounting Setup › (General, Opening Balance, Sales Persons, Custom Print, Terms & Condition), Diamond Accounting ›, Jewellery Setting ›, Taxes & Compliance › (tax rates, TDS/TCS rates, GST settings), Inventory › (negative stock allowed, valuation, stock types, categories, units), Storefront ›. "Search settings ( / )". Firm-level settings as in §1.10. Users: name, email, password, phone, roles (multi ⏳; single ✅), firm access (empty = all), default firm, active. Roles: permission matrix module × view/create/update/delete.

## 13. Accounting Dashboard (`/accounting`) ⏳ — build LAST
Firm filter, period presets (This Month / FY YTD / Last 12 Months), Export, New Invoice. Widgets: Cash & Bank Position (bank accounts, petty cash, undeposited funds; Receivables, Payables, Working Capital, Net Cash Flow); KPI cards (Revenue, Expenses, Net Profit + margin, Overdue Receivables, GST Payable, Invoices Raised) with sparklines; Decision Board (Do Now / Growth & Savings / Keep Watching); Revenue vs Expenses (12 mo); Expense Breakdown donut; Receivables & Payables Ageing (0-30/31-60/61-90/90+, avg days); Invoice Pipeline (Draft/Awaiting/Overdue); Sales Order Pipeline; Ratios (Current, Quick, Debtor Days, Inventory Days, Cash Cycle, Interest Coverage); P&L summary; GST & Compliance (GSTR-1, GSTR-3B due, TDS/TCS); Top Parties (customers/vendors tabs); Upcoming Dues; Bank Reconciliation; Cash Flow Summary; Needs Attention; Revenue in Pipeline (Quotation → SO → Invoice → Proforma); Collections; Receipts by Mode; Branch Performance; Top Products; Quarterly Trend table; Recent Vouchers; Inventory summary (stock value, out-of-stock, stock turns, adjustments); POS today.

---

## 14. Calculation rules (`packages/shared/src/calc.ts`) ✅ — used by both API and web so live totals = posted totals

- Line: `gross = qty × rate`; `discount = flat value | gross × %`; `net = max(0, gross − discount)`.
  - Tax **exclusive**: `taxable = net`, `tax = taxable × rate%`, `amount = taxable + tax`.
  - Tax **inclusive**: `taxable = net / (1 + rate%)`, `tax = net − taxable`, `amount = net`.
  - Tax rate % = 0 for types out_of_scope / exempt / nil.
- Totals: `subtotal = Σ amount`; `taxableTotal`, `taxTotal`, `discountTotal`; **withholding** = taxableTotal × rate%, TDS **subtracted**, TCS **added**; shipping (bills); adjustment (±); **round off** (sales docs: to nearest whole unit); `grandTotal = subtotal + withholding + shipping + adjustment + roundOff`. All rounded to 4 dp; balances shown at 2 dp.
- GST split: interstate → IGST; else CGST = SGST = tax/2. **Interstate** = contact GST treatment overseas/SEZ, or contact billing state code ≠ branch (else firm) state code; unknown contact state → intra. Place of supply = contact state code (fallback firm).
- Certified / jewellery lines: pcs fixed 1; qty = carat weight; rate per carat.
- Amount in words: Indian numbering (Lakh/Crore), currency unit name from currency (Rupees/Dollars) + paise.
- Due date = document date + payment-term days (contact custom days when terms = Custom).
- FIFO cost, negative stock, average rate as in §1.8. Inventory value on bills = taxable (net of discount, excl. tax) — **Decision**.

## 15. Posting rules summary (all auto-posted; party lines carry contact_id)

| Document (status) | Stock | Debit | Credit |
|---|---|---|---|
| Stock Adjustment + | IN @ rate | Inventory Asset | Stock Adjustment (Gain) |
| Stock Adjustment − | OUT FIFO | Stock Adjustment (Loss) | Inventory Asset |
| Stock Transfer (Approved) | OUT src / IN dst @ cost | Inventory Asset | Inventory Asset |
| Product Transfer | OUT from / IN to @ cost | Inventory Asset | Inventory Asset |
| Purchase Order (Open) | commits (PO Committed) | — | — |
| Purchase Bill (Open) | IN @ taxable/qty | Inventory Asset (goods) / purchase account (service), Input CGST+SGST or IGST, Shipping & Freight, TCS Receivable, Adjustment | Accounts Payable (vendor), TDS Payable |
| PO Return (Confirmed) | OUT FIFO | Accounts Payable | Inventory Asset (cost), Input GST, Purchase Price Variance |
| Debit Note (Open) | OUT FIFO unless amount-only | Accounts Payable | Inventory Asset / line account, Input GST, Purchase Price Variance |
| Vendor Payment (Paid) | — | Accounts Payable (amount+disc+w/o+TDS) | Paid Through, Discount Received, Write-off, TDS Payable |
| Vendor Refund / Debit Note Payment | — | Paid Through | Accounts Payable |
| Estimate | — | — | — |
| Sales Order (Open) | commits (SO Committed, memo) | — | — |
| SO Return — loss qty | OUT FIFO | Stock Adjustment (Loss) | Inventory Asset |
| Invoice (Open) | OUT FIFO | Accounts Receivable (customer), TDS Receivable, COGS | Sales (line account), Output CGST+SGST or IGST, TCS Payable, Rounding Off, Inventory Asset |
| Credit Note (Open) | IN @ original cost unless amount-only | Sales, Output GST, Inventory Asset | Accounts Receivable, COGS |
| Customer Payment (Paid) | — | Deposit To, Discount Allowed, Bad Debts, TDS Receivable | Accounts Receivable |
| Customer Refund / Credit Note Payment | — | Accounts Receivable | Deposit To |
| Advance application (both sides) | — | — (netting only) | — |
| Lab process ⏳ | — | Inventory Asset (stone cost) | Accounts Payable (lab) |
| Manufacturing Receive ⏳ | consume materials, IN finished piece | Inventory Asset (piece = materials + labour) | Inventory Asset (materials), Accounts Payable (labour) |

Status machines: PO draft→open→partial→billed; PO Return draft→confirmed; Bill draft→open→partial→paid (+overdue flag); DN draft→open→closed; Payment draft→paid→cancelled; Estimate draft→sent→accepted→closed; SO draft→open→partial→closed / cancelled; Invoice draft→open→partial→paid (+overdue); CN draft→open→closed.

## 16. Data model (tables) ✅ unless marked
tenants, firms, branches, users, roles, role_permissions, user_roles, user_firms, currencies, units, tax_rates, categories, payment_terms, sales_persons, locations, document_series, custom_fields, custom_field_options, audit_logs, counters, contacts, contact_shipping_addresses, contact_persons, accounts, products, product_categories, product_variants, journal_entries, journal_lines, stock_movements, stock_lots, stock_lot_consumptions, stock_adjustments(+items), stock_transfers(+items), product_transfers(+items), purchase_orders(+items: billed_qty), purchase_order_returns(+items: cost_value), purchase_bills(+items: purchase_order_item_id), debit_notes(+items), vendor_payments, vendor_payment_allocations, vendor_payment_advance_applications, estimates(+items), sales_orders(+items: invoiced/returned/loss qty+pcs), sales_order_returns(+items), invoices(+items: sales_order_item_id, cost_value), invoice_sales_orders, invoice_followups, credit_notes(+items), customer_payments, customer_payment_allocations, customer_payment_advance_applications. ⏳ attachments, saved_filters, user_column_prefs, print_templates, designs(+materials,combos,images), labours(+metal_rates), rate_templates, jewellery_products(+materials,images), manufacturing_issues(+items)/receives, material_recoveries, customer_metal_receipts/ledger, vendor_material_ledger, lab_processes, lab_rechecks, manual_journals, expenses, bank_statements, notifications.

## 17. API summary (prefix `/api`, Bearer JWT; 401/403/404/409/400 with `{code,message,details}`)
auth/login, auth/me, my/firms; firms, branches, firms/:id/branches, users, roles, roles/permissions; currencies, units, tax-rates, categories, payment-terms (+PUT bulk), sales-persons, locations; document-series (+/for, /:id/preview, /doc-types); custom-fields (+/module/:m, /:id/options); contacts (+/search, /next-serial, /:id/summary); accounts (+/sub-types); products (+/search); inventory/stock, stock/by-branch, history, lots, adjustments, transfers, product-transfers; journal/by-source, journal/balances; purchase/orders (+/open/:contactId), order-returns, bills (+/outstanding/:contactId), debit-notes (+/open/:contactId), payments (+/advances/:contactId); sales/estimates, orders (+/open/:contactId, /:id/cancel, /:id/returns), order-returns, invoices (+/outstanding/:contactId, /:id/followups), credit-notes (+/open/:contactId), payments (+/advances/:contactId).

## 18. Web components map ✅
`DataTable` (search/sort/paging/actions), `MasterPage` (config-driven list + modal for masters), `DocHeader` (firm/branch/series preview/date/ref), `PartySelect` (+ Create New in modal), `VariantPicker`, `LineGrid` (expand row, bulk action, pcs lock), `SummaryPanel`, `JournalSection`, `PartyDocForm` + `PartyDocDetail` (one config per doc type: PO, PO Return, Bill, DN, Estimate, SO, Invoice, CN), `Payments.tsx` (`VENDOR_PAY` / `CUSTOMER_PAY` configs), `ReturnStockModal`, `ContactForm`, `ProductForm`, `ChartOfAccountsPage`, `StockViewPage` (+History/FIFO modals), `BranchStockPage`.

## 19. Implementation status and phases

Done: **M1** foundation (auth, org, masters, series, custom fields); **M2** contacts, chart of accounts, products; **M3** ledger + FIFO, inventory documents, stock views; **M4** purchase cycle; **M5** sales cycle; deploy files (Dockerfiles, compose, nginx, GitHub Actions → Hostinger VPS 213.210.37.67, target http://ck.pratishthabridal.in).

### Phase 6 — Certified Products & list-screen power features
Certified Products screen (summary bar, filter panel, 58 columns, bulk On Hold / Purchase ▾ / Sale ▾ into documents, Update Sale Price/Discount, Save & Print Barcode, name template), custom fields rendered in product/contact forms and lists, Filter builder with saved filters, Customize Columns (per-user), Export xlsx/csv, list Import wizard (4 steps) and line-item Import from Excel (3 steps, rules §1.4), attachments upload (10 MB, after save), customer/vendor insight drawer, Scan SKU with camera.
Acceptance: select 3 stones → Purchase ▾ Bill → bill opens with 3 lines pcs 1 qty=carat; filters combine (Shape+Color+Clarity+carat range) and persist in saved filter; column layout persists per user; importing 5000-row template adds/updates lines per rules; barcode PDF prints SKU.

### Phase 7 — Print templates, documents actions, activity
Settings → Document Layouts (cards, presets, default/regulated, create/duplicate/import), HTML→PDF renderer with the three layouts (§11) for every doc type incl. Payment Slip, Print ▾/PDF ▾/XLS ▾ menus, "PDF Template: … Change" on detail, Email and WhatsApp send (with attachment), Activity log + Audit trail page, Cancel with reversal for all documents, edit of posted documents (re-post), Proforma Invoice, notifications (bell) incl. follow-up reminders and @mentions.
Acceptance: each doc type renders default + classic + boxed templates matching §1.6/§11 fields; regulated series only offer regulated templates; editing an open bill re-posts stock/journal atomically; cancelled payment reverses AP and reopens the bill; activity shows create/edit/email events.

### Phase 8 — Jewellery
Designs (+costing report), Labour, Rate Templates, Jewellery Products (single + Multi, purchased/manufactured), Manufacturing Issue → Receive (material consumption, vendor material, customer metal, labour cost via rate template; finished piece into stock), Material Recovery / Dispose, Customer Metal receipts + balances (fine weight ledger), Vendor Material issue/return ledger, jewellery Stock Views, Jewellery Issue/Receive print docs.
Acceptance: issue design materials to vendor → receive finished piece → piece stock IN at materials cost + labour; customer metal used in a job reduces the customer's fine-weight balance and never enters inventory; recovery returns component materials to stock and books loss; reports reconcile to journal.

### Phase 9 — Lab, Production, Transactions, Banking, Reports
Lab Issue/Return staged workflow (ready → result → recheck → returned; attributes update the stone; lab cost capitalised), Production report, manual journals, expenses, opening balances, bank accounts + reconciliation, full report suite (§10) with the standard report layout and exports, GST returns summaries, TDS/TCS reports, ageing.
Acceptance: trial balance nets to zero for any date range; ageing buckets match invoice balances; product history equals stock view totals; GSTR-1 totals equal Σ output tax on open/paid invoices in period.

### Phase 10 — Dashboard, polish, ops
Accounting dashboard (§13) computed from journal/stock, Home widgets, performance (indexes, pagination everywhere, query limits), role-based menu hiding, mobile-responsive lists/forms, HTTPS (Caddy) on the VPS, DB backups, admin password change, multi-role users, negative-stock setting, configurable inventory valuation switch (net vs gross).
Acceptance: dashboard loads < 1.5 s on 100k journal lines; all screens usable at 390 px width; nightly pg_dump; production login with changed admin password over HTTPS.

## 20. Deployment ✅ (files) / ⏳ (first run)
`docker-compose.prod.yml` (db postgres16, api Fastify :4000, web nginx :${WEB_PORT:-80} proxying /api). `.github/workflows/deploy.yml` on push to main: SSH (appleboy/ssh-action) to VPS using secrets `VPS_HOST, VPS_USER, VPS_PASSWORD, DB_PASSWORD, JWT_SECRET, APP_URL`; installs docker if missing; clones/pulls to `/opt/erp`; writes `.env`; picks port 80 if free else 8085; `docker compose up -d --build`; `drizzle-kit push --force`; idempotent seed. DNS: A record `ck` → 213.210.37.67. HTTPS: Caddy reverse proxy (deploy/README.md).

## 21. Open items / not captured in the reference (decide when screens arrive)
Manufacturing Receive screen; Jewellery Products (Multi) modal; Transactions submenu (Journal, Expenses) and Banking screens; Reports list; Settings pages (Organization, Users & Roles, Customization, Accounting Setup General/Opening Balance/Terms, Diamond Accounting, Jewellery Setting, Taxes & Compliance, Inventory, Storefront); Package / Shipment documents; Debit-note "pick bill lines" list modal; Bulk Action full field list; Stock Adjustment "Value" mode behaviour; POS; price lists; "Convert to Purchase" (buyback) flow from certified/invoice; Estimate → SO/Invoice conversion UI; Shipping Charges dropdown options; Customize-columns full lists per module.
