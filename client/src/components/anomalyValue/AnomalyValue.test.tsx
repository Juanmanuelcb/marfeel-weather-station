import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnomalyValue } from './AnomalyValue';

describe('AnomalyValue', () => {
	it('marks a value at or above the threshold as anomalous', () => {
		render(<AnomalyValue prob={0.9} />);
		expect(screen.getByText('0.90')).toBeInTheDocument();
		expect(screen.getByText('anomalous')).toBeInTheDocument();
	});

	it('marks the approaching band as elevated', () => {
		render(<AnomalyValue prob={0.45} />);
		expect(screen.getByText('elevated')).toBeInTheDocument();
	});

	it('marks a low value as normal', () => {
		render(<AnomalyValue prob={0.1} />);
		expect(screen.getByText('normal')).toBeInTheDocument();
	});
});
