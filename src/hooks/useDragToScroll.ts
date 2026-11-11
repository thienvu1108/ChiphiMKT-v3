import { useEffect, useRef, useState } from 'react';

interface DragToScrollOptions {
  sensitivity?: number;
  momentum?: boolean;
  friction?: number;
  threshold?: number;
}

export function useDragToScroll<T extends HTMLElement = HTMLDivElement>(
  options: DragToScrollOptions = {}
) {
  const {
    sensitivity = 1,
    momentum = true,
    friction = 0.93,
    threshold = 3
  } = options;

  const containerRef = useRef<T | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const slider = containerRef.current;
    if (!slider) return;

    let isDown = false;
    let startX = 0;
    let startScrollLeft = 0;
    let hasMoved = false;
    let lastClientX = 0;
    let lastTime = 0;
    let velocityX = 0; // px/ms
    let inertiaRaf: number | null = null;

    // Prevent default HTML5 drag ghosting
    const handleDragStart = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleMouseDown = (e: MouseEvent) => {
      // Only drag on primary left mouse button
      if (e.button !== 0) return;

      if (inertiaRaf) {
        cancelAnimationFrame(inertiaRaf);
        inertiaRaf = null;
      }

      const target = e.target as HTMLElement;
      // Do not drag if user is focusing an input, select, textarea, or button
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

      // Prevent native text selection highlight
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

      if (Math.abs(dx) > threshold) {
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

      // Kinetic momentum glide on fast flick
      if (momentum && hasMoved && Math.abs(velocityX) > 0.12) {
        let currentVelocity = velocityX * 16;

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

    // Prevent accidental click actions when user finishes a drag gesture
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
  }, [sensitivity, momentum, friction, threshold]);

  return { containerRef, isDragging };
}
