const store: Record<string, string> = {};

let available = true;
let setShouldFail = false;

export function __resetSecureStoreMock(options?: {
  available?: boolean;
  setShouldFail?: boolean;
}): void {
  for (const key of Object.keys(store)) delete store[key];
  available = options?.available ?? true;
  setShouldFail = options?.setShouldFail ?? false;
}

export async function isAvailableAsync(): Promise<boolean> {
  return available;
}

export async function getItemAsync(key: string): Promise<string | null> {
  return store[key] ?? null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (setShouldFail) throw new Error('SecureStore write failed');
  store[key] = value;
}

export async function deleteItemAsync(key: string): Promise<void> {
  delete store[key];
}
