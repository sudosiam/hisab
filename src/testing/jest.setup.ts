import { resetLedgerRefreshSchedulerForTests } from '../services/ledger';

afterEach(() => {
  resetLedgerRefreshSchedulerForTests();
});
