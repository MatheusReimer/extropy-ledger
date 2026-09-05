import { Box } from '@chakra-ui/react';

const RING_COUNT = 5;
const PERIOD_MS = 15_000;

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
      zIndex="0"
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
              ['--ring-rest' as string]: `${(0.4 + index * 0.36).toFixed(2)}`,
              transformOrigin: `${ORIGIN_X}px ${ORIGIN_Y}px`,
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
