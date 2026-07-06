# Hisab v3 — Business Management App

Android business management app built with **Expo SDK 54** and **SQLite**. All data stays on your device.

**Current version:** `3.1.2` (Android `versionCode` 6)

## What's in v3

- **Financial year settings** — Pick FY year and start month; app auto-advances to the current FY and syncs reports
- **Growth dashboard** — Net worth, monthly profit charts, equity trend
- **Other income** — Track non-sales income separately
- **Fixed assets & investments** — Balance sheet assets beyond inventory
- **App lock** — PIN and optional biometric unlock
- **Excluded accounts** — Hide accounts from totals without deleting them
- **Form drafts** — Resume interrupted sale/purchase/expense entries
- **Whole-rupee display** — Amounts shown in ₹ without paise
- **Invoicing prefixes** — Custom sale/purchase invoice prefixes in Settings
- **Backup & restore** — SAF folder backup, full zip export/import, daily auto-backup with WAL checkpoint
- **Data safety** — Corrupt DB never auto-wiped; restore-first recovery; paid amounts reconciled from payment rows

## Features

- **Sidebar navigation** — Dashboard, Sales, Purchases, Inventory, Banking, Balance Sheet, Growth, Reports, Settings
- **SQLite database** — Local-first storage (schema v17)
- **Dashboard** — Sold, Purchased, Gross Profit, Net Profit, Expense, Total Liquid, Receivable (month/FY picker)
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
npm run typecheck   # TypeScript
npm run lint        # ESLint
npm test            # Unit tests (money, format, backup, financials)
```

## Build APK (EAS)

Requires [Expo EAS CLI](https://docs.expo.dev/build/setup/) and an Expo account:

```bash
cd hisab
npm install -g eas-cli
eas login
eas build:configure   # first time only — links Expo project
```

**Preview APK** (internal testing):

```bash
npm run build:apk
# or: eas build -p android --profile preview
```

**Production APK**:

```bash
npm run build:apk:prod
# or: eas build -p android --profile production
```

Download the `.apk` from the EAS build page when the build finishes.

### Local debug APK (no EAS account)

Requires Android SDK and JDK 17:

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
npx expo prebuild --platform android
cd android
.\gradlew assembleDebug
```

APK output: `android/app/build/outputs/apk/debug/app-debug.apk`

### Version bumps

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
- EAS Build (APK)

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Expo dev server |
| `npm run android` | Run on Android device/emulator |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm test` | Jest unit tests |
| `npm run build:apk` | EAS preview APK |
| `npm run build:apk:prod` | EAS production APK |
