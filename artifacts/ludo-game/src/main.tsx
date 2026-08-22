import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';

import './index.css';

// Same-origin when unset (dev proxy / single-process prod). Set
// VITE_API_URL when the frontend and backend are deployed separately
// (e.g. frontend on Vercel, backend on Railway/Render/Fly).
const apiBase = import.meta.env.VITE_API_URL as string | undefined;
if (apiBase) setBaseUrl(apiBase);

createRoot(document.getElementById('root')!).render(<App />);
