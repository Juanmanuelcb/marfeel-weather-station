import { useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import { Sidebar, TopBar } from '../../components';

export function Main() {
	const [navOpen, setNavOpen] = useState(false);

	// While the mobile drawer is open, lock body scroll and let Esc close it.
	useEffect(() => {
		if (!navOpen) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setNavOpen(false);
		};
		document.body.style.overflow = 'hidden';
		window.addEventListener('keydown', onKey);
		return () => {
			document.body.style.overflow = '';
			window.removeEventListener('keydown', onKey);
		};
	}, [navOpen]);

	return (
		<div className="flex h-dvh w-full overflow-x-hidden">
			<div
				aria-hidden
				onClick={() => setNavOpen(false)}
				className={`fixed inset-0 z-20 bg-black/50 transition-opacity md:hidden ${
					navOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
				}`}
			/>

			<div
				id="fleet-nav"
				className={`fixed inset-y-0 left-0 z-30 w-64 transform transition-transform md:static md:z-auto md:h-full md:translate-x-0 ${
					navOpen ? 'translate-x-0' : '-translate-x-full'
				}`}
			>
				<Sidebar onNavigate={() => setNavOpen(false)} />
			</div>

			<div className="flex flex-1 flex-col min-h-0 min-w-0">
				<TopBar navOpen={navOpen} onMenuClick={() => setNavOpen(true)} />
				<main className="flex-1 p-6 overflow-auto bg-slate-50">
					<Outlet />
				</main>
			</div>
		</div>
	);
}
