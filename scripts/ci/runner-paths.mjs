import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.env.RUNNER_TEMP;
assert(root && process.env.GITHUB_ENV, 'Requires GitHub runner paths');
const values = {
  TMPDIR: root, TMP: root, TEMP: root,
  npm_config_cache: join(root, 'npm-cache'),
  XDG_CACHE_HOME: join(root, 'cache'),
  GROVEDOM_BUILD_DIR: join(root, 'grovedom/native'),
  GROVEDOM_WASM_BUILD_DIR: join(root, 'grovedom/wasm'),
  GROVEDOM_FUZZ_DIR: join(root, 'fuzz'),
};
appendFileSync(process.env.GITHUB_ENV, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''));
