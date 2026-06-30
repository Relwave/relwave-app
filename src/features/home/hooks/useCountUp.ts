import { useState, useEffect } from 'react';

export function useCountUp(end: number | string, durationMs: number = 1000): number | string {
  const [count, setCount] = useState<number | string>(0);

  useEffect(() => {
    if (typeof end === 'string') {
      setCount(end);
      return;
    }

    if (end === 0) {
      setCount(0);
      return;
    }

    const preferReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (preferReducedMotion) {
      setCount(end);
      return;
    }

    let startTimestamp: number | null = null;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / durationMs, 1);
      
      // easeOutExpo
      const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      
      setCount(Math.floor(easeProgress * end));

      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        setCount(end);
      }
    };

    window.requestAnimationFrame(step);

    return () => {
      // cleanup is automatic as requestAnimationFrame will stop
    };
  }, [end, durationMs]);

  return count;
}
