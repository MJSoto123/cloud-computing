// App.jsx
import React, { useState, useEffect, useCallback } from "react";
import "./App.css";
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function App() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ nombre: "", costo: "", cantidad: "" });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const safeNumber = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const fetchItems = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      console.log("get", `${API_BASE}/api/items`);
      const res = await fetch(`${API_BASE}/api/items`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`GET /items → ${res.status}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const addItem = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const payload = {
        nombre: form.nombre.trim(),
        costo: safeNumber(form.costo),
        cantidad: safeNumber(form.cantidad),
      };
      const res = await fetch(`${API_BASE}/api/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`POST /items → ${res.status}`);
      setForm({ nombre: "", costo: "", cantidad: "" });
      await fetchItems();
    } catch (e) {
    } finally {
      setSubmitting(false);
    }
  };

  const deleteItem = async (id) => {
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/items/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`DELETE /items/:id → ${res.status}`);
      await fetchItems();
    } catch {
    }
  };

  return (
    <div className="container">
      <h1>📦 Inventario</h1>

      <form onSubmit={addItem} className="form">
        <input
          placeholder="Nombre"
          value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
          required
        />
        <input
          placeholder="Costo"
          type="number"
          inputMode="decimal"
          value={form.costo}
          onChange={(e) => setForm({ ...form, costo: e.target.value })}
          required
          min="0"
        />
        <input
          placeholder="Cantidad"
          type="number"
          inputMode="numeric"
          value={form.cantidad}
          onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
          required
          min="0"
        />
        <button type="submit" disabled={submitting}>
          {submitting ? "Agregando..." : "Agregar"}
        </button>
      </form>

      {error && <p className="error">⚠️ {error}</p>}
      {loading ? (
        <p>Cargando...</p>
      ) : (
        <ul className="list">
          {items.map((i) => (
            <li key={i._id} className="item">
              <span>{i.nombre} — S/{i.costo} — x{i.cantidad}</span>
              <button onClick={() => deleteItem(i._id)} aria-label={`Eliminar ${i.nombre}`}>x</button>
            </li>
          ))}
          {items.length === 0 && <li>Sin registros todavía.</li>}
        </ul>
      )}
    </div>
  );
}
