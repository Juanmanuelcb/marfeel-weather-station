import { useState } from 'react';
import type { PointerEvent } from 'react';
import { monotonePath, niceDomain } from '../../lib/chart';

export type SparkPoint = { t: string; v: number };

type Props = {
	points: SparkPoint[];
	label: string;
	unit?: string;
	decimals?: number;
	domain?: [number, number];
	className?: string;
	width?: number;
	height?: number;
};

const ML = 48;
const MR = 52;
const MT = 12;
const MB = 26;

const hhmmss = (t: string) => t.slice(11, 19);
const timeMs = (t: string) => Date.parse(`${t.replace(' ', 'T')}Z`);

// Hand-rolled SVG chart (no chart dependency): a monotone-cubic smoothed line on a
// time X axis and a nice-rounded Y domain (both stable across updates), plus a
// marker + current value on the latest point that glides to new values (see index.css).
// The viewBox is sized close to the on-screen render width so SVG-unit text stays a
// normal size instead of scaling up; the expanded view passes a larger box, not a zoom.
export function Sparkline({
	points,
	label,
	unit = '',
	decimals = 1,
	domain,
	className,
	width = 320,
	height = 180,
}: Props) {
	const [hover, setHover] = useState<number | null>(null);

	if (points.length < 2) return <p className="text-xs text-gray-400">Not enough data yet.</p>;

	const plotW = width - ML - MR;
	const plotH = height - MT - MB;

	const values = points.map(p => p.v);
	const [min, max] = domain ?? niceDomain(Math.min(...values), Math.max(...values));
	const span = max - min || 1;

	const t0 = timeMs(points[0].t);
	const tSpan = timeMs(points[points.length - 1].t) - t0 || 1;

	const x = (t: string) => ML + ((timeMs(t) - t0) / tSpan) * plotW;
	const y = (v: number) => MT + plotH - ((v - min) / span) * plotH;

	const coords = points.map(p => ({ x: x(p.t), y: y(p.v) }));
	const d = monotonePath(coords);
	const last = points[points.length - 1];
	const lastX = coords[coords.length - 1].x;
	const lastY = y(last.v);
	const fmt = (n: number) => `${n.toFixed(decimals)}${unit}`;

	const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
		const rect = e.currentTarget.getBoundingClientRect();
		if (!rect.width) return;
		const px = ((e.clientX - rect.left) / rect.width) * width;
		let best = 0;
		let bestDist = Infinity;
		for (let i = 0; i < coords.length; i++) {
			const dist = Math.abs(coords[i].x - px);
			if (dist < bestDist) {
				bestDist = dist;
				best = i;
			}
		}
		setHover(best);
	};

	const hi = hover !== null && hover < coords.length ? hover : null;
	const tipAnchor =
		hi === null
			? 'middle'
			: coords[hi].x < ML + 44
				? 'start'
				: coords[hi].x > ML + plotW - 44
					? 'end'
					: 'middle';

	return (
		<svg
			viewBox={`0 0 ${width} ${height}`}
			className={`h-auto cursor-crosshair ${className ?? ''}`}
			role="img"
			aria-label={label}
			onPointerMove={onPointerMove}
			onPointerLeave={() => setHover(null)}
		>
			<line x1={ML} y1={MT} x2={ML} y2={MT + plotH} stroke="var(--color-slate-200)" />
			<line
				x1={ML}
				y1={MT + plotH}
				x2={ML + plotW}
				y2={MT + plotH}
				stroke="var(--color-slate-200)"
			/>

			<text x={ML - 6} y={y(max) + 4} textAnchor="end" fontSize="12" fill="var(--color-slate-400)">
				{fmt(max)}
			</text>
			<text x={ML - 6} y={y(min) + 4} textAnchor="end" fontSize="12" fill="var(--color-slate-400)">
				{fmt(min)}
			</text>

			<text x={ML} y={height - 6} textAnchor="start" fontSize="12" fill="var(--color-slate-400)">
				{hhmmss(points[0].t)}
			</text>
			<text
				x={ML + plotW}
				y={height - 6}
				textAnchor="end"
				fontSize="12"
				fill="var(--color-slate-400)"
			>
				{hhmmss(last.t)}
			</text>

			{hi !== null && (
				<line
					x1={coords[hi].x}
					y1={MT}
					x2={coords[hi].x}
					y2={MT + plotH}
					stroke="var(--color-slate-300)"
					strokeDasharray="3 3"
				/>
			)}

			<path
				d={d}
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinejoin="round"
				strokeLinecap="round"
			/>

			{hi === null ? (
				<>
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
				</>
			) : (
				<>
					<circle
						cx={coords[hi].x}
						cy={coords[hi].y}
						r="3.5"
						fill="currentColor"
						stroke="white"
						strokeWidth="1.5"
					/>
					<text
						x={coords[hi].x}
						y={MT + 9}
						textAnchor={tipAnchor}
						fontSize="12"
						fontWeight="600"
						fill="currentColor"
						stroke="white"
						strokeWidth="3"
						strokeLinejoin="round"
						style={{ paintOrder: 'stroke' }}
					>
						{fmt(points[hi].v)} · {hhmmss(points[hi].t)}
					</text>
				</>
			)}
		</svg>
	);
}
