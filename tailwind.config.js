/**
 * Tailwind config for the Masary app (NativeWind v4).
 * Defines the locked "Flamingo" design tokens from docs/ui-ux-plan.html §2-C:
 * flat colors only — no gradients anywhere in the app.
 * Used by: NativeWind for every className in app/ and components/.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#F43F5E', // coral — hero color (Flamingo)
        accent: '#EC4899', // magenta — support
        success: '#0D9488', // teal — income/positive
        chart: '#F59E0B', // amber — charts
        destructive: '#DC2626', // always paired with a text label
        cream: '#FFF1F3', // rose cream background
        surface: '#FFFFFF',
        borderx: '#FBD5DC', // border color ("border" is reserved)
        chip: '#FFE1E7', // soft chip fill
        ink: '#3B1D26', // primary text on light
        inksoft: '#8A6B74', // secondary text on light
        // derived warm-dark theme (ui-ux-plan §9-4: follow system + toggle)
        dark: {
          bg: '#1E1114',
          surface: '#2B1A1F',
          border: '#472830',
          chip: '#3D232A',
          ink: '#FCE9ED',
          inksoft: '#C4A3AD',
        },
      },
      fontFamily: {
        cairo: ['Cairo', 'System'],
      },
    },
  },
  plugins: [],
};
