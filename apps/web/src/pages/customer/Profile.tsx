import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AddressDTO, AuthUser, ProductDTO } from '@delivery/shared';
import { formatMoney, initials } from '@delivery/shared';
import { api, mediaUrl } from '../../lib/api';
import { useCart } from '../../lib/cart';
import { useAuth } from '../../lib/auth';
import { toast } from '../../lib/realtime';
import { Button, Card, EmptyState, Field, Input, Spinner } from '../../components/ui';
import { ImageIcon } from '../../components/icons';

export function Profile() {
  const { user, setUser, logout } = useAuth();
  const queryClient = useQueryClient();

  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<{ user: AuthUser; addresses: AddressDTO[]; stats: { orders: number; favorites: number } }>('/users/me'),
  });

  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [showAddressForm, setShowAddressForm] = useState(false);

  const saveProfile = useMutation({
    mutationFn: () => api.patch<{ user: AuthUser }>('/users/me', { name, phone }),
    onSuccess: (data) => {
      setUser(data.user);
      toast('Profile updated', 'success');
 void queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (error) => toast(error instanceof Error ? error.message : 'Could not save profile', 'error'),
  });

  if (me.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  const data = me.data;
  if (!data) return <EmptyState title="Could not load your profile" hint="Pull down to retry or sign in again." />;

  return (
    <div className="space-y-4">
      <Card className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-red-600 to-cyan-500 text-lg font-extrabold text-white">
          {initials(data.user.name)}
        </div>
        <div>
          <p className="text-base font-extrabold text-slate-900">{data.user.name}</p>
          <p className="text-sm text-slate-500">{data.user.email}</p>
          <p className="mt-1 text-sm text-slate-500">
            {data.stats.orders} orders · {data.stats.favorites} favorites
          </p>
        </div>
      </Card>

      <Card className="space-y-4">
        <p className="text-sm font-bold text-slate-800">Personal details</p>
        <Field label="Name">
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Phone">
          <Input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" />
        </Field>
        <Button loading={saveProfile.isPending} onClick={() => saveProfile.mutate()} className="w-full">
          Save changes
        </Button>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-800">Saved addresses</p>
          <button onClick={() => setShowAddressForm((value) => !value)} className="text-sm font-semibold text-red-600 hover:underline">
            {showAddressForm ? 'Hide form' : 'Add new'}
          </button>
        </div>
        {showAddressForm && (
          <AddressForm
            onDone={() => {
              setShowAddressForm(false);
              void queryClient.invalidateQueries({ queryKey: ['me'] });
              void queryClient.invalidateQueries({ queryKey: ['addresses'] });
            }}
          />
        )}
        <div className="space-y-2">
          {data.addresses.map((address) => (
            <AddressRow key={address.id} address={address} onChanged={() => void queryClient.invalidateQueries({ queryKey: ['me'] })} />
          ))}
          {data.addresses.length === 0 && <p className="text-sm text-slate-500">No saved addresses yet.</p>}
        </div>
      </Card>

      <FavoritesCard />

      <Button variant="danger" className="w-full" onClick={() => void logout()}>
        Sign out
      </Button>
    </div>
  );
}

function AddressRow({ address, onChanged }: { address: AddressDTO; onChanged: () => void }) {
  const queryClient = useQueryClient();

  const setDefault = useMutation({
    mutationFn: () => api.post('/addresses/' + address.id + '/default'),
    onSuccess: () => {
      toast('Default address updated', 'success');
      onChanged();
      void queryClient.invalidateQueries({ queryKey: ['addresses'] });
    },
    onError: (error) => toast(error instanceof Error ? error.message : 'Could not update address', 'error'),
  });

  const remove = useMutation({
    mutationFn: () => api.del('/addresses/' + address.id),
    onSuccess: () => {
      toast('Address removed', 'info');
      onChanged();
      void queryClient.invalidateQueries({ queryKey: ['addresses'] });
    },
    onError: (error) => toast(error instanceof Error ? error.message : 'Could not remove address', 'error'),
  });

  return (
    <div className={address.isDefault ? 'rounded-2xl border border-red-600/40 bg-red-50 p-3' : 'rounded-2xl border border-slate-200 bg-slate-100 p-3'}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-slate-900">
            {address.label} {address.isDefault && <span className="text-sm font-semibold text-red-600">· default</span>}
          </p>
          <p className="text-sm text-slate-600">
            {address.line1}
            {address.area ? `, ${address.area}` : ''}, {address.city}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {!address.isDefault && (
            <button onClick={() => setDefault.mutate()} className="text-sm font-semibold text-red-600 hover:underline">
              Default
            </button>
          )}
          <button onClick={() => remove.mutate()} className="text-sm font-semibold text-red-700 hover:underline">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function AddressForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ label: 'Home', line1: '', area: '', city: '' });
  const create = useMutation({
    mutationFn: () => api.post('/addresses', { ...form, area: form.area || undefined }),
    onSuccess: () => {
      toast('Address saved', 'success');
      onDone();
    },
    onError: (error) => toast(error instanceof Error ? error.message : 'Could not save address', 'error'),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-slate-200 bg-white/[0.03] p-4">
      <Field label="Label">
        <Input value={form.label} onChange={(event) => setForm((c) => ({ ...c, label: event.target.value }))} placeholder="Home / Work" />
      </Field>
      <Field label="Street address">
        <Input required minLength={5} value={form.line1} onChange={(event) => setForm((c) => ({ ...c, line1: event.target.value }))} placeholder="12 Independence Avenue" />
      </Field>
      <Field label="Area (optional)">
        <Input value={form.area} onChange={(event) => setForm((c) => ({ ...c, area: event.target.value }))} placeholder="Osu" />
      </Field>
      <Field label="City">
        <Input required value={form.city} onChange={(event) => setForm((c) => ({ ...c, city: event.target.value }))} placeholder="Accra" />
      </Field>
      <Button type="submit" className="w-full" loading={create.isPending}>
        Save address
      </Button>
    </form>
  );
}

function FavoritesCard() {
  const { add } = useCart();
  const { data, isLoading } = useQuery({
    queryKey: ['favorites'],
    queryFn: () => api.get<{ favorites: Array<{ product: ProductDTO }> }>('/favorites'),
  });

  const items = (data?.favorites ?? []).map((entry) => entry.product).filter(Boolean);

  return (
    <Card className="space-y-3">
      <p className="text-sm font-bold text-slate-800">Favorites</p>
      {isLoading ? (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">Tap the heart on any menu item to save it here.</p>
      ) : (
        <div className="space-y-2">
          {items.map((product) => (
            <div key={product.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-100 p-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 overflow-hidden rounded-xl bg-slate-100">
                  {mediaUrl(product.imageUrl) ? (
                    <img src={mediaUrl(product.imageUrl) as string} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-300">
                        <ImageIcon className="h-5 w-5 text-red-600" />
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{product.name}</p>
                  <p className="text-xs text-red-600">{formatMoney(product.price)}</p>
                </div>
              </div>
              <Button size="sm" onClick={() => { add(product); toast(`Added ${product.name}`, 'success'); }}>
                Add
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
