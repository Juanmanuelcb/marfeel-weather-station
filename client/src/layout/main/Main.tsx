import { Outlet } from 'react-router';
import { Sidebar, TopBar } from '../../components';

export const Main = () => {
	return (
		<div className="flex h-screen w-screen">
			<div className="w-64 h-full">
				<Sidebar />
			</div>

			<div className="flex flex-1 flex-col min-h-0 min-w-0">
				<TopBar />
				<main className="flex-1 p-6 overflow-auto bg-gray-100">
					<Outlet />
				</main>
			</div>
		</div>
	);
};
