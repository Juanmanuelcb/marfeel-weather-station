import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FleetTable } from './FleetTable';
import type { FleetReading } from '../../api';

function reading(overrides: Partial<FleetReading>): FleetReading {
	return {
		device_id: 'device_1', temperature: 20, humidity: 50, pressure: 1000, wind_speed: 1,
		heat_index: 20, air_density: 1.2, wind_chill: 20, dew_point: 10, anomaly_prob: 0.1,
		recorded_at: '2026-07-01 12:00:00', location: 'Location_1', location_name: 'Testville',
		latitude: 0, longitude: 0, ...overrides,
	};
}

describe('FleetTable', () => {
	const now = Date.parse('2026-07-01T12:00:05Z');

	it('renders a row per device with the location name', () => {
		render(<FleetTable rows={[reading({ device_id: 'device_1' }), reading({ device_id: 'device_2' })]} nowMs={now} />);
		expect(screen.getByText('device_1')).toBeInTheDocument();
		expect(screen.getByText('device_2')).toBeInTheDocument();
		expect(screen.getAllByText('Testville')).toHaveLength(2);
	});

	it('flags an anomalous device', () => {
		render(<FleetTable rows={[reading({ anomaly_prob: 0.9 })]} nowMs={now} />);
		expect(screen.getByText('0.90 !')).toBeInTheDocument();
	});

	it('marks a quiet device stale', () => {
		const later = Date.parse('2026-07-01T12:01:00Z');
		render(<FleetTable rows={[reading({ recorded_at: '2026-07-01 12:00:00' })]} nowMs={later} />);
		expect(screen.getByText('stale')).toBeInTheDocument();
	});
});
