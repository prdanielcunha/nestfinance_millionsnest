import { Outlet } from 'react-router-dom';
import { AuthBoundary } from '../boundaries/AuthBoundary';

export function RootLayout() {
  return (
    <div className="min-h-screen bg-background-base text-text-primary selection:bg-accent-primary/20">
      <AuthBoundary>
        <Outlet />
      </AuthBoundary>
    </div>
  );
}
