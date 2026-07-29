import { useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { globalCSS } from './theme/tokens';
import { ThemeToggle } from './components/ThemeToggle';
import { Login } from './pages/Login';
import { AdvertiserDashboard } from './pages/AdvertiserDashboard';
import { OperatorDashboard } from './pages/OperatorDashboard';

export default function App() {
  const [auth, setAuth] = useState(() => {
    try { return JSON.parse(localStorage.getItem('flashcast_auth')); } catch { return null; }
  });

  const handleLoginSuccess = (authData) => {
    localStorage.setItem('flashcast_auth', JSON.stringify(authData));
    setAuth(authData);
  };

  const handleLogoChange = useCallback((logo) => {
    setAuth(prev => {
      if (!prev || prev.logo === logo) return prev;
      const next = { ...prev, logo };
      localStorage.setItem('flashcast_auth', JSON.stringify(next));
      return next;
    });
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('flashcast_auth');
    setAuth(null);
  };

  return (
    <>
      <style>{globalCSS}</style>
      <ThemeToggle />
      <BrowserRouter>
        <Routes>
          <Route path="/login"
            element={!auth
              ? <Login onLoginSuccess={handleLoginSuccess} />
              : <Navigate to={auth.role === 'operator' ? '/operator' : '/advertiser'} replace />}
          />
          <Route path="/advertiser"
            element={auth?.role === 'advertiser'
              ? <AdvertiserDashboard auth={auth} onLogout={handleLogout} onLogoChange={handleLogoChange} />
              : <Navigate to="/login" replace />}
          />
          <Route path="/operator"
            element={auth?.role === 'operator'
              ? <OperatorDashboard auth={auth} onLogout={handleLogout} />
              : <Navigate to="/login" replace />}
          />
          <Route path="*"
            element={<Navigate to={auth ? (auth.role === 'operator' ? '/operator' : '/advertiser') : '/login'} replace />}
          />
        </Routes>
      </BrowserRouter>
    </>
  );
}
