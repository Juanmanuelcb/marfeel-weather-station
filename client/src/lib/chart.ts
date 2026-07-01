export type Pt = { x: number; y: number };

// Monotone cubic (Fritsch-Carlson) spline as an SVG path. Smooths the line without
// overshooting between points, so it never invents peaks the data doesn't have —
// important for an anomaly-aware view.
export function monotonePath(pts: Pt[]): string {
	const n = pts.length;
	if (n === 0) return '';
	if (n === 1) return `M${pts[0].x},${pts[0].y}`;
	if (n === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;

	const dx: number[] = [];
	const slope: number[] = [];
	for (let i = 0; i < n - 1; i++) {
		dx[i] = pts[i + 1].x - pts[i].x || 1e-6;
		slope[i] = (pts[i + 1].y - pts[i].y) / dx[i];
	}

	const t: number[] = new Array(n);
	t[0] = slope[0];
	t[n - 1] = slope[n - 2];
	for (let i = 1; i < n - 1; i++) {
		if (slope[i - 1] * slope[i] <= 0) {
			t[i] = 0;
		} else {
			const w1 = 2 * dx[i] + dx[i - 1];
			const w2 = dx[i] + 2 * dx[i - 1];
			t[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
		}
	}

	let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
	for (let i = 0; i < n - 1; i++) {
		const c1x = pts[i].x + dx[i] / 3;
		const c1y = pts[i].y + (t[i] * dx[i]) / 3;
		const c2x = pts[i + 1].x - dx[i] / 3;
		const c2y = pts[i + 1].y - (t[i + 1] * dx[i]) / 3;
		d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${pts[i + 1].x.toFixed(1)},${pts[i + 1].y.toFixed(1)}`;
	}
	return d;
}

function niceStep(rough: number): number {
	const p = Math.pow(10, Math.floor(Math.log10(rough)));
	const n = rough / p;
	const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
	return nice * p;
}

// A padded, "nice"-rounded value domain. Quantizing the bounds keeps them stable as
// the window slides, so the chart doesn't jump vertically on every update.
export function niceDomain(dataMin: number, dataMax: number): [number, number] {
	if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) return [0, 1];
	if (dataMin === dataMax) return [dataMin - 1, dataMax + 1];
	const pad = (dataMax - dataMin) * 0.15;
	const lo = dataMin - pad;
	const hi = dataMax + pad;
	const step = niceStep((hi - lo) / 4);
	return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
}
