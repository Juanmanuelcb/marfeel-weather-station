import { NavLink } from 'react-router';
import { useSnapshot } from '../../snapshot';
import { useVirtualWindow } from '../../lib/useVirtualWindow';
import { Logo } from '../logo';

const linkBase = 'block rounded-md px-3 py-3 md:py-2 text-sm transition-colors';
const active = 'bg-accent-50 text-accent-700 font-medium';
const idle = 'text-slate-600 hover:bg-slate-100';

const linkClass = ({ isActive }: { isActive: boolean }) =>
	`${linkBase} ${isActive ? active : idle}`;

const deviceLinkClass = ({ isActive }: { isActive: boolean }) =>
	`${linkBase} font-mono ${isActive ? active : idle}`;

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
		<aside className="w-full h-full flex flex-col bg-white border-r border-slate-200">
			<div className="h-16 flex items-center px-4 border-b border-slate-200">
				<NavLink to="/" onClick={onNavigate}>
					<Logo />
				</NavLink>
			</div>
			<nav className="flex-1 flex flex-col p-3 min-h-0">
				<NavLink to="/" end className={linkClass} onClick={onNavigate}>
					Fleet overview
				</NavLink>
				<h2 className="px-3 mt-5 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
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
			</nav>
		</aside>
	);
}
