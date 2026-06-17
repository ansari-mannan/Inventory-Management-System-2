import React, { useState } from 'react';

const EMPTY = { name: '', sku: '', category: '', quantity: 0, price: 0 };

// Modal form used for both Add and Edit. `initial` is null for Add.
export default function ItemForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isEdit = Boolean(initial);

  const update = (field) => (e) =>
    setForm({ ...form, [field]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        sku: form.sku.trim(),
        category: form.category?.trim() || null,
        quantity: Number(form.quantity),
        price: Number(form.price),
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? 'Edit Item' : 'Add Item'}</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Name *
            <input value={form.name} onChange={update('name')} required />
          </label>
          <label>
            SKU *
            <input value={form.sku} onChange={update('sku')} required />
          </label>
          <label>
            Category
            <input value={form.category || ''} onChange={update('category')} />
          </label>
          <div className="row">
            <label>
              Quantity
              <input
                type="number"
                min="0"
                step="1"
                value={form.quantity}
                onChange={update('quantity')}
              />
            </label>
            <label>
              Price
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={update('price')}
              />
            </label>
          </div>

          {error && <p className="error">{error}</p>}

          <div className="actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
