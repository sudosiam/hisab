# Hisab — Business Management App

Android-first offline accounting app built with **Expo SDK 54** and **SQLite**. Books stay on the device; optional encrypted cloud backup via Supabase.

**Current version:** `10.6.0` (Android `versionCode` 36 · schema v26)

## What's in Hisab

- **Offline accounting** — Sales (Tax Invoice / BOS), purchases, inventory, banking, parties, expenses, other income
- **Payments** — Money in/out with against-invoice, advance, and on-account allocation
- **Double-entry ledger** — Journal rebuild after writes; P&L, balance sheet, growth, GST reports
- **Tally XML** — Import/export sales, purchases, parties, receipts, and payments
- **PDF & WhatsApp** — Invoice and ledger PDFs; WhatsApp share opens the party number when available (native build)
- **Backup** — Local SAF daily backup + optional cloud backup; delete cloud snapshot from Settings
- **Reliability** — DB init generation guard, deferred integrity repair, draft/haptic/skeleton UX polish

## What's new in 10.6.0

**Tally import accuracy**
- FIFO allocation when Tally omits `BILLALLOCATIONS` so receipts/payments clear open invoices
- Duplicate voucher key respects voucher type family (Receipt #1 ≠ Payment #1; Tax Invoice ≠ BOS)
- Cash/Bank Payment voucher types classified correctly
- Infer business GST state from party states when Settings is empty
- Normalize Tally state names / aliases (Orissa, Pondicherry, `&#4; Any`) to GST codes

**Correctness**
- Bill lookup scopes to the voucher party and prefers open invoices (safe with duplicate invoice numbers)
- Party/vendor state resolution never keeps invalid Tally placeholders for CGST/SGST vs IGST

## What's new in 10.5.0

**Reliability pass**
- Safe database re-init after restore/invalidate; ledger rebuild coalesce (no skipped rebuilds)
- Deferred financial integrity repair (avoids cold-start ANR on large books)
- Chunked cloud backup decode; balance sheet clamps negative stock qty
- Form draft save race fixed; dropdown blur/z-index coordination; date/product create modals
- Debounced product search / deferred GST / coalesced dashboard refresh

**UX**
- Skeleton loaders on dashboard and main lists
- Haptic feedback toggle (Settings → Appearance)
- Delete cloud backup in Settings → Backup
- Stronger payment status badge contrast

## What's new in 10.4.0

- Payment vouchers (receipt/payment) with advances and on-account
- Tally Receipt/Payment import-export + sample XML
- WhatsApp PDF share targeting party phone (requires native APK with `react-native-share`)

## Features

- Drawer navigation — Dashboard, Sales, Purchases, Payments, Inventory, Banking, Parties, Reports, Settings
- SQLite local-first storage (schema v26)
- Split payments, negative stock allowed, weighted-average COGS
- Reports — P&L, cash flow, trial balance, GL, day book, receivables/payables, GST, party ledgers (PDF)
- Financial year settings with period sync across screens

## Quick Start (development)

```bash
cd hisab
npm install
npx expo start
```

Use a **dev/production build** for native modules (WhatsApp share, haptics). Expo Go may fall back for those features.

## Quality checks

```bash
npm run verify    # typecheck + lint + tests — run before every release
```

## Build APK locally (production)

Requires Android SDK and JDK 17:

```powershell
cd hisab
npm run verify
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
npm run build:apk:local
```

APK output:

`android/app/build/outputs/apk/release/app-release.apk`

Copy into `releases/` for handoff (APKs are gitignored):

```powershell
New-Item -ItemType Directory -Force releases | Out-Null
Copy-Item "android\app\build\outputs\apk\release\app-release.apk" "releases\hisab-10.6.0.apk" -Force
adb install -r "releases\hisab-10.6.0.apk"
```

## Build APK (EAS cloud)

```bash
npm run verify
npm run build:apk:prod
```

## OTA updates (JS-only)

```bash
npm run update:prod
```

Native changes (new modules / `versionCode`) need a new APK build.

## Version bumps

Keep these in sync when releasing:

| File | Field |
|------|--------|
| `app.json` | `expo.version`, `android.versionCode`, `ios.buildNumber` |
| `package.json` | `version` |
| `src/constants/appVersion.ts` | fallback string |

## Cloud backup (optional)

1. Create a Supabase project and run `supabase/cloud-backup-setup.sql`
2. Copy `.env.example` → `.env` and set `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`
3. Rebuild the app (env is baked in at build time)
4. Settings → Backup to sign in, upload, restore, or delete cloud data

## First steps

1. **Inventory** — add products with opening stock  
2. **Banking** — default Cash / Bank accounts  
3. Create **Purchases** and **Sales**  
4. **Settings** — financial year, WhatsApp template, backup folder  

## Tech stack

- Expo SDK 54 / React Native 0.81 / expo-router
- expo-sqlite (schema v26)
- expo-print / expo-sharing / react-native-share
- Jest + `better-sqlite3` integration harness

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Expo dev server |
| `npm run verify` | Typecheck + lint + tests |
| `npm run build:apk:local` | Clean prebuild + assembleRelease |
| `npm run build:apk:prod` | EAS production APK |
| `npm run update:prod` | EAS Update → production channel |

## Known limits

- Money stored as SQLite `REAL` with `roundMoney()` — not integer-paise columns
- Tally import does not include expense/journal vouchers; imported Net Profit may differ from Tally P&L
- WhatsApp chat+PDF targeting needs a native APK (not Expo Go alone)
- Loans are balance-sheet memos — not linked to banking repayments
