import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CategoryDTO, Paginated } from '@delivery/shared';
import { api } from '../../lib/api';
import { useRealtimeSync } from '../../lib/realtime';
import { Button, Card, EmptyState, Field, Input, Modal, Spinner, Textarea } from '../../components/ui';
import { toast } from '../../lib/realtime';

export function AdminCategories() {
  useRealtimeSync();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CategoryDTO | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => api.get<Paginated<CategoryDTO>>('/categories?pageSize=100'),
    staleTime: 30_000,
  });
  const categories = data?.items ?? [];

  const save = async (data: { name: string; slug: string; description?: string; isActive: boolean }) => {
    setSaving(true);
    try {
      if (editing) await api.patch(`/categories/${editing.id}`, data);
      else await api.post('/categories', data);
      await queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      toast(editing ? 'Category updated' : 'Category created', 'success');
      setEditing(null);
      setCreating(false);
    } catch (error: any) {
      toast(error?.message ?? 'Failed to save category', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (category: CategoryDTO) => {
    if (!confirm(`Delete "${category.name}"? Categories that still have products may be rejected.`)) return;
    try {
      await api.del(`/categories/${category.id}`);
      await queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      toast('Category deleted', 'success');
    } catch (error: any) {
      toast(error?.message ?? 'Failed to delete category', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-slate-900 lg:text-3xl">Categories</h1>
        <p className="mt-1 text-sm text-slate-500">Organize your product catalogue.</p>
        <Button onClick={() => setCreating(true)}>Add category</Button>
      </div>

      {isLoading ? (
        <Spinner className="mx-auto my-12 h-8 w-8" />
      ) : categories.length === 0 ? (
        <EmptyState title="No categories" hint="Create your first category to organize products." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <Card key={category.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-slate-900">{category.name}</p>
                  <p className="text-sm text-slate-500">{category.slug}</p>
                  {category.description && <p className="mt-1 text-sm text-slate-600">{category.description}</p>}
                  {category.productCount !== undefined && (
                    <p className="mt-1 text-sm text-slate-500">{category.productCount} product(s)</p>
                  )}
                </div>
                <div className="flex flex-none gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(category)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-700" onClick={() => remove(category)}>
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <CategoryDialog
          key={editing?.id ?? 'new'}
          category={editing}
          saving={saving}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={save}
        />
      )}
    </div>
  );
}

function CategoryDialog({
  category,
  saving,
  onClose,
  onSave,
}: {
  category: CategoryDTO | null;
  saving: boolean;
  onClose: () => void;
  onSave: (data: { name: string; slug: string; description?: string; isActive: boolean }) => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [slug, setSlug] = useState(category?.slug ?? '');
  const [description, setDescription] = useState(category?.description ?? '');
  const [isActive, setIsActive] = useState(category?.isActive ?? true);

  return (
    <Modal open title={category ? 'Edit category' : 'Add category'} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Name">
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Slug" hint="Used in URLs, e.g. burgers">
          <Input value={slug} onChange={(event) => setSlug(event.target.value)} />
        </Field>
        <Field label="Description">
          <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            className="h-5 w-5 rounded border-slate-300 bg-slate-100"
          />
          Active (visible to customers)
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          loading={saving}
          onClick={() => {
            if (name.trim().length < 2 || slug.trim().length < 2) {
              toast('Name and slug are required', 'warning');
              return;
            }
            onSave({ name: name.trim(), slug: slug.trim(), description: description.trim() || undefined, isActive });
          }}
        >
          Save
        </Button>
      </div>
    </Modal>
  );
}
