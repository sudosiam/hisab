# Hisab v2 — Business Management App

Android business management app built with **Expo SDK 54** and **SQLite**. All data stays on your device.

**Current version:** `2.0.0` (Android `versionCode` 2)

## What’s in v2

- **Financial year settings** — Pick FY year and start month; app auto-advances to the current FY and syncs reports
- **Growth dashboard** — Net worth, monthly profit charts, equity trend
- **Other income** — Track non-sales income separately
- **Fixed assets & investments** — Balance sheet assets beyond inventory
- **App lock** — PIN and optional biometric unlock
- **Excluded accounts** — Hide accounts from totals without deleting them
- **Form drafts** — Resume interrupted sale/purchase/expense entries
- **Whole-rupee display** — Amounts shown in ₹ without paise
- **Invoicing prefixes** — Custom sale/purchase invoice prefixes in Settings
- **Backup & restore** — Folder backup, export/import, daily auto-backup

## Features

- **Sidebar navigation** — Dashboard, Sales, Purchases, Inventory, Banking, Balance Sheet, Growth, Reports, Settings
- **SQLite database** — Local-first storage
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

## Build APK (EAS)

Requires [Expo EAS CLI](https://docs.expo.dev/build/setup/) and an Expo account:

```bash
cd hisab
npm install -g eas-cli
eas login
eas build:configure   # first time only
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

### Version bumps

Keep these in sync when releasing:

| File | Field |
|------|--------|
| `app.json` | `expo.version`, `android.versionCode`, `ios.buildNumber` |
| `package.json` | `version` |

Settings → About reads `app.json` via `expo-constants`.

## Push to GitHub

```bash
cd hisab
git add -A
git commit -m "Release v2.0.0"
git push origin master
```

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
| `npm run build:apk` | EAS preview APK |
| `npm run build:apk:prod` | EAS production APK |
