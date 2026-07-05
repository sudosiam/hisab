# Hisab — Business Management App

Android business management app built with **Expo SDK 54** and **SQLite**. Run it in **Expo Go** on your phone.

## Features

- **Sidebar navigation** — Dashboard, Sales, Purchases, Inventory, Banking, Balance Sheet, Reports, Settings
- **SQLite database** — All data stored locally on device
- **Auto backup** — Copy database to a folder you choose (Settings)
- **Dashboard** — Sold, Purchased, Gross Profit, Net Profit, Expense, Total Liquid, Receivable (month picker)
- **Sales** — Paid/unpaid list, new sale with split payments, detail page with add payment
- **Purchases** — Same flow as sales
- **Inventory** — Weighted average cost, opening stock, movement history
- **Banking** — Cash/Bank accounts linked to all payments, expense entry, transaction ledger
- **Balance Sheet** — Assets, liabilities, equity
- **Reports** — Sales, Purchases, Inventory, P&L, Receivables, Payables

## Quick Start

```bash
cd hisab
npm install
npx expo start
```

Scan the QR code with **Expo Go** (SDK 54) on Android.

## First Steps

1. Open **Inventory** → add products with opening stock
2. **Banking** already has Cash and Bank accounts (add expenses from Banking)
3. Create **Purchases** and **Sales**
4. Go to **Settings** → choose backup folder → enable auto backup

## Tech Stack

- Expo SDK 54 / React Native 0.81
- expo-router (drawer sidebar)
- expo-sqlite
- expo-file-system (SAF backup on Android)
