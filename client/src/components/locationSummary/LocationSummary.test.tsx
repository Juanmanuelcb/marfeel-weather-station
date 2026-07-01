import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LocationSummary } from './LocationSummary';
import type { LocationRollup } from '../../api';

describe('LocationSummary', () => {
	it('renders rollups including the anomalous-device count', () => {
		const rows: LocationRollup[] = [{
			location: 'Location_1', location_name: 'Testville', devices: 3,
			avg_temperature: 21.5, avg_humidity: 55.2, avg_anomaly: 0.3, anomalous_devices: 2,
		}];
		render(<LocationSummary locations={rows} />);
		expect(screen.getByText('Testville')).toBeInTheDocument();
		expect(screen.getByText('21.5')).toBeInTheDocument();
		expect(screen.getByText('2')).toBeInTheDocument();
	});
});
