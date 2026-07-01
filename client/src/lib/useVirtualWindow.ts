import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { UIEvent } from 'react';

// Windowing shared by the fleet table, the location summary, and the device nav: only
// the rows in view are rendered, and the caller pads with padTop/padBottom for the rest.
// Row height is measured from a live row (attach measureRow to the first one) so the
// spacers stay accurate. The scroll container is any div; attach containerRef + onScroll.
export function useVirtualWindow(total: number, overscan = 6) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [scrollTop, setScrollTop] = useState(0);
	const [viewportH, setViewportH] = useState(600);
	const [rowH, setRowH] = useState(37);

	useLayoutEffect(() => {
		const measure = () => {
			if (containerRef.current) setViewportH(containerRef.current.clientHeight || 600);
		};
		measure();
		window.addEventListener('resize', measure);
		return () => window.removeEventListener('resize', measure);
	}, []);

	const measureRow = useCallback((el: HTMLElement | null) => {
		if (!el) return;
		const h = el.offsetHeight;
		if (h > 0) setRowH(prev => (h === prev ? prev : h));
	}, []);

	const onScroll = useCallback((e: UIEvent<HTMLElement>) => {
		setScrollTop(e.currentTarget.scrollTop);
	}, []);

	// Clamp to the current row count: after a filter shrinks the list, the retained
	// scrollTop can point past the new end and render an empty window for one frame,
	// until the browser clamps scroll and fires onScroll.
	const maxStart = Math.max(0, total - 1);
	const start = Math.min(maxStart, Math.max(0, Math.floor(scrollTop / rowH) - overscan));
	const end = Math.min(total, start + Math.ceil(viewportH / rowH) + overscan * 2);

	return {
		containerRef,
		measureRow,
		onScroll,
		start,
		end,
		padTop: start * rowH,
		padBottom: (total - end) * rowH,
	};
}
