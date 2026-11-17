import React from 'react';

interface AmanRayanEmblemProps {
  className?: string;
  alt?: string;
}

export const AmanRayanEmblem: React.FC<AmanRayanEmblemProps> = ({
  className = 'h-10 w-10',
  alt = 'Aman Rayan — أمان ريان',
}) => {
  return (
    <picture className="inline-flex shrink-0 items-center justify-center">
      <source srcSet="/assets/aman-rayan-emblem.webp" type="image/webp" />
      <img
        src="/assets/aman-rayan-emblem.png"
        alt={alt}
        draggable={false}
        decoding="async"
        className={`object-contain select-none ${className}`}
      />
    </picture>
  );
};
