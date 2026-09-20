import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { useCart } from '../../lib/cart';
import { Card, Button } from '../../components/ui';
import { MapPinIcon, ReceiptIcon, SearchIcon, UserIcon } from '../../components/icons';
import type { ComponentType } from 'react';

export default function CustomerHome() {
  const { user } = useAuth();
  const { lines, itemCount } = useCart();

  const cards: Array<{
    to: string;
    label: string;
    hint: string;
    action: string;
    icon: ComponentType<{ className?: string }>;
    tile: string;
  }> = [
    {
      to: '/app/menu',
      label: 'Browse the menu',
      hint: 'See all available products and categories.',
      action: 'Browse menu',
      icon: SearchIcon,
      tile: 'bg-red-50 text-red-600',
    },
    {
      to: '/app/orders',
      label: 'Your orders',
      hint: 'Track deliveries and reorder favourites.',
      action: 'View orders',
      icon: ReceiptIcon,
      tile: 'bg-slate-100 text-slate-600',
    },
    {
      to: '/app/cart',
      label: 'Your cart',
      hint:
        itemCount > 0
          ? `${itemCount} item${itemCount === 1 ? '' : 's'} ready for checkout`
          : 'Your cart is empty',
      action: 'Go to cart',
      icon: MapPinIcon,
      tile: 'bg-slate-100 text-slate-600',
    },
    {
      to: '/app/profile',
      label: 'Your profile',
      hint: 'Manage your details and addresses.',
      action: 'Open profile',
      icon: UserIcon,
      tile: 'bg-slate-100 text-slate-600',
    },
  ];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold text-slate-900 lg:text-3xl">
          Welcome{user?.name ? `, ${user.name}` : ''}
        </h1>
        <p className="mt-1 text-[15px] text-slate-500">What would you like to do today?</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <Card key={card.to} className="flex flex-col gap-3 !p-5">
            <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${card.tile}`}>
              <card.icon className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">{card.label}</h2>
              <p className="mt-0.5 text-sm text-slate-500">{card.hint}</p>
            </div>
            <Link to={card.to} className="mt-auto">
              <Button>{card.action}</Button>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
