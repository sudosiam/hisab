# Hisab v4 — Business Management App (Final)

Android business management app built with **Expo SDK 54** and **SQLite**. All data stays on your device.

**Current version:** `4.0.0` (Android `versionCode` 8)

## What's in v4

- **Full offline accounting** — Sales, purchases, inventory, banking, parties, reports
- **Financial year settings** — FY picker with auto-advance; all reports stay in sync
- **Growth dashboard** — Net worth, monthly profit charts, equity trend
- **Other income & fixed assets** — Complete balance sheet beyond inventory
- **App lock** — PIN + optional biometric unlock; 30s grace when switching apps
- **Backup & restore** — SAF folder backup, full zip export/import, daily auto-backup with WAL checkpoint
- **Data safety** — Corrupt DB never auto-wiped; restore-first recovery; payment amounts reconciled from ledger rows
- **Attachments** — Photos and PDFs on sales and purchases
- **Unit tests** — Money, format, backup, and financial calculations

## Features

- **Sidebar navigation** — Dashboard, Sales, Purchases, Inventory, Banking, Balance Sheet, Growth, Reports, Settings
- **SQLite database** — Local-first storage (schema v17)
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

Download **`releases/Hisab-v4.0.0-final-release.apk`** from this repo, copy to your phone, and install.

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
npm install -g eas-cli
eas login
eas build:configure   # first time only
npm run build:apk:prod
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
4. **Settings** → set financial year, backup folder, optional PIN lock

## Tech Stack

- Expo SDK 54 / React Native 0.81
- expo-router (drawer sidebar)
- expo-sqlite
- expo-file-system (SAF backup on Android)
- expo-local-authentication (biometric unlock)
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
