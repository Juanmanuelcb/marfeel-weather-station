type Props = {
	values: number[];
	label?: string;
	width?: number;
	height?: number;
	className?: string;
};

// Plain SVG polyline, no chart dependency. Scales the series to fill the viewBox
// (inset so the stroke isn't clipped); the parent controls display size.
export function Sparkline({ values, label, width = 600, height = 120, className }: Props) {
	if (values.length < 2) return null;
	const min = Math.min(...values);
	const max = Math.max(...values);
	const span = max - min;
	const pad = 2;
	const stepX = width / (values.length - 1);
	const y = (v: number) =>
		span === 0 ? height / 2 : height - pad - ((v - min) / span) * (height - 2 * pad);
	const points = values.map((v, i) => `${(i * stepX).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
	return (
		<svg
			viewBox={`0 0 ${width} ${height}`}
			className={className}
			preserveAspectRatio="none"
			role="img"
			aria-label={label}
		>
			<polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" />
		</svg>
	);
}
