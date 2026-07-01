type Props = {
	className?: string;
};

export function Logo({ className }: Props) {
	return (
		<span className={`inline-flex items-center gap-2 text-slate-900 ${className ?? ''}`}>
			<svg
				viewBox="0 0 24 24"
				width="22"
				height="22"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				className="text-accent-500"
				aria-hidden
			>
				<circle cx="12" cy="17" r="2" fill="currentColor" stroke="none" />
				<path d="M7.5 13.5a6 6 0 0 1 9 0" />
				<path d="M5 10.5a10 10 0 0 1 14 0" opacity="0.5" />
			</svg>
			<span className="text-base font-semibold tracking-tight">Weather Station</span>
		</span>
	);
}
