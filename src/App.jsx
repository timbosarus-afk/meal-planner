import React, { useEffect, useState } from 'react';
import { api } from './lib/api.js';
import { displayName } from './lib/format.js';

export default function App() {
  const [recipes, setRecipes] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api.recipes().then(setRecipes).catch(e => setError(e.message)); }, []);
  return (
    <div className="page">
      <h1 className="page-title">Recipes</h1>
      {error && <p className="text-red-700 mt-4">{error}</p>}
      {!recipes && !error && <p className="mt-4" style={{ color: 'var(--text-soft)' }}>Loading…</p>}
      <div className="mt-4 grid gap-2">
        {recipes && recipes.map(r => <div key={r.id} className="card p-3">{displayName(r)}</div>)}
      </div>
    </div>
  );
}
