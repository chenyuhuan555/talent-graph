import { describe, expect, it } from 'vitest';

import { personDetailHref } from '@/lib/routes';

describe('static navigation', () => {
  it('builds a GitHub Pages compatible person detail href', () => {
    expect(personDetailHref('abc-123')).toBe('/persons/detail?id=abc-123');
  });

  it('encodes identifiers before placing them in the query string', () => {
    expect(personDetailHref('person/a b')).toBe('/persons/detail?id=person%2Fa%20b');
  });
});
