# Bug memory (open/rejected PRs only)

| Date | Bug | PR | Status |
|------|-----|-----|--------|
| 2026-07-09 | `databaseHasUserData` ignored `transactions`, blocking folder backups when books had only opening balances / banking activity | https://github.com/sudosiam/hisab/pull/1 | **fixed in v8.0.0** (`hasUserDataFromCounts` + tests) |
| 2026-07-09 | Legacy transfer delete could remove wrong pair when duplicate same-day amounts | https://github.com/sudosiam/hisab/pull/2 | **fixed in v8.0.0** (`pickLegacyTransferPair` throws on ambiguity + `ensureTransferReferenceLinks`) |
| 2026-07-09 | Backup and restore could run concurrently; WAL snapshot race | https://github.com/sudosiam/hisab/pull/3 | **fixed in v8.0.0** (`withDbMaintenanceLock` unified semaphore + `invalidateDatabase`) |
| 2026-07-09 | Orphan invoice cleanup could mass-delete on partial restore | https://github.com/sudosiam/hisab/pull/4 | **fixed in v8.0.0** (empty item-table guard in `cleanupOrphanInvoiceHeaders`) |
| 2026-07-09 | Legacy payment delete could unlink wrong payment row | https://github.com/sudosiam/hisab/pull/5 | **fixed in v8.0.0** (`pickLegacyPaymentMatch` + `ensureTransactionPaymentLinks`) |
