# Bug memory (open/rejected PRs only)

| Date | Bug | PR | Status |
|------|-----|-----|--------|
| 2026-07-09 | `databaseHasUserData` ignored `transactions`, blocking folder backups when books had only opening balances / banking activity | https://github.com/sudosiam/hisab/pull/1 | open |
| 2026-07-09 | Legacy transfer delete used nearest-id fallback and could remove wrong pair when duplicate same-day amounts, corrupting account balances | https://github.com/sudosiam/hisab/pull/2 | open |
| 2026-07-09 | Backup and restore could run concurrently; checkpoint-then-read could miss commits still in WAL | https://github.com/sudosiam/hisab/pull/3 | open |
| 2026-07-09 | Orphan invoice cleanup could mass-delete all sales/purchases when line-item tables were empty (partial restore) | https://github.com/sudosiam/hisab/pull/4 | open |
| 2026-07-09 | Legacy sale/purchase payment delete used `ORDER BY id DESC` and could unlink wrong payment when duplicates shared date/amount | https://github.com/sudosiam/hisab/pull/5 | open |
