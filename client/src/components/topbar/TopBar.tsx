import { Link } from 'react-router';

export function TopBar() {
	return (
		<header className="sticky top-0 z-10 p-4 bg-white shadow-sm">
			<h1 className="text-xl font-bold">
				<Link to="/" className="text-inherit no-underline">
					Weather Station
				</Link>
			</h1>
		</header>
	);
}
