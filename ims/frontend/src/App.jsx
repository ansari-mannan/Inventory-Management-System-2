import React, { useEffect, useState, useCallback } from 'react';
import { listItems, createItem, updateItem, deleteItem } from './api.js';
import ItemForm from './ItemForm.jsx';
import { useTheme } from './useTheme.js';

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(undefined); // undefined=closed, null=add, obj=edit

  const load = useCallback(async (q) => {
    setLoading(true);
    setError('');
    try {
      setItems(await listItems(q));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search.
  useEffect(() => {
    const t = setTimeout(() => load(search), 250);
    return () => clearTimeout(t);
  }, [search, load]);

  async function handleSave(data) {
    if (editing) {
      await updateItem(editing.id, data);
    } else {
      await createItem(data);
    }
    setEditing(undefined);
    await load(search);
  }

  async function handleDelete(item) {
    if (!window.confirm(`Delete "${item.name}" (${item.sku})?`)) return;
    try {
      await deleteItem(item.id);
      await load(search);
    } catch (err) {
      setError(err.message);
    }
  }

  // Inline quantity +/- adjustment.
  async function adjustQty(item, delta) {
    const next = item.quantity + delta;
    if (next < 0) return;
    try {
      await updateItem(item.id, { quantity: next });
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, quantity: next } : it))
      );
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="container">
      <header>
        <h1>Inventory Management System</h1>
        <div className="header-actions">
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle dark mode"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button className="btn-primary" onClick={() => setEditing(null)}>
            + Add Item
          </button>
        </div>
      </header>

      <input
        className="search"
        type="search"
        placeholder="Search by name, SKU, or category…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {error && <p className="error banner">{error}</p>}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="muted">
          {search ? 'No items match your search.' : 'No items yet. Add one to get started.'}
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>SKU</th>
              <th>Category</th>
              <th>Quantity</th>
              <th>Price</th>
              <th aria-label="actions"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td className="mono">{item.sku}</td>
                <td>{item.category || '—'}</td>
                <td>
                  <div className="qty">
                    <button onClick={() => adjustQty(item, -1)} aria-label="decrease">−</button>
                    <span>{item.quantity}</span>
                    <button onClick={() => adjustQty(item, 1)} aria-label="increase">+</button>
                  </div>
                </td>
                <td>${Number(item.price).toFixed(2)}</td>
                <td className="row-actions">
                  <button className="btn-link" onClick={() => setEditing(item)}>Edit</button>
                  <button className="btn-link danger" onClick={() => handleDelete(item)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing !== undefined && (
        <ItemForm
          initial={editing}
          onSave={handleSave}
          onCancel={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}
