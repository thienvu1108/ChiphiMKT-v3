import React, { useEffect, useRef, useState } from 'react';

interface DraggableTableContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  sensitivity?: number;
  momentum?: boolean;
}

export const DraggableTableContainer = React.forwardRef<HTMLDivElement, DraggableTableContainerProps>(
  ({ children, className = '', sensitivity = 1, momentum = true, ...props }, forwardedRef) => {
    const internalRef = useRef<HTMLDivElement | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    // Sync forwardedRef if provided
    const setRef = (node: HTMLDivElement | null) => {
      internalRef.current = node;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef) {
        (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    };

    useEffect(() => {
      const slider = internalRef.current;
      if (!slider) return;

      let isDown = false;
      let startX = 0;
      let startScrollLeft = 0;
      let hasMoved = false;
      let lastClientX = 0;
      let lastTime = 0;
      let velocityX = 0;
      let inertiaRaf: number | null = null;

      const handleDragStart = (e: DragEvent) => {
        e.preventDefault();
      };

      const handleMouseDown = (e: MouseEvent) => {
        // Only primary mouse button
        if (e.button !== 0) return;

        if (inertiaRaf) {
          cancelAnimationFrame(inertiaRaf);
          inertiaRaf = null;
        }

        const target = e.target as HTMLElement;
        // Don't drag if clicking interactive form inputs or buttons
        if (target.closest('input:not([type="checkbox"]), select, textarea, button, a, [role="button"], label:not(.drag-ok), .no-drag, [data-no-drag]')) {
          return;
        }

        isDown = true;
        hasMoved = false;
        startX = e.clientX;
        lastClientX = e.clientX;
        lastTime = performance.now();
        velocityX = 0;
        startScrollLeft = slider.scrollLeft;

        e.preventDefault();

        slider.classList.add('cursor-grabbing');
        slider.classList.remove('cursor-grab');
        document.body.style.userSelect = 'none';
        setIsDragging(true);
      };

      const handleMouseMove = (e: MouseEvent) => {
        if (!isDown) return;
        const currentX = e.clientX;
        const dx = (currentX - startX) * sensitivity;

        const now = performance.now();
        const dt = now - lastTime;
        if (dt > 0) {
          const instantVelocity = ((lastClientX - currentX) * sensitivity) / dt;
          velocityX = 0.7 * instantVelocity + 0.3 * velocityX;
          lastClientX = currentX;
          lastTime = now;
        }

        if (Math.abs(dx) > 3) {
          hasMoved = true;
          e.preventDefault();
        }

        slider.scrollLeft = startScrollLeft - dx;
      };

      const handleMouseUp = () => {
        if (!isDown) return;
        isDown = false;
        setIsDragging(false);
        slider.classList.remove('cursor-grabbing');
        slider.classList.add('cursor-grab');
        document.body.style.userSelect = '';

        if (momentum && hasMoved && Math.abs(velocityX) > 0.12) {
          let currentVelocity = velocityX * 16;
          const friction = 0.93;

          const glide = () => {
            if (Math.abs(currentVelocity) < 0.3) {
              inertiaRaf = null;
              return;
            }
            slider.scrollLeft += currentVelocity;
            currentVelocity *= friction;
            inertiaRaf = requestAnimationFrame(glide);
          };
          inertiaRaf = requestAnimationFrame(glide);
        }
      };

      const handleClickCapture = (e: MouseEvent) => {
        if (hasMoved) {
          e.stopPropagation();
          e.preventDefault();
          hasMoved = false;
        }
      };

      const handleWheel = (e: WheelEvent) => {
        if (e.shiftKey) {
          e.preventDefault();
          slider.scrollLeft += e.deltaY * 1.2;
        }
      };

      slider.classList.add('cursor-grab');
      slider.addEventListener('dragstart', handleDragStart);
      slider.addEventListener('mousedown', handleMouseDown);
      slider.addEventListener('click', handleClickCapture, true);
      slider.addEventListener('wheel', handleWheel, { passive: false });
      window.addEventListener('mousemove', handleMouseMove, { passive: false });
      window.addEventListener('mouseup', handleMouseUp);

      return () => {
        if (inertiaRaf) {
          cancelAnimationFrame(inertiaRaf);
        }
        slider.removeEventListener('dragstart', handleDragStart);
        slider.removeEventListener('mousedown', handleMouseDown);
        slider.removeEventListener('click', handleClickCapture, true);
        slider.removeEventListener('wheel', handleWheel);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = '';
      };
    }, [sensitivity, momentum]);

    return (
      <div
        ref={setRef}
        className={`overflow-x-auto select-none ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

DraggableTableContainer.displayName = 'DraggableTableContainer';
