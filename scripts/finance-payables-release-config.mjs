import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const PAYABLE_RELEASE_FLAGS = ['NESTFINANCE_PAYABLES_WRITE_ENABLED', 'NESTFINANCE_PAYABLES_REVIEW_ENABLED'];

// The reviewed release may change only these two product switches. Every other
// runtime field, secret reference, IAM binding and traffic tag stays compared.
export function expectedPayablesReleaseConfiguration(baseline) {
  const result = structuredClone(baseline);
  const container = result.runtime.containers[0];
  container.env = [
    ...(container.env ?? []).filter(item => !PAYABLE_RELEASE_FLAGS.includes(item.name)),
    ...PAYABLE_RELEASE_FLAGS.map(name => ({name, value: 'true'})),
  ].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = process.argv[2];
  if (!path || process.argv.length !== 3) throw Error('Expected one normalized baseline path');
  fs.writeFileSync(path, JSON.stringify(expectedPayablesReleaseConfiguration(JSON.parse(fs.readFileSync(path, 'utf8')))));
}
