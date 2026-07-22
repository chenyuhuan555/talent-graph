import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { assertSafeBuildArtifact } from '@/lib/build-artifact';

const ROOT = path.resolve(__dirname, '..');
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('static build artifact safety', () => {
  it('accepts the built Pages artifact with login and 404 pages', () => {
    expect(() => assertSafeBuildArtifact(path.join(ROOT, 'out'))).not.toThrow();
  });

  it('rejects business data and database secrets in an artifact', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'talent-graph-artifact-'));
    temporaryDirectories.push(directory);
    fs.mkdirSync(path.join(directory, 'login'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'login', 'index.html'), '<main>login</main>');
    fs.writeFileSync(path.join(directory, '404.html'), '<main>not found</main>');
    const secretLikeValue = ['sb', 'secret', '12345678901234567890'].join('_');
    fs.writeFileSync(path.join(directory, 'persons.json'), `SQLite format 3\u0000 postgresql://db ${secretLikeValue}`);

    expect(() => assertSafeBuildArtifact(directory)).toThrow('不安全的构建产物');
  });
});
