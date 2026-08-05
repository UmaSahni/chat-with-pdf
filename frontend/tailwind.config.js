/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        "on-primary-container": "#005763",
        "on-secondary-fixed-variant": "#2f3aa3",
        "on-tertiary-container": "#415062",
        "error-container": "#93000a",
        "surface-container": "#171f33",
        "surface-container-low": "#131b2e",
        "secondary-fixed": "#e0e0ff",
        "on-primary-fixed": "#001f25",
        "surface-container-lowest": "#060e20",
        "inverse-primary": "#006877",
        "on-secondary-container": "#a8afff",
        "surface-container-highest": "#2d3449",
        "on-tertiary-fixed-variant": "#39485a",
        "outline-variant": "#3c494c",
        "on-surface": "#dae2fd",
        "on-error-container": "#ffdad6",
        "surface-variant": "#2d3449",
        "on-background": "#dae2fd",
        "on-surface-variant": "#bbc9cd",
        "primary-fixed-dim": "#2fd9f4",
        "surface-bright": "#31394d",
        "secondary-fixed-dim": "#bdc2ff",
        "surface-container-high": "#222a3d",
        "secondary-container": "#2f3aa3",
        "inverse-surface": "#dae2fd",
        "primary-fixed": "#a2eeff",
        "secondary": "#bdc2ff",
        "on-primary": "#00363e",
        "inverse-on-surface": "#283044",
        "outline": "#859397",
        "surface-tint": "#2fd9f4",
        "primary": "#8aebff",
        "error": "#ffb4ab",
        "surface-dim": "#0b1326",
        "on-primary-fixed-variant": "#004e5a",
        "on-tertiary": "#233143",
        "on-secondary-fixed": "#000767",
        "on-tertiary-fixed": "#0d1c2d",
        "surface": "#0b1326",
        "primary-container": "#22d3ee",
        "tertiary-container": "#b3c2d8",
        "tertiary-fixed": "#d4e4fa",
        "tertiary-fixed-dim": "#b9c8de",
        "tertiary": "#cfdef4",
        "on-secondary": "#131e8c",
        "on-error": "#690005",
        "background": "#0b1326"
      },
      borderRadius: {
        "DEFAULT": "0.125rem",
        "lg": "0.25rem",
        "xl": "0.5rem",
        "full": "0.75rem"
      },
      spacing: {
        "pane-gap": "1px",
        "container-padding": "24px",
        "unit": "4px",
        "gutter": "12px"
      },
      fontFamily: {
        body: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"]
      }
    },
  },
  plugins: [],
}
