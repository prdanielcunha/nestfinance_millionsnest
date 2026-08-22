/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { AppErrorBoundary } from './app/boundaries/AppErrorBoundary';
import { LanguageProvider } from './contexts/LanguageContext';

export default function App() {
  return (
    <AppErrorBoundary>
      <LanguageProvider>
        <RouterProvider router={router} />
      </LanguageProvider>
    </AppErrorBoundary>
  );
}
