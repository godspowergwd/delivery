import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CategoryDTO, Paginated, ProductDTO } from '@delivery/shared';
import { formatMoney } from '@delivery/shared';
import { api, mediaUrl } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useRealtimeSync } from '../../lib/realtime';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Spinner, Textarea } from '../../components/ui';
import { toast } from '../../lib/realtime';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ImageIcon } from '../../components/icons';

export function AdminProducts() {
  useRealtimeSync();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(true);
  const [editing, setEditing] = useState<ProductDTO | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ProductDTO | null>(null);
  const { user } = useAuth();
  const canDelete = user?.role === 'ADMIN';

  const { data, isLoading } = useQuery({
    queryKey: ['admin-products', search, showArchived],
    queryFn: () =>
      api.get<Paginated<ProductDTO>>(
        `/products?pageSize=100${showArchived ? '&includeArchived=true' : ''}${search ? `&q=${encodeURIComponent(search)}` : ''}`,
      ),
    staleTime: 15_000,
  });

  const products = data?.items ?? [];

  const setArchived = async (product: ProductDTO, isArchived: boolean) => {
    try {
      await api.patch(`/products/${product.id}`, { isArchived });
      void queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      toast(isArchived ? 'Product archived' : 'Product restored', 'success');
    } catch (error: any) {
      toast(error?.message ?? 'Failed to update product', 'error');
    }
  };

  const remove = async (product: ProductDTO) => {
    if (!canDelete) {
      toast('Only admins can delete products', 'info');
    return;
    }
    setPendingDelete(null);
    try {
      await api.del(`/products/${product.id}`);
      void queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      toast('Product deleted', 'success');
    } catch (error: any) {
      toast(error?.message ?? 'Failed to delete product', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-slate-900">Products</h1>
        <Button onClick={() => setCreating(true)}>+ Add product</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search products…"
          className="max-w-xs"
          aria-label="Search products"
        />
        <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-100 px-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
            className="h-5 w-5 rounded border-slate-300 bg-slate-100"
          />
          Show archived
        </label>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-8 w-8" />
        </div>
      ) : products.length === 0 ? (
        <EmptyState title="No products yet" hint="Add your first product so customers can start ordering." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <Card key={product.id} className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                {product.imageUrl ? (
                  <img src={mediaUrl(product.imageUrl) ?? undefined} alt="" className="h-16 w-16 flex-none rounded-2xl object-cover" />
                ) : (
                  <div className="flex h-16 w-16 flex-none items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <ImageIcon className="h-10 w-10" />
              </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-slate-900">{product.name}</p>
                  <p className="text-sm text-slate-500">{product.categoryName}</p>
                  <p className="mt-1 text-sm font-extrabold text-red-600">{formatMoney(product.price)}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {product.isArchived ? (
                  <Badge variant="destructive">Archived</Badge>
                ) : !product.isAvailable ? (
                  <Badge variant="warning">Unavailable</Badge>
                ) : null}
                {!product.isArchived && product.stock <= 5 && <Badge variant="warning">Stock: {product.stock}</Badge>}
                {product.isPopular && <Badge variant="default">Popular</Badge>}
              </div>

              <div className="mt-auto flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(product)}>
                  Edit
                </Button>
                {product.isArchived ? (
                  <Button size="sm" variant="ghost" onClick={() => setArchived(product, false)}>
                    Restore
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setArchived(product, true)}>
                    Archive
                  </Button>
                )}
                {canDelete && (
                  <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setPendingDelete(product)}>
                    Delete
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete product"
        message={`Permanently delete "${pendingDelete?.name ?? ''}"? Products tied to active orders cannot be deleted.`}
        confirmLabel="Delete forever"
        busy={false}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const product = pendingDelete;
          if (product) void remove(product);
        }}
      />

      {(creating || editing) && (
        <ProductDialog
          key={editing?.id ?? 'new'}
          product={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ProductDialog({ product, onClose }: { product: ProductDTO | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => api.get<Paginated<CategoryDTO>>('/categories?pageSize=100'),
    staleTime: 60_000,
  });
  const categories = data?.items ?? [];

  const [form, setForm] = useState({
    name: product?.name ?? '',
    description: product?.description ?? '',
    price: String(product?.price ?? ''),
    categoryId: product?.categoryId ?? '',
    stock: String(product?.stock ?? 50),
    prepTimeMinutes: String(product?.prepTimeMinutes ?? 15),
    isAvailable: product?.isAvailable ?? true,
    isPopular: product?.isPopular ?? false,
    isNew: product?.isNew ?? true,
    imageUrl: (product?.imageUrl ?? null) as string | null,
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const update = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await api.upload<{ url: string }>('/uploads', formData);
      update({ imageUrl: result.url });
      toast('Image uploaded', 'success');
    } catch (error: any) {
      toast(error?.message ?? 'Image upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      categoryId: form.categoryId,
      stock: Number(form.stock),
      prepTimeMinutes: Number(form.prepTimeMinutes),
      isAvailable: form.isAvailable,
      isPopular: form.isPopular,
      isNew: form.isNew,
      imageUrl: form.imageUrl,
    };
    if (payload.name.length < 2) return toast('Product name is too short', 'warning');
    if (payload.description.length < 4) return toast('Add a short description', 'warning');
    if (!Number.isFinite(payload.price) || payload.price < 0) return toast('Enter a valid price', 'warning');
    if (!payload.categoryId) return toast('Choose a category', 'warning');

    setSaving(true);
    try {
      if (product) await api.patch(`/products/${product.id}`, payload);
      else await api.post('/products', payload);
      void queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      toast(product ? 'Product updated' : 'Product created', 'success');
      onClose();
    } catch (error: any) {
      toast(error?.message ?? 'Failed to save product', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={product ? 'Edit product' : 'New product'} onClose={onClose} wide>
      <div className="space-y-3">
        <Field label="Name">
          <Input value={form.name} onChange={(event) => update({ name: event.target.value })} />
        </Field>
        <Field label="Description">
          <Textarea value={form.description} onChange={(event) => update({ description: event.target.value })} rows={3} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price">
            <Input type="number" min="0" step="0.01" value={form.price} onChange={(event) => update({ price: event.target.value })} />
          </Field>
          <Field label="Category">
            <Select value={form.categoryId} onChange={(event) => update({ categoryId: event.target.value })}>
              <option value="">Choose…</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Stock">
            <Input type="number" min="0" value={form.stock} onChange={(event) => update({ stock: event.target.value })} />
          </Field>
          <Field label="Prep minutes">
            <Input
              type="number"
              min="1"
              value={form.prepTimeMinutes}
              onChange={(event) => update({ prepTimeMinutes: event.target.value })}
            />
          </Field>
        </div>

        <Field label="Image">
          <div className="flex items-center gap-3">
            {form.imageUrl ? (
              <img src={mediaUrl(form.imageUrl) ?? undefined} alt="" className="h-14 w-14 rounded-2xl object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <ImageIcon className="h-6 w-6" />
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadImage(file);
              }}
            />
            <Button size="sm" variant="outline" loading={uploading} onClick={() => fileRef.current?.click()}>
              Upload image
            </Button>
            {form.imageUrl && (
              <Button size="sm" variant="ghost" onClick={() => update({ imageUrl: null })}>
                Remove
              </Button>
            )}
          </div>
        </Field>

        <div className="flex flex-wrap gap-4 text-sm text-slate-700">
          {(
            [
              ['isAvailable', 'Available'],
              ['isPopular', 'Popular'],
              ['isNew', 'Show as new'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form[key]}
                onChange={(event) => update({ [key]: event.target.checked })}
                className="h-5 w-5 rounded border-slate-300 bg-slate-100"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button loading={saving} onClick={() => void save()}>
          {product ? 'Save changes' : 'Create product'}
        </Button>
      </div>
    </Modal>
  );
}
