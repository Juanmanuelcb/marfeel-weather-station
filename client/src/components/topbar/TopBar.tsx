import { Link } from 'react-router';
import styles from './TopBar.module.css';

export const TopBar = () => {
	return (
		<header className={styles.header}>
			<h1 className={styles.title}>
				<Link to="/" className="text-inherit no-underline">
					Weather Station
				</Link>
			</h1>
		</header>
	);
};
