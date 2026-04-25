// Responsive design configuration for Health Watchers
// Tailwind breakpoints:
// - sm: 640px (mobile landscape, small tablets)
// - md: 768px (tablets)
// - lg: 1024px (desktops)
// - xl: 1280px (large desktops)

module.exports = {
  theme: {
    extend: {
      // Minimum touch target sizes for accessibility
      minWidth: {
        'touch': '44px',
      },
      minHeight: {
        'touch': '44px',
      },
      // Mobile-first spacing
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-top': 'env(safe-area-inset-top)',
      },
    },
  },
  // Mobile-first responsive utilities
  plugins: [
    function({ addUtilities }) {
      const newUtilities = {
        '.touch-target': {
          minWidth: '44px',
          minHeight: '44px',
        },
        '.safe-area-bottom': {
          paddingBottom: 'env(safe-area-inset-bottom)',
        },
        '.safe-area-top': {
          paddingTop: 'env(safe-area-inset-top)',
        },
      };
      addUtilities(newUtilities);
    },
  ],
};
