import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Build-input integrity only; no checksums are added to the operation protocol.
export function sourceFingerprint(root) {
  const hash = createHash('sha256');
  function visit(relative) {
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      if (entry.name === '.git') continue;
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(name);
      else if (entry.isFile()) {
        const bytes = readFileSync(join(root, name));
        hash.update(`${name}\0${bytes.length}\0`);
        hash.update(bytes);
      } else throw new Error('The reviewed source tree must contain only regular files and directories.');
    }
  }
  visit('');
  return hash.digest('hex');
}
