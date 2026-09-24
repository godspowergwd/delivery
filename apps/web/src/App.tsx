import { Navigate, Route, Routes } from 'react-router-dom';
import { LazyRoute } from './components/LazyRoute';
import {
  AccountSettings,
  AdminCategories,
  AdminDashboard,
  AdminLogs,
  AdminOrders,
  AdminProducts,
  AdminReports,
  AdminSettings,
  AdminUsers,
  Cart,
  Checkout,
  CustomerHome,
  DriverDeliveries,
  DriverEarnings,
  DriverMap,
  DriverProfile,
  KitchenProducts,
  KitchenQueue,
  Menu,
  OrderDetail,
  Orders,
  ProductPage,
  Profile,
} from './components/lazy';
import { AppShell } from './components/Layout';
import { ProtectedRoute, RoleHome } from './components/guards';
import { Login } from './pages/Login';
import CustomerTracking from './pages/customer/Tracking';
import { Register } from './pages/Register';
import { Verify } from './pages/Verify';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify/:code" element={<Verify />} />
      <Route path="/" element={<RoleHome />} />

      <Route element={<ProtectedRoute roles={['CUSTOMER']} />}>
        <Route element={<AppShell />}>
          <Route path="/app" element={<Navigate to="/app/home" replace />} />
          <Route path="/app/home" element={<LazyRoute><CustomerHome /></LazyRoute>} />
          <Route path="/app/search" element={<LazyRoute><Menu /></LazyRoute>} />
          <Route path="/app/menu" element={<LazyRoute><Menu /></LazyRoute>} />
          <Route path="/app/product/:id" element={<LazyRoute><ProductPage /></LazyRoute>} />
          <Route path="/app/cart" element={<LazyRoute><Cart /></LazyRoute>} />
          <Route path="/app/checkout" element={<LazyRoute><Checkout /></LazyRoute>} />
          <Route path="/app/orders" element={<LazyRoute><Orders /></LazyRoute>} />
          <Route path="/app/orders/:id" element={<LazyRoute><OrderDetail /></LazyRoute>} />
          <Route path="/app/profile" element={<LazyRoute><Profile /></LazyRoute>} />
        </Route>
        {/* Full-screen live tracking - rendered outside the shell so the map owns the viewport. */}
        <Route path="/app/track" element={<CustomerTracking />} />
        <Route path="/app/track/:id" element={<CustomerTracking />} />
      </Route>

      <Route element={<ProtectedRoute roles={['KITCHEN', 'ADMIN']} />}>
        <Route element={<AppShell />}>
          <Route path="/kitchen" element={<LazyRoute><KitchenQueue /></LazyRoute>} />
          <Route path="/kitchen/products" element={<LazyRoute><KitchenProducts /></LazyRoute>} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/settings" element={<LazyRoute><AccountSettings /></LazyRoute>} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['DRIVER']} />}>
        <Route element={<AppShell />}>
          <Route path="/driver" element={<Navigate to="/driver/deliveries" replace />} />
          <Route path="/driver/deliveries" element={<LazyRoute><DriverDeliveries /></LazyRoute>} />
          <Route path="/driver/earnings" element={<LazyRoute><DriverEarnings /></LazyRoute>} />
          <Route path="/driver/profile" element={<LazyRoute><DriverProfile /></LazyRoute>} />
        </Route>
        {/* True full-screen delivery map - floating controls only, no shell or bottom nav. */}
        <Route path="/driver/map" element={<LazyRoute><DriverMap /></LazyRoute>} />
      </Route>

      <Route element={<ProtectedRoute roles={['ADMIN']} />}>
        <Route element={<AppShell />}>
          <Route path="/admin" element={<LazyRoute><AdminDashboard /></LazyRoute>} />
          <Route path="/admin/products" element={<LazyRoute><AdminProducts /></LazyRoute>} />
          <Route path="/admin/categories" element={<LazyRoute><AdminCategories /></LazyRoute>} />
          <Route path="/admin/orders" element={<LazyRoute><AdminOrders /></LazyRoute>} />
          <Route path="/admin/users" element={<LazyRoute><AdminUsers /></LazyRoute>} />
          <Route path="/admin/reports" element={<LazyRoute><AdminReports /></LazyRoute>} />
          <Route path="/admin/settings" element={<LazyRoute><AdminSettings /></LazyRoute>} />
          <Route path="/admin/logs" element={<LazyRoute><AdminLogs /></LazyRoute>} />
        </Route>
      </Route>

      <Route path="*" element={<RoleHome />} />
    </Routes>
  );
}
