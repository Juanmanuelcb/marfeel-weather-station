import { BrowserRouter, Routes, Route } from 'react-router';
import { Home } from './pages/home';
import { Device } from './pages/device';
import { Main } from './layout';
import { SnapshotProvider } from './snapshot';

import './index.css';

export function App() {
	return (
		<BrowserRouter>
			<SnapshotProvider>
				<Routes>
					<Route path="/" element={<Main />}>
						<Route index element={<Home />} />
						<Route path="device/:deviceId" element={<Device />} />
					</Route>
				</Routes>
			</SnapshotProvider>
		</BrowserRouter>
	);
}
