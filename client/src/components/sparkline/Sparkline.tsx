import { monotonePath, niceDomain } from '../../lib/chart';

export type SparkPoint = { t: string; v: number };

type Props = {
	points: SparkPoint[];
	label: string;
	unit?: string;
	decimals?: number;
	domain?: [number, number];
	className?: string;
};

const W = 600;
const H = 160;
const ML = 48;
const MR = 46;
const MT = 10;
const MB = 22;

const hhmmss = (t: string) => t.slice(11, 19);
const timeMs = (t: string) => Date.parse(`${t.replace(' ', 'T')}Z`);

// Hand-rolled SVG chart (no chart dependency): a monotone-cubic smoothed line on a
// time X axis and a nice-rounded Y domain (both stable across updates), plus a
// marker + current value on the latest point that glides to new values (see index.css).
export function Sparkline({ points, label, unit = '', decimals = 1, domain, className }: Props) {
	if (points.length < 2) return <p className="text-xs text-gray-400">Not enough data yet.</p>;

	const values = points.map(p => p.v);
	const [min, max] = domain ?? niceDomain(Math.min(...values), Math.max(...values));
	const span = max - min || 1;

	const t0 = timeMs(points[0].t);
	const tSpan = timeMs(points[points.length - 1].t) - t0 || 1;

	const plotW = W - ML - MR;
	const plotH = H - MT - MB;
	const x = (t: string) => ML + ((timeMs(t) - t0) / tSpan) * plotW;
	const y = (v: number) => MT + plotH - ((v - min) / span) * plotH;

	const coords = points.map(p => ({ x: x(p.t), y: y(p.v) }));
	const d = monotonePath(coords);
	const last = points[points.length - 1];
	const lastX = coords[coords.length - 1].x;
	const lastY = y(last.v);
	const fmt = (n: number) => `${n.toFixed(decimals)}${unit}`;

	return (
		<svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={label}>
			<line x1={ML} y1={MT} x2={ML} y2={MT + plotH} stroke="#e5e7eb" />
			<line x1={ML} y1={MT + plotH} x2={ML + plotW} y2={MT + plotH} stroke="#e5e7eb" />

			<text x={ML - 6} y={y(max) + 4} textAnchor="end" fontSize="12" fill="#9ca3af">
				{fmt(max)}
			</text>
			<text x={ML - 6} y={y(min) + 4} textAnchor="end" fontSize="12" fill="#9ca3af">
				{fmt(min)}
			</text>

			<text x={ML} y={H - 6} textAnchor="start" fontSize="12" fill="#9ca3af">
				{hhmmss(points[0].t)}
			</text>
			<text x={ML + plotW} y={H - 6} textAnchor="end" fontSize="12" fill="#9ca3af">
				{hhmmss(last.t)}
			</text>

			<path
				d={d}
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinejoin="round"
				strokeLinecap="round"
			/>

			<circle className="spark-marker" cx={lastX} cy={lastY} r="4" fill="currentColor" />
			<text
				className="spark-label"
				x={ML + plotW + 6}
				y={lastY + 4}
				textAnchor="start"
				fontSize="13"
				fontWeight="600"
				fill="currentColor"
			>
				{fmt(last.v)}
			</text>
		</svg>
	);
}
