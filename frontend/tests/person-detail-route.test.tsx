import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { externalHttpHref, personDetailHref } from '@/lib/routes';

const ROOT = path.resolve(__dirname, '..');

describe('static person-detail route', () => {
  it('uses a query-string detail route and removes the dynamic route', () => {
    const detail = path.join(ROOT, 'app', '(main)', 'persons', 'detail', 'page.tsx');
    expect(fs.existsSync(detail)).toBe(true);
    expect(fs.readFileSync(detail, 'utf8')).toContain('useSearchParams');
    expect(fs.existsSync(path.join(ROOT, 'app', '(main)', 'persons', '[id]', 'page.tsx'))).toBe(false);
  });

  it('centralizes safe person links', () => {
    const routes = fs.readFileSync(path.join(ROOT, 'lib', 'routes.ts'), 'utf8');
    expect(routes).toContain('personDetailHref');
    expect(routes).toContain('encodeURIComponent');
    expect(personDetailHref('a&b')).toBe('/persons/detail?id=a%26b');
    expect(externalHttpHref('javascript:alert(1)')).toBeUndefined();
    expect(externalHttpHref('https://example.com/profile')).toBe('https://example.com/profile');
  });
});
