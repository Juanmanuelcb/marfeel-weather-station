import { describe, it, expect } from 'vitest';
import { isStale } from './staleness';

describe('isStale', () => {
	const now = Date.parse('2026-07-01T12:00:30Z');

	it('flags a device silent past the threshold', () => {
		expect(isStale('2026-07-01 12:00:00', now, 15000)).toBe(true);
	});

	it('keeps a recently-seen device fresh', () => {
		expect(isStale('2026-07-01 12:00:25', now, 15000)).toBe(false);
	});

	it('returns false for an unparseable timestamp', () => {
		expect(isStale('not-a-date', now, 15000)).toBe(false);
	});
});
