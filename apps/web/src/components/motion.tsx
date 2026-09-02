import { Box } from '@chakra-ui/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Entrance motion, with the stagger expressed as a delay rather than a timer.
 *
 * A JS-driven stagger means holding elements out of the DOM and scheduling them
 * in, which is state to get wrong and content a screen reader may miss. A CSS
 * `animation-delay` on already-rendered markup does the same thing with none of
 * that: the content is present and readable from the first paint, and the
 * animation is decoration on top. `prefers-reduced-motion` collapses it in the
 * theme's global reset.
 */
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

/**
 * Counts a number up on first sight.
 *
 * Deliberately driven by `requestAnimationFrame` against elapsed wall-clock time
 * rather than a fixed number of frames, so it lasts the same 700ms on a 60Hz and
 * a 144Hz display. It settles on the exact target rather than an interpolated
 * near-miss - a money figure that lands on $2,384.23 instead of $2,384.24 is a
 * bug wearing an animation.
 */
export function useCountUp(target: number, durationMs = 700): number {
  const [value, setValue] = useState(target);
  const previous = useRef(target);
  const frame = useRef<number>(0);

  useEffect(() => {
    const from = previous.current;
    previous.current = target;

    if (from === target) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setValue(target);
      return;
    }

    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - started) / durationMs, 1);
      // easeOutExpo: fast to begin, settling gently rather than stopping dead.
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setValue(progress === 1 ? target : Math.round(from + (target - from) * eased));
      if (progress < 1) frame.current = requestAnimationFrame(step);
    };

    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [target, durationMs]);

  return value;
}
