import { Navigate, Route, Routes } from 'react-router-dom';
import { Spin } from 'antd';
import type { ReactNode } from 'react';
import { getToken } from './api';
import { useAuth } from './auth';
import Layout from './Layout';
import Login from './pages/Login';
import FullInventory from './pages/Inventory';
import FullItemPage from './pages/ItemPage';
import SimpleInventory from './pages/simple/SimpleInventory';
import SimpleItemPage from './pages/simple/SimpleItemPage';
import Categories from './pages/Categories';
import Users from './pages/Users';
import ForcePasswordChange from './components/ForcePasswordChange';
import { FULL_MODE } from './features';

// The full pages (monthly counts, prices, sums) stay in the code base — see features.ts.
const Inventory = FULL_MODE ? FullInventory : SimpleInventory;
const ItemPage = FULL_MODE ? FullItemPage : SimpleItemPage;

function Protected({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  if (!getToken()) return <Navigate to="/login" replace />;
  if (loading) return <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}><Spin size="large" /></div>;
  if (!me) return <Navigate to="/login" replace />;
  if (me.mustChangePassword) return <ForcePasswordChange />;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  return isAdmin ? <>{children}</> : <Navigate to="/" replace />;
}

function OwnerOnly({ children }: { children: ReactNode }) {
  const { isOwner } = useAuth();
  return isOwner ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Layout /></Protected>}>
        <Route index element={<Inventory />} />
        <Route path="items/new" element={<AdminOnly><ItemPage /></AdminOnly>} />
        <Route path="items/:id" element={<ItemPage />} />
        <Route path="categories" element={<Categories />} />
        <Route path="users" element={<OwnerOnly><Users /></OwnerOnly>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
