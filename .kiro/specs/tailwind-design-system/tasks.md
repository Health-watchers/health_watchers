# Implementation Plan: Tailwind Design System

## Overview

This implementation plan transforms the Health Watchers web application from inline styles to a comprehensive Tailwind CSS design system. The plan includes installing and configuring Tailwind CSS, creating design tokens, building reusable components, and systematically replacing all inline styles while maintaining WCAG AA accessibility compliance.

## Tasks

- [x] 1. Install and configure Tailwind CSS
  - [x] 1.1 Install Tailwind CSS dependencies in apps/web
    - Install tailwindcss, @tailwindcss/forms, @tailwindcss/typography, autoprefixer, and postcss
    - Update package.json with required dependencies
    - _Requirements: 1.1_

  - [x] 1.2 Create Tailwind configuration file
    - Create tailwind.config.ts with custom design tokens
    - Configure content paths to scan all component files
    - Set up responsive breakpoints and plugins
    - _Requirements: 1.2, 2.1, 2.2, 2.3_

  - [x] 1.3 Configure PostCSS and global styles
    - Create postcss.config.js with Tailwind and autoprefixer
    - Add Tailwind directives to global CSS file
    - _Requirements: 1.3, 1.4_

  - [ ]* 1.4 Write property test for Tailwind configuration
    - **Property 4: Build System Success**
    - **Validates: Requirements 1.5, 6.1**

- [x] 2. Create design token system
  - [x] 2.1 Define comprehensive color palette
    - Create color scales for primary, secondary, success, warning, error, and neutral colors
    - Ensure all colors meet WCAG AA contrast requirements (4.5:1 ratio)
    - _Requirements: 2.1, 2.4_

  - [x] 2.2 Configure typography system
    - Define font families, sizes, weights, and line heights
    - Ensure readable typography with proper line height ratios (1.4-1.6)
    - _Requirements: 2.2_

  - [x] 2.3 Establish spacing scale
    - Create consistent spacing scale from 0 to 96 units
    - Follow mathematical progression for spacing values
    - _Requirements: 2.3_

  - [ ]* 2.4 Write property tests for design tokens
    - **Property 3: Color Contrast Compliance**
    - **Validates: Requirements 2.4, 5.2**
    - **Property 6: Spacing Scale Mathematical Progression**
    - **Validates: Requirements 2.3**

- [x] 3. Create base component library
  - [x] 3.1 Implement Button component
    - Create Button with variant, size, and state props
    - Include hover, focus, active, and disabled states
    - Apply proper ARIA attributes and focus styles
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 7.1, 7.2, 7.3_

  - [x] 3.2 Implement Input component
    - Create Input with type, placeholder, value, and error props
    - Include focus styles and error state handling
    - Add proper labels and ARIA attributes
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 5.3, 7.2_

  - [x] 3.3 Implement Select component
    - Create Select with options and value props
    - Include focus styles and keyboard navigation
    - Add proper ARIA attributes for accessibility
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 5.4_

  - [x] 3.4 Implement Card component
    - Create Card with padding, shadow, and border variants
    - Support flexible content arrangement
    - _Requirements: 4.1, 4.2, 4.4_

  - [x] 3.5 Implement Table components
    - Create Table, TableHeader, TableRow, TableHead, TableBody, TableCell components
    - Include responsive design for mobile screens
    - Add proper semantic markup and ARIA attributes
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 8.4_

  - [ ]* 3.6 Write property tests for base components
    - **Property 5: Component Accessibility Attributes**
    - **Validates: Requirements 4.5, 5.3, 5.5**
    - **Property 7: Component State Styling**
    - **Validates: Requirements 7.1, 7.2, 7.3**
    - **Property 9: Component Tailwind-Only Styling**
    - **Validates: Requirements 4.2**

- [x] 4. Create layout components
  - [x] 4.1 Implement PageWrapper component
    - Create PageWrapper with maxWidth and padding props
    - Support responsive design across all breakpoints
    - _Requirements: 4.1, 4.2, 4.4, 8.2_

  - [x] 4.2 Implement PageHeader component
    - Create PageHeader with title, subtitle, and actions props
    - Maintain proper visual hierarchy
    - _Requirements: 4.1, 4.2, 4.4_

  - [ ]* 4.3 Write property tests for layout components
    - **Property 10: Responsive Design Adaptation**
    - **Validates: Requirements 8.2, 8.3, 8.4, 8.5**

- [x] 5. Checkpoint - Verify component library
  - Ensure all components render correctly with Tailwind classes
  - Validate accessibility features and focus styles
  - Test responsive behavior across breakpoints
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Transform existing pages to use Tailwind classes
  - [x] 6.1 Transform root layout (layout.tsx)
    - Replace any inline styles with Tailwind utility classes
    - Ensure proper HTML structure and accessibility
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 6.2 Transform home page (page.tsx)
    - Replace inline styles in main element with Tailwind classes
    - Update navigation styling with proper hover and focus states
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 7.4_

  - [x] 6.3 Transform patients page
    - Replace all inline styles in table and main elements
    - Use new Table components for consistent styling
    - Ensure responsive design for mobile devices
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 8.3, 8.4_

  - [x] 6.4 Transform encounters page
    - Replace inline styles in main and list elements
    - Use Card components for encounter items
    - Ensure proper spacing and typography
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 6.5 Transform payments page
    - Replace inline styles in main and list elements
    - Use Card components for payment items
    - Style external links with proper focus states
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 7.2_

  - [ ]* 6.6 Write property tests for page transformations
    - **Property 1: No Inline Styles After Transformation**
    - **Validates: Requirements 3.3**
    - **Property 2: CSS Property to Tailwind Class Mapping**
    - **Validates: Requirements 3.2**

- [x] 7. Implement responsive design enhancements
  - [x] 7.1 Add responsive navigation
    - Implement mobile-friendly navigation with proper breakpoints
    - Ensure touch-friendly targets (minimum 44px)
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 7.2 Optimize table responsiveness
    - Add horizontal scrolling for tables on small screens
    - Consider alternative layouts for mobile devices
    - _Requirements: 8.4_

  - [x] 7.3 Implement responsive typography
    - Scale font sizes appropriately across screen sizes
    - Maintain readability on all devices
    - _Requirements: 8.5_

- [x] 8. Accessibility compliance validation
  - [x] 8.1 Implement comprehensive focus styles
    - Ensure all interactive elements have visible focus indicators
    - Meet WCAG AA focus visibility requirements
    - _Requirements: 5.1, 5.4_

  - [x] 8.2 Validate color contrast ratios
    - Test all color combinations against WCAG AA standards
    - Adjust colors if necessary to meet 4.5:1 ratio requirement
    - _Requirements: 5.2_

  - [x] 8.3 Add semantic markup and ARIA attributes
    - Ensure proper heading hierarchy and landmark roles
    - Add ARIA labels where needed for screen readers
    - _Requirements: 5.3, 5.5_

  - [ ]* 8.4 Write accessibility property tests
    - **Property 3: Color Contrast Compliance**
    - **Validates: Requirements 2.4, 5.2**
    - **Property 5: Component Accessibility Attributes**
    - **Validates: Requirements 4.5, 5.3, 5.5**

- [x] 9. Build optimization and validation
  - [x] 9.1 Configure CSS purging
    - Set up Tailwind purge to remove unused utility classes
    - Optimize content scanning for production builds
    - _Requirements: 6.2_

  - [x] 9.2 Validate build process
    - Ensure npm run build succeeds with Tailwind configuration
    - Verify CSS bundle size optimization
    - Test hot reload functionality in development
    - _Requirements: 6.1, 6.3, 6.4_

  - [ ]* 9.3 Write build optimization property tests
    - **Property 4: Build System Success**
    - **Validates: Requirements 1.5, 6.1**
    - **Property 8: CSS Bundle Size Optimization**
    - **Validates: Requirements 6.2, 6.5**

- [x] 10. Final integration and testing
  - [x] 10.1 Integration testing
    - Test complete user flows across all pages
    - Verify component interactions and state management
    - Validate responsive behavior on different devices
    - _Requirements: 10.4**

  - [x] 10.2 Performance validation
    - Measure and validate CSS bundle size reduction
    - Test build times and development experience improvements
    - _Requirements: 6.5, 9.5**

  - [ ]* 10.3 Write integration property tests
    - **Property 1: No Inline Styles After Transformation**
    - **Validates: Requirements 3.3**
    - **Property 9: Component Tailwind-Only Styling**
    - **Validates: Requirements 4.2**

- [x] 11. Final checkpoint - Complete system validation
  - Ensure all inline styles have been eliminated
  - Verify WCAG AA compliance across all components
  - Confirm build process works correctly
  - Validate responsive design on all target devices
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties from the design document
- Focus on incremental validation to catch issues early
- All components must use only Tailwind utility classes (no inline styles)
- Maintain visual equivalence throughout the transformation process
- Ensure accessibility standards are met or exceeded at each step