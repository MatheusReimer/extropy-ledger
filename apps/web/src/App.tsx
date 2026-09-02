import { useAuth } from './auth/AuthContext';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';

/**
 * No router, on purpose.
 *
 * The app has two states - authenticated and not - and no deep URL worth
 * sharing. A router here would add a dependency, protected routes and a redirect
 * in order to express an `if`.
 */
export function App() {
  const { session } = useAuth();
  return session ? <DashboardPage /> : <AuthPage />;
}
