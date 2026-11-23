import { useEffect } from 'react';

export default function PhotoLightbox({ src, name, onClose }) {
  useEffect(() => {
    if (!src) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div
      className="photo-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={name ? `${name} preview` : 'Photo preview'}
      onClick={onClose}
    >
      <button type="button" className="photo-lightbox-close" onClick={onClose}>
        Close
      </button>
      <img
        src={src}
        alt={name || 'Photo preview'}
        className="photo-lightbox-img"
        onClick={(e) => e.stopPropagation()}
      />
      {name && <p className="photo-lightbox-name">{name}</p>}
    </div>
  );
}
