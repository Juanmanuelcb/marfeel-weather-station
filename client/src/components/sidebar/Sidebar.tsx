import { NavLink } from 'react-router';
import { useSnapshot } from '../../snapshot';
import { useVirtualWindow } from '../../lib/useVirtualWindow';

const linkClass = ({ isActive }: { isActive: boolean }) =>
	`block px-4 py-3 md:py-2 text-sm rounded ${isActive ? 'bg-gray-700 font-semibold' : 'hover:bg-gray-700'}`;

const deviceLinkClass = ({ isActive }: { isActive: boolean }) =>
	`block px-4 py-3 md:py-2 font-mono text-sm rounded ${isActive ? 'bg-gray-700 font-semibold' : 'hover:bg-gray-700'}`;

type Props = {
	onNavigate?: () => void;
};

export function Sidebar({ onNavigate }: Props) {
	const { snapshot } = useSnapshot();
	const devices = snapshot?.fleet ?? [];
	const { containerRef, measureRow, onScroll, start, end, padTop, padBottom } = useVirtualWindow(
		devices.length,
	);
	const visible = devices.slice(start, end);

	return (
		<aside className="w-full h-full flex flex-col p-4 bg-gray-800 text-white">
			<NavLink to="/" end className={linkClass} onClick={onNavigate}>
				Fleet overview
			</NavLink>
			<h2 className="text-sm font-bold uppercase tracking-wide text-gray-400 mt-4 mb-2 px-4">
				Devices ({devices.length})
			</h2>
			<div ref={containerRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
				<ul>
					{padTop > 0 && <li aria-hidden style={{ height: padTop }} />}
					{visible.map((d, i) => (
						<li key={d.device_id} ref={i === 0 ? measureRow : undefined}>
							<NavLink
								to={`/device/${d.device_id}`}
								className={deviceLinkClass}
								onClick={onNavigate}
							>
								{d.device_id}
							</NavLink>
						</li>
					))}
					{padBottom > 0 && <li aria-hidden style={{ height: padBottom }} />}
				</ul>
			</div>
		</aside>
	);
}
