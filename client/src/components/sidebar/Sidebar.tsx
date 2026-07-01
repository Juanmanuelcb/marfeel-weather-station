import { Link } from 'react-router';
import { useSnapshot } from '../../snapshot';

export function Sidebar() {
	const { snapshot } = useSnapshot();
	const devices = snapshot?.fleet ?? [];

	return (
		<aside className="w-full h-full flex flex-col p-4 bg-gray-800 text-white">
			<h2 className="text-lg font-bold mb-4">Devices ({devices.length})</h2>
			<nav className="flex-1 overflow-y-auto">
				<ul>
					{devices.map(d => (
						<li key={d.device_id}>
							<Link
								to={`/device/${d.device_id}`}
								className="block px-4 py-2 font-mono text-sm hover:bg-gray-700"
							>
								{d.device_id}
							</Link>
						</li>
					))}
				</ul>
			</nav>
		</aside>
	);
}
