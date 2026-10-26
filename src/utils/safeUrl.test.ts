import assert from 'node:assert/strict';
import test from 'node:test';
import { safeExternalUrl } from './safeUrl';

test('safeExternalUrl keeps http and https links', () => {
  assert.equal(safeExternalUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(safeExternalUrl(' http://example.com '), 'http://example.com/');
});

test('safeExternalUrl drops script, data and relative urls', () => {
  assert.equal(safeExternalUrl('javascript:alert(1)'), undefined);
  assert.equal(safeExternalUrl(' JaVaScRiPt:alert(1)'), undefined);
  assert.equal(safeExternalUrl('data:text/html,<script>alert(1)</script>'), undefined);
  assert.equal(safeExternalUrl('/relative'), undefined);
  assert.equal(safeExternalUrl(42), undefined);
});
