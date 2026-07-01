import { describe, it, expect } from 'vitest';
import { monotonePath, niceDomain } from './chart';

describe('monotonePath', () => {
	it('is empty for no points', () => {
		expect(monotonePath([])).toBe('');
	});

	it('falls back to a straight line for two points', () => {
		expect(
			monotonePath([
				{ x: 0, y: 0 },
				{ x: 5, y: 5 },
			]),
		).toBe('M0,0 L5,5');
	});

	it('builds a cubic path through the endpoints', () => {
		const d = monotonePath([
			{ x: 0, y: 10 },
			{ x: 10, y: 20 },
			{ x: 20, y: 5 },
		]);
		expect(d.startsWith('M0.0,10.0')).toBe(true);
		expect(d).toContain('C');
		expect(d).toContain('20.0,5.0');
	});
});

describe('niceDomain', () => {
	it('pads and rounds so bounds enclose the data', () => {
		const [lo, hi] = niceDomain(18, 25);
		expect(lo).toBeLessThanOrEqual(18);
		expect(hi).toBeGreaterThanOrEqual(25);
	});

	it('handles a flat series', () => {
		expect(niceDomain(20, 20)).toEqual([19, 21]);
	});
});
