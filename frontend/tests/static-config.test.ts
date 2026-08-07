import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';


const ROOT = path.resolve(__dirname, '..');

describe('GitHub Pages configuration', () => {
  it('exports under the repository base path without FastAPI rewrites', () => {
    const config = fs.readFileSync(path.join(ROOT, 'next.config.js'), 'utf8');
    expect(config).toContain("output: 'export'");
    expect(config).toContain("basePath: isProduction ? '/talent-graph' : ''");
    expect(config).toContain('trailingSlash: true');
    expect(config).toContain('unoptimized: true');
    expect(config).not.toContain('rewrites');
    expect(config).not.toContain('127.0.0.1:8000');
  });

  it('exposes the administrator data import route', () => {
    expect(fs.existsSync(path.join(ROOT, 'app', '(main)', 'import', 'page.tsx'))).toBe(true);
  });
});
