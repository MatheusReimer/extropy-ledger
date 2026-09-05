import { useAuth } from './auth/AuthContext';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';

export function App() {
  const { session } = useAuth();
  return session ? <DashboardPage /> : <AuthPage />;
}
