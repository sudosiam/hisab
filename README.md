# Hisab — Business Management App

Android business management app built with **Expo SDK 54** and **SQLite**. All data stays on your device.

**Current version:** `7.0.0` (Android `versionCode` 17)

## What's in Hisab

- **Full offline accounting** — Sales, purchases, inventory, banking, parties, reports
- **Financial year settings** — FY picker with auto-advance; all reports stay in sync
- **Growth dashboard** — Net worth, monthly profit charts, equity trend
- **Other income & fixed assets** — Complete balance sheet beyond inventory
- **Backup & restore** — Daily auto-backup of the database file to a chosen folder, plus manual export/restore, all WAL-checkpointed
- **Data safety** — Corrupt DB never auto-wiped; restore-first recovery; payment amounts reconciled from ledger rows
- **Unit tests** — Money, format, and financial calculations

## What's new in 7.0.0 — reliability release

Full audit of every screen, service, and the SQLite layer, focused on making the books trustworthy for real business use:

**Data integrity (SQLite layer)**
- Startup orphan-transaction cleanup now reverses each orphan's effect on the account balance before deleting it, so cash/bank balances can no longer drift from the ledger
- A database whose `schema_version` marker is missing but which still contains business data is never rebuilt (previously this wiped all tables); the app now asks you to restore from backup instead
- Deleting a party now also checks invoices linked by `party_id`, not just by name
- Recent Activity no longer lists empty/corrupt invoice headers

**Money math & input parsing**
- All amount fields now parse comma-grouped input correctly (`5,000` used to be read as `5`)
- Input prefills preserve paise and sign — editing a sale with a ₹10.75 discount no longer silently rounds it to ₹11 on save
- Transfers and withdrawals can no longer overdraw an account by ₹0.01
- Report footer totals are rounded consistently with row amounts

**Safer workflows**
- Double-tapping Save on a new sale/purchase can no longer create duplicate invoices
- "Restore from backup folder" (Settings and the boot-error screen) now requires explicit confirmation before replacing your data
- Deleting a ledger transaction that backs a recurring expense template is blocked with a clear message (delete it from Expenses instead)
- Recurring expenses stop auto-posting to deactivated accounts
- Payment rows with invalid/negative amounts are rejected instead of silently dropped
- Editing a sale's discount/service charges below the amount already paid is caught before save
- Loans: outstanding amount can no longer exceed principal; Cancel button shown while editing
- Bank transfer screen validates account selection before submitting
- Sale/purchase detail screens no longer wipe a half-typed payment amount when you switch apps and come back
- Account detail "Money In" no longer double-counts the opening balance
- Balance sheet, receivables, payables, and inventory reports refresh automatically after data changes elsewhere
- Dashboard pull-to-refresh surfaces errors instead of silently showing stale numbers

## Features

- **Sidebar navigation** — Dashboard, Sales, Purchases, Inventory, Banking, Balance Sheet, Growth, Reports, Settings
- **SQLite database** — Local-first storage (schema v22)
- **Dashboard** — Sold, Purchased, Gross Profit, Net Profit, Expense, Total Liquid, Receivable
- **Sales & Purchases** — Paid/unpaid lists, split payments, invoice detail with add payment
- **Inventory** — Weighted average cost, opening stock, movement history
- **Banking** — Cash/bank accounts, expenses, transfers, transaction ledger
- **Parties** — Customers/suppliers with statements and balances
- **Reports** — Sales, Purchases, Inventory, P&L, Receivables, Payables

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

## Build APK locally

Requires Android SDK and JDK 17:

```powershell
cd hisab
npm run verify
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
npx expo prebuild --platform android --no-install
cd android
.\gradlew assembleRelease
```

APK output: `android/app/build/outputs/apk/release/app-release.apk`

## Build APK (EAS cloud)

```bash
npm run verify          # run first — must pass before every release
npm run build:apk:prod  # EAS cloud production APK
# or locally:
npm run build:apk:local # prebuild + assembleRelease
```

## Version bumps

Keep these in sync when releasing:

| File | Field |
|------|--------|
| `app.json` | `expo.version`, `android.versionCode`, `ios.buildNumber` |
| `package.json` | `version` |

Settings → About reads `app.json` via `expo-constants`.

## First Steps

1. Open **Inventory** → add products with opening stock
2. **Banking** includes default Cash and Bank accounts
3. Create **Purchases** and **Sales**
4. **Settings** → set financial year and backup folder

## Tech Stack

- Expo SDK 54 / React Native 0.81
- expo-router (drawer sidebar)
- expo-sqlite
- expo-file-system (SAF backup on Android)
- Jest unit tests

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Expo dev server |
| `npm run android` | Run on Android device/emulator |
| `npm run verify` | Full pre-release check |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm test` | Jest unit tests |
| `npm run build:apk` | EAS preview APK |
| `npm run build:apk:prod` | EAS production APK |
