import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/archivo-black/400.css';
import '@fontsource-variable/space-grotesk';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';

import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/shell.css';
import './styles/onboarding.css';
import './styles/home.css';
import './styles/flows.css';
import './styles/album.css';
import './styles/lists.css';
import './styles/lightbox.css';

import { App } from './App';
import { AppProvider } from './state/AppContext';
import { RouterProvider } from './state/router';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <RouterProvider>
        <App />
      </RouterProvider>
    </AppProvider>
  </StrictMode>,
);
