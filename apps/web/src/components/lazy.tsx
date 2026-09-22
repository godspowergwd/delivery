import { lazy, type ComponentType } from 'react';

function interop(loader: () => Promise<object>, name: string) {
  return lazy(() =>
    loader().then((mod) => ({ default: (mod as Record<string, ComponentType>)[name] as ComponentType })),
  ) as ComponentType;
}

export const CustomerHome: ComponentType = lazy(() => import('../pages/customer/Home'));
export const DriverDeliveries: ComponentType = lazy(() => import('../pages/driver/Deliveries'));
export const DriverMap: ComponentType = lazy(() => import('../pages/driver/Map'));
export const DriverEarnings: ComponentType = lazy(() => import('../pages/driver/Earnings'));
export const DriverProfile: ComponentType = lazy(() => import('../pages/driver/Profile'));
export const AccountSettings = interop(() => import('../pages/Settings'), 'AccountSettings');
export const Menu = interop(() => import('../pages/customer/Menu'), 'Menu');
export const ProductPage = interop(() => import('../pages/customer/Product'), 'ProductPage');
export const Cart = interop(() => import('../pages/customer/Cart'), 'Cart');
export const Checkout = interop(() => import('../pages/customer/Checkout'), 'Checkout');
export const Orders = interop(() => import('../pages/customer/Orders'), 'Orders');
export const OrderDetail = interop(() => import('../pages/customer/OrderDetail'), 'OrderDetail');
export const Profile = interop(() => import('../pages/customer/Profile'), 'Profile');
export const KitchenQueue = interop(() => import('../pages/kitchen/Kitchen'), 'KitchenQueue');
export const KitchenHistory = interop(() => import('../pages/kitchen/KitchenHistory'), 'KitchenHistory');
export const AdminDashboard = interop(() => import('../pages/admin/Dashboard'), 'AdminDashboard');
export const AdminProducts = interop(() => import('../pages/admin/Products'), 'AdminProducts');
export const AdminCategories = interop(() => import('../pages/admin/Categories'), 'AdminCategories');
export const AdminOrders = interop(() => import('../pages/admin/Orders'), 'AdminOrders');
export const AdminUsers = interop(() => import('../pages/admin/Users'), 'AdminUsers');
export const AdminReports = interop(() => import('../pages/admin/Reports'), 'AdminReports');
export const AdminSettings = interop(() => import('../pages/admin/Settings'), 'AdminSettings');
export const AdminLogs = interop(() => import('../pages/admin/Logs'), 'AdminLogs');
