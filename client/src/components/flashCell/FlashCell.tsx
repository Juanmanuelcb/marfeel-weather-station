import { useEffect, useRef, useState } from 'react';

type Props = {
	value: number;
	decimals?: number;
};

// Briefly flashes green (up) or red (down) when the value changes, so the eye can
// track what moved in a live table instead of every cell silently swapping at once.
export function FlashCell({ value, decimals = 1 }: Props) {
	const prev = useRef(value);
	const [flash, setFlash] = useState('');

	useEffect(() => {
		if (value === prev.current) return;
		setFlash(value > prev.current ? 'flash-up' : 'flash-down');
		prev.current = value;
		const t = setTimeout(() => setFlash(''), 700);
		return () => clearTimeout(t);
	}, [value]);

	return <span className={`tabular-nums ${flash}`}>{value.toFixed(decimals)}</span>;
}
