import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Global mock for window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock HTMLCanvasElement and 2d context for image compression tests
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    drawImage: vi.fn(),
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
  }) as any;

  HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue('data:image/jpeg;base64,mockedCompressedBase64');
}

// Mock Image onload trigger in jsdom
if (typeof window !== 'undefined') {
  class MockImage {
    private _src: string = '';
    public width: number = 1920;
    public height: number = 1080;
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;

    set src(value: string) {
      this._src = value;
      setTimeout(() => {
        if (this.onload) {
          this.onload();
        }
      }, 10);
    }

    get src(): string {
      return this._src;
    }
  }

  (globalThis as any).Image = MockImage;
}

// Mock URL.createObjectURL and revokeObjectURL
if (typeof URL !== 'undefined') {
  URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
  URL.revokeObjectURL = vi.fn();
}
