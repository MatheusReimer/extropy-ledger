import { Box } from '@chakra-ui/react';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

export function Rise({
  children,
  delay = 0,
  ...rest
}: {
  children: ReactNode;
  delay?: number;
} & Record<string, unknown>) {
  return (
    <Box
      animationName="rise"
      animationDuration="440ms"
      animationTimingFunction="cubic-bezier(0.16, 1, 0.3, 1)"
      animationFillMode="backwards"
      animationDelay={`${delay}ms`}
      {...rest}
    >
      {children}
    </Box>
  );
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

const subscribeToMotionPreference = (onChange: () => void): (() => void) => {
  const query = window.matchMedia?.(REDUCED_MOTION);
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
};

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToMotionPreference,
    () => window.matchMedia?.(REDUCED_MOTION).matches ?? false,
    () => false,
  );
}

export function useCountUp(target: number, durationMs = 700): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(target);
  const previous = useRef(target);
  const frame = useRef<number>(0);

  useEffect(() => {
    const from = previous.current;
    previous.current = target;

    if (from === target || reduced) return;

    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - started) / durationMs, 1);
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setValue(progress === 1 ? target : Math.round(from + (target - from) * eased));
      if (progress < 1) frame.current = requestAnimationFrame(step);
    };

    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [target, durationMs, reduced]);

  return reduced ? target : value;
}
