export const cacheDirectory = '/tmp/';
export const EncodingType = { Base64: 'base64' };

export const StorageAccessFramework = {
  readDirectoryAsync: async () => [],
};

export async function getInfoAsync() {
  return { exists: false };
}

export async function readAsStringAsync() {
  return '';
}

export async function writeAsStringAsync() {}
export async function makeDirectoryAsync() {}
export async function deleteAsync() {}
export async function copyAsync() {}
