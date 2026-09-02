import { createSystem, defaultConfig, defineConfig, defineRecipe } from '@chakra-ui/react';

/**
 * Bone paper, espresso ink, one burnt-orange accent.
 *
 * Almost every dashboard ships dark with a violet accent, which is precisely why
 * this one does not: in a stack of submissions, the light one is the one that is
 * remembered. It also screenshots and prints far better, which matters when the
 * deliverable is reviewed rather than used.
 *
 * Five decisions carry it:
 *
 * 1. **Paper, not white.** #F7F4EE is warm enough to read as stock rather than a
 *    blank canvas, and it lets a genuinely white card sit above it.
 * 2. **Espresso, not black.** #221C16 at full strength is softer than #000 and
 *    keeps the whole page in one temperature family.
 * 3. **Grain over the whole canvas.** A single SVG turbulence filter, inlined as
 *    a data URI - no image request, resolution independent. It is what stops a
 *    large light area looking flat and digital.
 * 4. **The accent is reserved.** Burnt orange appears on exactly one control at a
 *    time. An accent used everywhere is decoration; used once per view it is a
 *    signpost.
 * 5. **Direction is not the accent.** Spending more is flagged brick, spending
 *    less olive - never the accent colour, which would make "primary action" and
 *    "you overspent" the same visual idea.
 */

/**
 * Fractal noise, inlined.
 *
 * `baseFrequency` this high produces fine grain rather than clouds; the low
 * opacity keeps it felt rather than seen. Rendered once by the browser and tiled
 * by `background-repeat`, so it costs no network request and no layout work.
 */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E\")";

const button = defineRecipe({
  base: {
    fontWeight: '500',
    letterSpacing: '-0.005em',
    borderRadius: 'control',
    transitionProperty: 'background, border-color, color, box-shadow, transform',
    transitionDuration: '140ms',
    transitionTimingFunction: 'cubic-bezier(0.2, 0, 0.13, 1)',
    _focusVisible: {
      outline: '2px solid',
      outlineColor: 'accent',
      outlineOffset: '2px',
    },
    // A button that moves 1px on press feels connected to the click. Anything
    // more reads as a toy.
    _active: { transform: 'translateY(1px)' },
    _disabled: { transform: 'none' },
  },
  variants: {
    variant: {
      solid: {
        bg: 'accent.solid',
        color: 'accent.fg',
        // A hairline of light along the top edge. It is the difference between a
        // flat rectangle of colour and something that looks pressed out of a
        // material - and it is one line of CSS.
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 1px 2px rgba(34,28,22,0.16)',
        _hover: { bg: 'accent.emphasized' },
        _active: { bg: 'accent.emphasized', transform: 'translateY(1px)' },
      },
      outline: {
        borderColor: 'border.emphasized',
        color: 'fg',
        bg: 'bg.panel',
        boxShadow: '0 1px 1px rgba(34,28,22,0.04)',
        _hover: { bg: 'bg.subtle', borderColor: 'fg.subtle' },
      },
      ghost: {
        color: 'fg.muted',
        _hover: { bg: 'bg.subtle', color: 'fg' },
      },
      subtle: {
        bg: 'bg.subtle',
        color: 'fg',
        borderWidth: '1px',
        borderColor: 'border',
        _hover: { bg: 'bg.muted' },
      },
    },
  },
});

const config = defineConfig({
  globalCss: {
    'html, body': {
      bg: 'bg',
      color: 'fg',
      // Tabular figures everywhere. In a column of money, proportional digits
      // make the decimal points wander and the eye cannot scan down them.
      fontVariantNumeric: 'tabular-nums',
    },
    body: {
      backgroundImage: `radial-gradient(1100px 620px at 12% -8%, rgba(180,85,31,0.07), transparent 62%), ${GRAIN}`,
      backgroundAttachment: 'fixed, fixed',
    },
    '::selection': { bg: 'accent.subtle' },
    /**
     * Motion is an enhancement, never the mechanism.
     *
     * Everything animated here is also correct with the animation removed, so
     * switching it all off cannot leave an element invisible or a state
     * unreachable. A comma-separated selector is rejected by Chakra's globalCss
     * types, so this is the single universal selector instead.
     */
    '*': {
      '@media (prefers-reduced-motion: reduce)': {
        animationDuration: '0.01ms !important',
        animationIterationCount: '1 !important',
        transitionDuration: '0.01ms !important',
        scrollBehavior: 'auto !important',
      },
    },
  },
  theme: {
    keyframes: {
      /** The scan sweep and its leading edge, travelling the height of the thumbnail. */
      scan: {
        '0%': { transform: 'translateY(-100%)' },
        '100%': { transform: 'translateY(230%)' },
      },
      scanline: {
        '0%': { transform: 'translateY(0)', opacity: '0' },
        '12%': { opacity: '0.55' },
        '88%': { opacity: '0.55' },
        '100%': { transform: 'translateY(96px)', opacity: '0' },
      },
      /**
       * A ring leaving the corner of the rail and fading as it widens.
       *
       * Opacity peaks early and is gone well before the ring reaches the far
       * edge - a ripple that faded exactly at the boundary would read as being
       * clipped by the panel rather than as spending itself.
       */
      sidebarRipple: {
        '0%': { transform: 'scale(0.18)', opacity: '0' },
        '12%': { opacity: '0.5' },
        '70%': { opacity: '0.16' },
        '100%': { transform: 'scale(2.05)', opacity: '0' },
      },
      pulse: {
        '0%, 100%': { opacity: '1', transform: 'scale(1)' },
        '50%': { opacity: '0.4', transform: 'scale(0.8)' },
      },
      /** A filled field pulses once, so the eye is told where the value landed. */
      landed: {
        '0%': { backgroundColor: 'rgba(180,85,31,0.18)' },
        '100%': { backgroundColor: 'transparent' },
      },
      rise: {
        from: { opacity: '0', transform: 'translateY(10px)' },
        to: { opacity: '1', transform: 'translateY(0)' },
      },
      fade: {
        from: { opacity: '0' },
        to: { opacity: '1' },
      },
      grow: {
        from: { transform: 'scaleX(0)' },
        to: { transform: 'scaleX(1)' },
      },
    },
    tokens: {
      fonts: {
        heading: { value: "Manrope, system-ui, -apple-system, 'Segoe UI', sans-serif" },
        body: { value: "Manrope, system-ui, -apple-system, 'Segoe UI', sans-serif" },
      },
      colors: {
        bone: {
          50: { value: '#fffdf9' },
          100: { value: '#f7f4ee' },
          200: { value: '#f0ebe1' },
          300: { value: '#e4dccf' },
          400: { value: '#d5c9b8' },
        },
        espresso: {
          400: { value: '#9a8c7d' },
          600: { value: '#6b5e52' },
          800: { value: '#3a3129' },
          900: { value: '#221c16' },
        },
        ember: {
          400: { value: '#d1703a' },
          500: { value: '#b4551f' },
          600: { value: '#963f13' },
        },
        signal: {
          up: { value: '#93331f' },
          down: { value: '#3e6b4a' },
        },
      },
      radii: {
        panel: { value: '16px' },
        card: { value: '12px' },
        control: { value: '10px' },
      },
    },
    semanticTokens: {
      colors: {
        bg: {
          DEFAULT: { value: '{colors.bone.100}' },
          subtle: { value: '{colors.bone.200}' },
          muted: { value: '{colors.bone.300}' },
          panel: { value: '{colors.bone.50}' },
          raised: { value: '{colors.bone.200}' },
        },
        fg: {
          DEFAULT: { value: '{colors.espresso.900}' },
          muted: { value: '{colors.espresso.600}' },
          subtle: { value: '{colors.espresso.400}' },
          inverted: { value: '{colors.bone.50}' },
        },
        border: {
          DEFAULT: { value: '{colors.bone.300}' },
          emphasized: { value: '{colors.bone.400}' },
          subtle: { value: '{colors.bone.200}' },
        },
        accent: {
          DEFAULT: { value: '{colors.ember.500}' },
          solid: { value: '{colors.ember.500}' },
          emphasized: { value: '{colors.ember.600}' },
          fg: { value: '{colors.bone.50}' },
          muted: { value: 'rgba(180, 85, 31, 0.16)' },
          subtle: { value: 'rgba(180, 85, 31, 0.08)' },
          /** Chart marks, judged against the paper rather than against type. */
          data: { value: '{colors.ember.500}' },
        },
        /**
         * Spending more is not a gain. Investment dashboards colour "up" green;
         * on a ledger a rising total is the one worth flagging, so up reads brick
         * and down reads olive - and neither borrows the accent.
         */
        trend: {
          up: { value: '{colors.signal.up}' },
          down: { value: '{colors.signal.down}' },
        },
      },
    },
    recipes: { button },
  },
});

export const system = createSystem(defaultConfig, config);
