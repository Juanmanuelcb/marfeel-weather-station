import { Link } from 'react-router';
import { Logo } from '../logo';

type Props = {
	navOpen: boolean;
	onMenuClick: () => void;
};

export function TopBar({ navOpen, onMenuClick }: Props) {
	return (
		<header className="sticky top-0 z-10 h-16 flex items-center gap-2 px-4 bg-white border-b border-slate-200">
			<button
				type="button"
				onClick={onMenuClick}
				aria-label="Open navigation"
				aria-expanded={navOpen}
				aria-controls="fleet-nav"
				className="md:hidden -ml-2 inline-flex h-11 w-11 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
			>
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
					<path
						d="M3 6h18M3 12h18M3 18h18"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
					/>
				</svg>
			</button>
			<Link to="/" className="md:hidden">
				<Logo />
			</Link>
		</header>
	);
}
