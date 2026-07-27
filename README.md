# Hisab — Offline MSME Accounting

Android-first offline accounting app built with **Expo SDK 54** and **SQLite**. Books stay on the device. Optional private cloud backup via Supabase (TLS + private storage — not multi-device sync).

**Current version:** `10.7.0` (Android `versionCode` 37 · schema v28)

## What's in Hisab

- **Offline accounting** — Sales (Invoice / Bill of Supply), purchases, inventory, banking, parties, expenses, other income
- **Payments** — Money in/out with against-invoice, advance, and on-account allocation
- **Double-entry ledger** — Scoped journal re-post after writes (full rebuild on migrations); P&L, balance sheet, growth
- **BOS** — Separate Bill of Supply document series and numbering (no GST tax engine)
- **Tally XML** — Import/export sales, purchases, parties, receipts, and payments
- **PDF & WhatsApp** — Invoice/BOS and ledger PDFs; WhatsApp share opens the party number when available (native build)
- **Backup** — Local SAF daily backup + optional cloud snapshot; delete cloud data from Settings
- **Dashboard** — Accrual / Cash period view toggle in the header

## What's new in 10.7.0

**GST removed (keep BOS)**
- GST UI, reports, GSTR helpers, and tax computation removed; Invoice vs Bill of Supply remains
- Legacy tax columns retained in SQLite for old backup compatibility (new writes store zero tax)

**Dashboard**
- Accrual / Cash mode toggle in the header (period revenue, purchases, and profit)

**Ops & reliability**
- Scoped ledger refresh after writes; personal cloud owner email lock
- CI `verify` workflow; golden-book and cloud auth tests

## What's new in 10.6.0

- FIFO allocation when Tally omits `BILLALLOCATIONS`; duplicate voucher keys respect type family
- Cash/Bank Payment voucher types; GST state normalize / infer from parties
- Party-scoped bill lookup prefers open invoices (safe with duplicate numbers)

## What's new in 10.5.0

- Reliability pass (DB re-init, ledger coalesce, deferred integrity repair)
- Skeletons, haptics toggle, delete cloud backup, stronger payment badges

## Features

- Drawer — Home · Trading (Sales, Purchases, Inventory, Adjustments) · Cash & parties · Books · Capital · App
- SQLite local-first storage (schema v28)
- Split payments, negative stock allowed, weighted-average COGS
- Reports — P&L, cash flow, trial balance, GL, day book, receivables/payables, party ledgers (PDF)
- Financial year settings with period sync across screens

## Quick Start (development)

```bash
cd hisab
npm install
npm run start:offline
```

Or on Windows: `powershell -File .\scripts\start-expo.ps1`

**Open on phone (Expo Go, same Wi‑Fi):** enter `exp://<your-PC-LAN-IP>:8081` (e.g. `exp://192.168.1.5:8081`). Use Expo Go matching SDK 54. Prefer a **native APK / dev build** for WhatsApp share, haptics, and background backup — Expo Go is best-effort.

## Quality checks

```bash
npm run verify    # typecheck + lint + tests — run before every release
```

CI runs the same command on push/PR (`.github/workflows/verify.yml`).

For personal cloud backup, set `EXPO_PUBLIC_CLOUD_OWNER_EMAIL` in `.env` (and EAS env) so only your email can sign in.

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
Copy-Item "android\app\build\outputs\apk\release\app-release.apk" "releases\hisab-10.7.0.apk" -Force
adb install -r "releases\hisab-10.7.0.apk"
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
3. Optionally set `EXPO_PUBLIC_CLOUD_OWNER_EMAIL` to lock sign-in to one account
4. Rebuild the app (env is baked in at build time)
5. Settings → Backup to sign in, upload, restore, or delete cloud data

Cloud backup is a full-database snapshot (last upload wins). Prefer local SAF folder backups as primary.

## First steps

1. **Inventory** — add products with opening stock  
2. **Banking** — default Cash / Bank accounts  
3. Create **Purchases** and **Sales** (Invoice or BOS)  
4. **Settings** — financial year, WhatsApp template, backup folder  

## Tech stack

- Expo SDK 54 / React Native 0.81 / expo-router
- expo-sqlite (schema v28)
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
- Cloud backup is a full DB snapshot from one device (last upload wins), not live multi-user sync; the snapshot leaves the device under your cloud login
- Cloud auth session is stored in SecureStore when available (AsyncStorage fallback in tests/web)
- Historical GST tax amounts may remain in SQLite columns for backup compatibility; new documents are untaxed. Ledger rebuild posts full document totals only (no GST accounts on Trial Balance).
