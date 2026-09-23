import type { OrderStatus } from './order-status';
import type { PaymentMethod, PaymentStatus } from './money';
import type { Role } from './roles';

export type { PaymentMethod, PaymentStatus } from './money';
export type { OrderStatus } from './order-status';
export type { Role } from './roles';

/** Shape returned by every paginated list endpoint. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  hasMore: boolean;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Array<{ path: string; message: string }>;
  };
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  /** Short sign-in name for staff accounts; absent for email-only accounts. */
  username?: string | null;
  phone: string | null;
  role: Role;
  isActive: boolean;
  isProtected: boolean;
  avatarUrl: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AddressDTO {
  id: string;
  label: string;
  line1: string;
  area: string | null;
  city: string;
  notes: string | null;
  isDefault: boolean;
  createdAt: string;
}

export interface CategoryDTO {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount?: number;
}

export interface ProductDTO {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  price: number;
  ingredients: string[];
  prepTimeMinutes: number;
  isAvailable: boolean;
  stock: number;
  isArchived: boolean;
  isPopular: boolean;
  isNew: boolean;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItemDTO {
  id: string;
  productId: string | null;
  name: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  notes: string | null;
}

export interface OrderStatusEventDTO {
  id: string;
  status: OrderStatus;
  note: string | null;
  changedByName: string | null;
  createdAt: string;
}

export interface OrderDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  customerId: string;
  customerName: string;
  customerEmail: string;
  deliveryAddress: string;
  deliveryArea: string | null;
  deliveryPhone: string;
  notes: string | null;
  kitchenNote: string | null;
  cancelReason: string | null;
  subtotal: number;
  deliveryFee: number;
  tax: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  itemCount: number;
  items: OrderItemDTO[];
  timeline: OrderStatusEventDTO[];
  createdAt: string;
  updatedAt: string;
  acceptedAt: string | null;
  preparingAt: string | null;
  readyAt: string | null;
  outForDeliveryAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  estimatedReadyAt: string | null;
  driverId: string | null;
  driverName: string | null;
  /**
   * Delivery coordinates captured from the customer's device at checkout.
   * Null for orders placed before GPS capture was introduced — those fall back
   * to a clearly-labelled address estimate on the map.
   */
  deliveryLatitude: number | null;
  deliveryLongitude: number | null;
  hasReceipt?: boolean;
}

export interface NotificationDTO {
  id: string;
  title: string;
  body: string;
  type: 'ORDER_UPDATE' | 'PROMOTION' | 'BUSINESS_ALERT' | 'LOW_STOCK' | 'SYSTEM';
  audience: Role | 'USER';
  orderId: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface ReceiptDTO {
  receiptNumber: string;
  businessName: string;
  businessAddress: string;
  businessPhone: string;
  businessEmail: string;
  currencySymbol: string;
  orderNumber: string;
  orderId: string;
  issuedAt: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  items: OrderItemDTO[];
  subtotal: number;
  deliveryFee: number;
  tax: number;
  discount: number;
  total: number;
  qrDataUrl: string;
  verifyUrl: string;
}

export interface SettingsDTO {
  businessName: string;
  businessAddress: string;
  businessPhone: string;
  businessEmail: string;
  currencyCode: string;
  currencySymbol: string;
  deliveryFee: number;
  taxRate: number;
  minOrderTotal: number;
  acceptingOrders: boolean;
  supportPhone: string;
  supportEmail: string;
  lowStockThreshold: number;
  /** Kitchen / pickup coordinates used as the map anchor and route origin. */
  businessLatitude: number;
  businessLongitude: number;
  /**
   * Radius (km) around the kitchen that we deliver to. Orders whose captured
   * GPS falls outside this boundary are refused by the API.
   */
  deliveryRadiusKm: number;
  updatedAt: string | null;
}

export interface AnalyticsOverview {
  date: string;
  revenueToday: number;
  revenueMonth: number;
  ordersToday: number;
  ordersMonth: number;
  completedOrders: number;
  cancelledOrders: number;
  pendingOrders: number;
  activeOrders: number;
  averageOrderValue: number;
  completionRate: number;
  averagePrepMinutes: number;
  customersTotal: number;
  customersNewToday: number;
  activeKitchenStaff: number;
  lowStockProducts: Array<{ id: string; name: string; stock: number }>;
}

export interface ChartPoint {
  label: string;
  revenue: number;
  orders: number;
  delivered: number;
  cancelled: number;
  customers: number;
  averagePrepMinutes: number;
}

export interface TopProduct {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
}

export interface PeakHour {
  hour: number;
  label: string;
  orders: number;
}

export interface KitchenPerformanceRow {
  kitchenUserId: string | null;
  name: string;
  accepted: number;
  completed: number;
  averagePrepMinutes: number;
  cancellationRate: number;
}

export interface AnalyticsCharts {
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
  from: string;
  to: string;
  series: ChartPoint[];
  topProducts: TopProduct[];
  peakHours: PeakHour[];
  kitchenPerformance: KitchenPerformanceRow[];
  totals: {
    revenue: number;
    orders: number;
    delivered: number;
    cancelled: number;
    averageOrderValue: number;
    completionRate: number;
    averagePrepMinutes: number;
  };
}

export interface DeliveryZone {
  name: string;
  fee: number;
}

/** Notification audience, mirroring the Prisma NotificationAudience enum. */
export type NotificationAudience = 'USER' | 'CUSTOMER' | 'KITCHEN' | 'DRIVER' | 'ADMIN';

/** Report taxonomy, mirroring the Prisma ReportType / ReportFormat enums. */
export type ReportType = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type ReportFormat = 'PDF' | 'EXCEL';

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  YEARLY: 'Yearly',
};

export const REPORT_FORMAT_LABELS: Record<ReportFormat, string> = {
  PDF: 'PDF document',
  EXCEL: 'Excel workbook',
};


export const ORDER_STATUS_VALUES: OrderStatus[] = [
  'RECEIVED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
];

export const PAYMENT_METHOD_VALUES: PaymentMethod[] = ['CASH', 'MOBILE_MONEY'];

/** A line rebuilt from a past order for a quick reorder. */
export interface ReorderLine {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string | null;
  available: boolean;
  reason?: string;
  notes?: string | null;
}

export interface ReorderResult {
  orderNumber: string;
  lines: ReorderLine[];
  unavailable: ReorderLine[];
}

export interface FavoriteDTO {
  id: string;
  createdAt: string;
  product: ProductDTO;
}