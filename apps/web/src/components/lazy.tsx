import { lazy, type ComponentType } from 'react';

/**
 * Retries a dynamic import exactly once. Deploying a new release can swap the
 * hashed chunk names while a tab is still open; one quick re-import normally
 * fetches the fresh chunk. A second failure propagates to the route's
 * ErrorBoundary, which offers an explicit "Reload app" — never an automatic
 * reload loop.
 */
function importWithRetry<T>(loader: () => Promise<T>): () => Promise<T> {
  return () =>
    loader().catch(
      () =>
        new Promise<T>((resolve, reject) => {
          window.setTimeout(() => {
            loader().then(resolve, reject);
          }, 350);
        }),
    );
}

function interop(loader: () => Promise<object>, name: string) {
  return lazy(
    importWithRetry(async () => {
      const mod = (await loader()) as Record<string, ComponentType>;
      return { default: mod[name] as ComponentType };
    }),
  ) as ComponentType;
}

export const CustomerHome: ComponentType = lazy(importWithRetry(() => import('../pages/customer/Home')));
export const DriverDeliveries: ComponentType = lazy(importWithRetry(() => import('../pages/driver/Deliveries')));
export const DriverMap: ComponentType = lazy(importWithRetry(() => import('../pages/driver/Map')));
export const DriverEarnings: ComponentType = lazy(importWithRetry(() => import('../pages/driver/Earnings')));
export const DriverProfile: ComponentType = lazy(importWithRetry(() => import('../pages/driver/Profile')));
export const CustomerTracking: ComponentType = lazy(importWithRetry(() => import('../pages/customer/Tracking')));
export const AccountSettings = interop(() => import('../pages/Settings'), 'AccountSettings');
export const Menu = interop(() => import('../pages/customer/Menu'), 'Menu');
export const ProductPage = interop(() => import('../pages/customer/Product'), 'ProductPage');
export const Cart = interop(() => import('../pages/customer/Cart'), 'Cart');
export const Checkout = interop(() => import('../pages/customer/Checkout'), 'Checkout');
export const Orders = interop(() => import('../pages/customer/Orders'), 'Orders');
export const OrderDetail = interop(() => import('../pages/customer/OrderDetail'), 'OrderDetail');
export const Profile = interop(() => import('../pages/customer/Profile'), 'Profile');
export const KitchenQueue = interop(() => import('../pages/kitchen/Kitchen'), 'KitchenQueue');
export const AdminDashboard = interop(() => import('../pages/admin/Dashboard'), 'AdminDashboard');
export const AdminProducts = interop(() => import('../pages/admin/Products'), 'AdminProducts');
export const KitchenProducts = interop(() => import('../pages/admin/Products'), 'AdminProducts');
export const AdminCategories = interop(() => import('../pages/admin/Categories'), 'AdminCategories');
export const AdminOrders = interop(() => import('../pages/admin/Orders'), 'AdminOrders');
export const AdminUsers = interop(() => import('../pages/admin/Users'), 'AdminUsers');
export const AdminReports = interop(() => import('../pages/admin/Reports'), 'AdminReports');
export const AdminSettings = interop(() => import('../pages/admin/Settings'), 'AdminSettings');
export const AdminLogs = interop(() => import('../pages/admin/Logs'), 'AdminLogs');
