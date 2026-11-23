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
import Audit from './pages/Audit';
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

// Sections in menu order; the first one the user may open is their home.
export const SECTIONS: Array<{ path: string; perms: string[] }> = [
  { path: '/', perms: ['inventory.view', 'inventory.count'] },
  { path: '/categories', perms: ['inventory.view', 'categories.manage'] },
  { path: '/users', perms: ['users.manage', 'roles.manage'] },
  { path: '/audit', perms: ['audit.view'] },
];

// Opens the page only with at least one of `perms`; otherwise goes to the first allowed section.
function Require({ perms, children }: { perms: string[]; children: ReactNode }) {
  const { can } = useAuth();
  if (perms.some(can)) return <>{children}</>;
  const home = SECTIONS.find(s => s.perms.some(can) && s.perms !== perms);
  if (!home) {
    return <div style={{ padding: 48, textAlign: 'center' }}>Вашей роли не назначено ни одного раздела. Обратитесь к владельцу.</div>;
  }
  return <Navigate to={home.path} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Layout /></Protected>}>
        <Route index element={<Require perms={['inventory.view', 'inventory.count']}><Inventory /></Require>} />
        <Route path="items/new" element={<Require perms={['items.create']}><ItemPage /></Require>} />
        <Route path="items/:id" element={<Require perms={['inventory.view', 'inventory.count']}><ItemPage /></Require>} />
        <Route path="categories" element={<Require perms={['inventory.view', 'categories.manage']}><Categories /></Require>} />
        <Route path="users" element={<Require perms={['users.manage', 'roles.manage']}><Users /></Require>} />
        <Route path="audit" element={<Require perms={['audit.view']}><Audit /></Require>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
