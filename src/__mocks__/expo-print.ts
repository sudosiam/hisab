export async function printToFileAsync(): Promise<{ uri: string }> {
  return { uri: 'file:///tmp/mock-report.pdf' };
}

export async function printAsync(): Promise<void> {}
