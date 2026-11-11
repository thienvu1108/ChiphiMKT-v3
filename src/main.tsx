import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { Toaster } from '@/components/ui/sonner';
import { installChunkRecovery } from './lib/chunkReload';
import { UpdateBanner } from './components/UpdateBanner';
import { VnErrorBoundary } from './vnext/ErrorBoundary';
import { Analytics } from '@vercel/analytics/react';

installChunkRecovery();

// Prevent benign Firestore multi-tab lease clock drift messages from triggering unhandled error overlays
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    if (event.message && event.message.includes('Detected an update time that is in the future')) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <VnErrorBoundary name="root"><App /></VnErrorBoundary>
    <Toaster />
    <UpdateBanner />
    <Analytics />
  </StrictMode>,
);

