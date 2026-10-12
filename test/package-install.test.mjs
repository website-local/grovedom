import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockProcessEnv } from './mock-process.mjs';

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version;
const commit = 'a'.repeat(40);
for (const scenario of ['bytes', 'checksum', 'integrity', 'commit', 'path', 'version']) {
  test(`offline installation rejects ${scenario} before npm or consumer creation`, t => {
    const root = mkdtempSync(join(tmpdir(), 'grovedom-install-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const temporary = join(root, 'temporary');
    mkdirSync(temporary);
    const packages = ['grovedom', 'grovedom-native'].map(name => {
      const bytes = Buffer.from(name), file = `${name}-${version}.tgz`;
      writeFileSync(join(root, file), bytes);
      return { name, version, file, sha256: createHash('sha256').update(bytes).digest('hex'),
        integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64') };
    });
    if (scenario === 'bytes') writeFileSync(join(root, packages[0].file), 'changed');
    if (scenario === 'integrity') packages[0].integrity = 'sha512-invalid';
    if (scenario === 'path') packages[0].file = '../outside.tgz';
    if (scenario === 'version') packages[0].version = '0.0.0';
    writeFileSync(join(root, 'release.json'), JSON.stringify({ commit: scenario === 'commit' ? 'b'.repeat(40) : commit, packages }));
    writeFileSync(join(root, 'SHA256SUMS'), scenario === 'checksum' ? 'wrong\n' : packages.map(row => `${row.sha256}  ${row.file}\n`).join(''));
    const log = join(root, 'npm-called');
    const fake = join(root, 'npm.mjs');
    writeFileSync(fake, `import { writeFileSync } from 'node:fs'; writeFileSync(process.env.MOCK_NPM_LOG, 'called'); process.exit(17);\n`);
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/ci/install.mjs', import.meta.url)), root, 'both'], {
      encoding: 'utf8', env: mockProcessEnv({ TMPDIR: temporary, TMP: temporary, TEMP: temporary,
        npm_execpath: fake, GITHUB_SHA: commit, MOCK_NPM_LOG: log }),
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, result.stderr);
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(log), false, 'Unverified tarballs reached npm');
    assert.deepEqual(readdirSync(temporary), [], 'Unverified input created a consumer');
  });
}
