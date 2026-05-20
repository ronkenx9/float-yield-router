/// <reference types="vite/client" />

// Augment HTMLVideoElement with the requestVideoFrameCallback API
// for browsers that support it (Chromium, Safari 16+).
interface HTMLVideoElement {
  requestVideoFrameCallback?(callback: (now: number, metadata: any) => void): number;
  cancelVideoFrameCallback?(handle: number): void;
}
