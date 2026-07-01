import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { openSnapshotStream } from '../api';
import type { Snapshot } from '../api';

type Status = 'connecting' | 'open' | 'error';

type SnapshotState = {
	snapshot: Snapshot | null;
	status: Status;
};

const SnapshotContext = createContext<SnapshotState>({ snapshot: null, status: 'connecting' });

// One EventSource for the whole app. Every view reads the same snapshot, so viewer
// count never multiplies the stream or the DB load behind it.
export function SnapshotProvider({ children }: { children: ReactNode }) {
	const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
	const [status, setStatus] = useState<Status>('connecting');

	useEffect(() => openSnapshotStream({
		onSnapshot: (next) => { setSnapshot(next); setStatus('open'); },
		onOpen: () => setStatus('open'),
		onError: () => setStatus('error'),
	}), []);

	return <SnapshotContext.Provider value={{ snapshot, status }}>{children}</SnapshotContext.Provider>;
}

// The context and its hook belong in one file; extra files just to satisfy Fast
// Refresh would be noise.
// eslint-disable-next-line react-refresh/only-export-components
export function useSnapshot(): SnapshotState {
	return useContext(SnapshotContext);
}
