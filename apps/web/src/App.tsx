import { Navigate, Route, Routes } from 'react-router-dom';
import CustomerHome from './pages/customer/Home';
import DriverDeliveries from './pages/driver/Deliveries';
import DriverMap from './pages/driver/Map';
import DriverProfile from './pages/driver/Profile';
import { AppShell } from './components/Layout';
import { ProtectedRoute, RoleHome } from './components/guards';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Verify } from './pages/Verify';
import { AccountSettings } from './pages/Settings';
import { Menu } from './pages/customer/Menu';
import { ProductPage } from './pages/customer/Product';
import { Cart } from './pages/customer/Cart';
import { Checkout } from './pages/customer/Checkout';
import { Orders } from './pages/customer/Orders';
import { OrderDetail } from './pages/customer/OrderDetail';
import { Profile } from './pages/customer/Profile';
import { KitchenQueue } from './pages/kitchen/Kitchen';
import { KitchenHistory } from './pages/kitchen/KitchenHistory';
import { AdminDashboard } from './pages/admin/Dashboard';
import { AdminProducts } from './pages/admin/Products';
import { AdminCategories } from './pages/admin/Categories';
import { AdminOrders } from './pages/admin/Orders';
import { AdminUsers } from './pages/admin/Users';
import { AdminReports } from './pages/admin/Reports';
import { AdminSettings } from './pages/admin/Settings';
import { AdminLogs } from './pages/admin/Logs';

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
          <Route path="/app/home" element={<CustomerHome />} />
          <Route path="/app/search" element={<Menu />} />
          <Route path="/app/menu" element={<Menu />} />
          <Route path="/app/product/:id" element={<ProductPage />} />
          <Route path="/app/cart" element={<Cart />} />
          <Route path="/app/checkout" element={<Checkout />} />
          <Route path="/app/orders" element={<Orders />} />
          <Route path="/app/orders/:id" element={<OrderDetail />} />
          <Route path="/app/profile" element={<Profile />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['KITCHEN', 'ADMIN']} />}>
        <Route element={<AppShell />}>
          <Route path="/kitchen" element={<KitchenQueue />} />
          <Route path="/kitchen/history" element={<KitchenHistory />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/settings" element={<AccountSettings />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['DRIVER']} />}>
        <Route element={<AppShell />}>
          <Route path="/driver" element={<Navigate to="/driver/deliveries" replace />} />
          <Route path="/driver/deliveries" element={<DriverDeliveries />} />
          <Route path="/driver/map" element={<DriverMap />} />
          <Route path="/driver/profile" element={<DriverProfile />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['ADMIN']} />}>
        <Route element={<AppShell />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/products" element={<AdminProducts />} />
          <Route path="/admin/categories" element={<AdminCategories />} />
          <Route path="/admin/orders" element={<AdminOrders />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/reports" element={<AdminReports />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
          <Route path="/admin/logs" element={<AdminLogs />} />
        </Route>
      </Route>

      <Route path="*" element={<RoleHome />} />
    </Routes>
  );
}
