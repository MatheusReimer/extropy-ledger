import { Box } from '@chakra-ui/react';

/**
 * The arcs on the rail, travelling outward.
 *
 * They used to be baked into `sidebar-art.jpg`. Moving them here makes them
 * ripples: each ring grows from the corner and fades as it goes, staggered so
 * one is always arriving. Same character as the scan line on the receipt reader
 * - slow, continuous, going somewhere - which is what makes an idle panel feel
 * alive rather than merely decorated.
 *
 * Kept as SVG rather than a bordered `div` for `vector-effect`: a scaled div
 * scales its border too, so a ripple would fatten as it expanded. A non-scaling
 * stroke stays a hairline the whole way out, which is what a ripple does.
 */

const RING_COUNT = 5;
/** One full journey, corner to edge. Slow enough to be ambient, not a loader. */
const PERIOD_MS = 15_000;

/** Bottom-left, a little off-canvas - the origin the original arcs radiated from. */
const ORIGIN_X = 14;
const ORIGIN_Y = 968;
const BASE_R = 300;

export function SidebarWaves() {
  return (
    <Box
      position="absolute"
      inset="0"
      overflow="hidden"
      pointerEvents="none"
      aria-hidden="true"
      // Behind the nav, above the artwork.
      zIndex="0"
      /*
       * Reduced motion gets the arcs, standing still.
       *
       * The app-wide reset collapses every animation to 0.01ms, which for a
       * ripple means landing on its final frame - scaled out and fully
       * transparent. Honouring the preference should cost the motion, not the
       * artwork, so each ring holds the position it would have passed through.
       */
      css={{
        '@media (prefers-reduced-motion: reduce)': {
          '& circle': {
            animation: 'none !important',
            transform: 'scale(var(--ring-rest))',
            opacity: 0.34,
          },
        },
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 320 960"
        preserveAspectRatio="xMidYMax slice"
        style={{ display: 'block' }}
      >
        {Array.from({ length: RING_COUNT }, (_, index) => (
          <circle
            key={index}
            cx={ORIGIN_X}
            cy={ORIGIN_Y}
            r={BASE_R}
            fill="none"
            stroke="rgba(255, 253, 249, 0.75)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            style={{
              // Where this ring comes to rest when motion is switched off.
              ['--ring-rest' as string]: `${(0.4 + index * 0.36).toFixed(2)}`,
              transformOrigin: `${ORIGIN_X}px ${ORIGIN_Y}px`,
              // Without this the origin resolves against the element's own box
              // rather than the viewBox, and every ring drifts off-centre.
              transformBox: 'view-box',
              animation: `sidebarRipple ${PERIOD_MS}ms linear ${
                (index * PERIOD_MS) / RING_COUNT
              }ms infinite`,
            }}
          />
        ))}
      </svg>
    </Box>
  );
}
