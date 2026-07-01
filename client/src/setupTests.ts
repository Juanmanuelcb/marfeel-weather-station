import { expect, vi } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

// jsdom has no EventSource; stub it so components that open the stream can render.
class MockEventSource {
	url: string;
	onmessage: ((event: MessageEvent) => void) | null = null;
	onopen: (() => void) | null = null;
	onerror: (() => void) | null = null;
	constructor(url: string) { this.url = url; }
	close() {}
}

vi.stubGlobal('EventSource', MockEventSource);
