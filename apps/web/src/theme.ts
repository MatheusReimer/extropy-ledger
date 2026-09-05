import { createSystem, defaultConfig, defineConfig, defineRecipe } from '@chakra-ui/react';

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
    _active: { transform: 'translateY(1px)' },
    _disabled: { transform: 'none' },
  },
  variants: {
    variant: {
      solid: {
        bg: 'accent.solid',
        color: 'accent.fg',
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
      fontVariantNumeric: 'tabular-nums',
    },
    body: {
      backgroundImage: `radial-gradient(1100px 620px at 12% -8%, rgba(180,85,31,0.07), transparent 62%), ${GRAIN}`,
      backgroundAttachment: 'fixed, fixed',
    },
    '::selection': { bg: 'accent.subtle' },
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
          data: { value: '{colors.ember.500}' },
        },
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
