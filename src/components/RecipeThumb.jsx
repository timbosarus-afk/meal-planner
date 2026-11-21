import React, { useState } from 'react';
import { UtensilsCrossed } from 'lucide-react';

// Photo if there is one (and it loads), otherwise a soft green tile with an icon.
export default function RecipeThumb({ recipe, className = '', rounded = 'rounded-2xl', iconSize = 26 }) {
  const [broken, setBroken] = useState(false);
  if (recipe && recipe.image_url && !broken) {
    return <img src={recipe.image_url} alt="" loading="lazy" onError={() => setBroken(true)} className={`object-cover ${rounded} ${className}`} />;
  }
  return (
    <div className={`flex items-center justify-center ${rounded} ${className}`}
      style={{ background: 'linear-gradient(135deg, #E7F0EC 0%, #D3E5DC 100%)', color: 'var(--green-mid)' }}>
      <UtensilsCrossed size={iconSize} strokeWidth={1.8} />
    </div>
  );
}
