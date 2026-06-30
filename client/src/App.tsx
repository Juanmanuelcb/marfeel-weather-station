import { BrowserRouter, Routes, Route } from 'react-router';
import { Home } from './pages/home';
import { Debug } from './pages/debug';
import { Main } from './layout';

import './index.css';

function App() {
	return (
		<>
			<BrowserRouter>
				<Routes>
					<Route path="/" element={<Main />}>
						<Route index element={<Home />} />
					</Route>
					<Route path="/debug/:deviceId" element={<Debug />} />
				</Routes>
			</BrowserRouter>
		</>
	);
}

export default App;
