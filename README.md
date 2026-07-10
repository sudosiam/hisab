# Hisab — Business Management App

Android business management app built with **Expo SDK 54** and **SQLite**. All data stays on your device.

**Current version:** `8.1.0` (Android `versionCode` 20)

## What's in Hisab

- **Full offline accounting** — Sales, purchases, inventory, banking, parties, reports
- **Double-entry general ledger** — Journal entries with balance enforcement; debounced rebuild after writes
- **Financial year settings** — FY picker with auto-advance; all reports stay in sync
- **Growth dashboard** — Net worth, monthly profit charts, equity trend
- **Other income, loans & fixed assets** — Complete balance sheet beyond inventory
- **Backup & restore** — Daily auto-backup with WAL checkpoint; exclusive backup/restore lock
- **Data safety** — Corrupt DB never auto-wiped; restore-first recovery; integrity repair on boot
- **Automated tests** — 35 unit + integration tests (money, payments, sale/purchase flows)

## What's new in 8.1.0

**Bill of Supply (BOS)**
- Sales support Invoice and Bill of Supply as separate document types
- Independent BOS numbering sequence and prefix (Settings → Next BOS number)
- Type badges and filters on sales list; labels on party history, reports, and PDFs
- Ledger journal descriptions distinguish Invoice vs Bill of Supply (amounts unchanged)
- Schema v24 — `sales.invoice_type` with safe migration (existing rows default to invoice)

## What's new in 8.0.0

**Ledger & reports**
- General ledger, trial balance, day book, cash flow, customer/vendor statements (with PDF export)
- Expanded reports hub — P&L, receivables, payables, expense categories, operational summaries
- Ledger refresh scheduled after every sale/purchase write (create, edit, add/remove payment) — no more stale GL after common actions

**Mobile performance**
- Post-save work no longer runs a full integrity repair + ledger rebuild on every tap — debounced 400ms coalesced refresh keeps saves responsive on large books

**Data integrity (fixes from audit PRs #1–#5)**
- Backup guard counts `transactions` — opening-balance-only books back up correctly
- Legacy transfer delete throws on ambiguous pairs instead of corrupting balances
- Backup and restore serialized via unified maintenance lock; WAL checkpoint before snapshot
- Orphan invoice cleanup guarded when line-item tables are empty (partial restore)
- Legacy payment delete uses strict `payment_id` matching with backfill migration

**Invoice payments**
- **Remove payment** button on sale and purchase detail screens — no Banking workaround needed
- `removeSalePayment` / `removePurchasePayment` delete by payment ID with account balance + status sync

**UX polish**
- Unsaved-changes guards on edit screens; iOS keyboard Done bar; form drafts on new sale/purchase
- Human-readable dates on lists; loading states on P&L, cash flow, and statement reports
- Drawer uses `router.navigate` (no stack replace freeze); boot restore requires typing `IMPORT`

**Testing**
- Integration tests: sale/purchase create → stock → cash → payment add/remove (in-memory SQLite via `better-sqlite3`)
- `npm run verify` — typecheck + lint + 35 tests

## Features

- **Sidebar navigation** — Dashboard, Sales, Purchases, Inventory, Banking, Balance Sheet, Growth, Reports, Settings
- **SQLite database** — Local-first storage (schema v24)
- **Dashboard** — Revenue, purchases, profit, expense, liquid cash, receivable, payable, inventory, net worth
- **Sales & Purchases** — Paid/unpaid lists, split payments, edit with stock checks, invoice detail with add/remove payment
- **Inventory** — Weighted average cost, opening stock, movement history, soft-delete when referenced
- **Banking** — Cash/bank accounts, expenses (incl. recurring), transfers, transaction ledger
- **Parties** — Customers/suppliers with statements and balances
- **Reports** — P&L, cash flow, trial balance, general ledger, day book, receivables, payables, sales/purchase/inventory summaries, party statements (PDF)

## Quick Start (development)

```bash
cd hisab
npm install
npx expo start
```

Scan the QR code with **Expo Go** (SDK 54) on Android, or press `a` for an emulator.

## Quality checks

```bash
npm run verify    # typecheck + lint + tests (run before every release)
npm run typecheck
npm run lint
npm test
```

## Install APK (release build)

After building, copy the APK to `releases/` for distribution (APKs are gitignored). Install on your phone from that folder or share directly.

```powershell
adb install "android\app\build\outputs\apk\release\app-release.apk"
```

## Build APK locally

Requires Android SDK and JDK 17:

```powershell
cd hisab
npm run verify
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
npm run build:apk:local
```

APK output: `android/app/build/outputs/apk/release/app-release.apk`

## Build APK (EAS cloud)

```bash
npm run verify          # run first — must pass before every release
npm run build:apk:prod  # EAS cloud production APK
```

## Version bumps

Keep these in sync when releasing:

| File | Field |
|------|--------|
| `app.json` | `expo.version`, `android.versionCode`, `ios.buildNumber` |
| `package.json` | `version` |
| `src/constants/appVersion.ts` | fallback string (optional) |

Settings → About reads `app.json` via `expo-constants`.

## First Steps

1. Open **Inventory** → add products with opening stock
2. **Banking** includes default Cash and Bank accounts
3. Create **Purchases** and **Sales**
4. **Settings** → set financial year and backup folder

## Tech Stack

- Expo SDK 54 / React Native 0.81
- expo-router (drawer sidebar)
- expo-sqlite (schema v24, 24 migrations)
- expo-file-system (SAF backup on Android)
- Jest — unit + integration tests (`better-sqlite3` harness)

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Expo dev server |
| `npm run android` | Run on Android device/emulator |
| `npm run verify` | Full pre-release check |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm test` | Jest (unit + integration) |
| `npm run build:apk` | EAS preview APK |
| `npm run build:apk:prod` | EAS production APK |
| `npm run build:apk:local` | Local prebuild + assembleRelease |

## Known limits

- Money stored as SQLite `REAL` (rupees); `roundMoney()` used throughout — not integer paise columns
- No receivables/payables aging buckets (flat outstanding lists only)
- Loans are manual balance-sheet memos — not linked to banking repayments
- General Ledger UI running-balance column not implemented (always shows 0)
