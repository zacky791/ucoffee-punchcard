export default function PhotoLightbox({ src, name, onClose }) {
  if (!src) return null;

  return (
    <div
      className="photo-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`${name || 'Staff'} photo`}
      onClick={onClose}
    >
      <button type="button" className="photo-lightbox-close" onClick={onClose}>
        Close
      </button>
      <img
        src={src}
        alt={name || 'Staff photo'}
        className="photo-lightbox-img"
        onClick={(e) => e.stopPropagation()}
      />
      {name && <p className="photo-lightbox-name">{name}</p>}
    </div>
  );
}
