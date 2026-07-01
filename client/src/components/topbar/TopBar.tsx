import { Link } from 'react-router';

type Props = {
	navOpen: boolean;
	onMenuClick: () => void;
};

export function TopBar({ navOpen, onMenuClick }: Props) {
	return (
		<header className="sticky top-0 z-10 flex items-center gap-2 p-4 bg-white shadow-sm">
			<button
				type="button"
				onClick={onMenuClick}
				aria-label="Open navigation"
				aria-expanded={navOpen}
				aria-controls="fleet-nav"
				className="md:hidden -ml-2 inline-flex h-11 w-11 items-center justify-center rounded"
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
			<h1 className="text-xl font-bold">
				<Link to="/" className="text-inherit no-underline">
					Weather Station
				</Link>
			</h1>
		</header>
	);
}
