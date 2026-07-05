import {
  createParty,
  deleteParty,
  getParties,
  searchPartyNames,
  syncPartiesFromTransactions,
  updateParty,
  upsertParty,
} from './parties';

export { upsertParty as upsertCustomer, syncPartiesFromTransactions as syncCustomersFromSales };

export async function searchCustomers(query: string): Promise<string[]> {
  return searchPartyNames(query, 'customer');
}

export async function searchVendors(query: string): Promise<string[]> {
  return searchPartyNames(query, 'vendor');
}

export {
  createParty,
  deleteParty,
  getParties,
  searchPartyNames,
  syncPartiesFromTransactions,
  updateParty,
  upsertParty,
};
