import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Spinner } from './components/Spinner';
import { LoginPage } from './features/auth/LoginPage';
import { useAuth } from './features/auth/useAuth';
import { BenchmarkPage } from './features/benchmark/BenchmarkPage';
import { ChatPage } from './features/chat/ChatPage';
import { ConnectionsPage } from './features/connections/ConnectionsPage';
import { HistoryPage } from './features/history/HistoryPage';

export default function App() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Spinner label="Loading…" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<ChatPage />} />
        <Route path="/connections" element={<ConnectionsPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/benchmark" element={<BenchmarkPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
