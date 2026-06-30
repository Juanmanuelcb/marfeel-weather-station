import styles from './TopBar.module.css';

export const TopBar = () => {
	return (
		<header className={styles.header}>
			<h1 className={styles.title}>Weather Station</h1>
		</header>
	);
};
