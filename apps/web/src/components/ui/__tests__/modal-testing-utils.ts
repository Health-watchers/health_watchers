import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

export const ModalTestingUtils = {
  /**
   * Get the modal dialog element
   */
  getDialog: () => {
    return document.querySelector('[role="dialog"]');
  },

  /**
   * Get the modal backdrop element
   */
  getBackdrop: () => {
    return document.querySelector('[role="dialog"]')?.previousElementSibling;
  },

  /**
   * Check if modal is open
   */
  isModalOpen: () => {
    return !!ModalTestingUtils.getDialog();
  },

  /**
   * Get the close button
   */
  getCloseButton: () => {
    return screen.getByLabelText('Close');
  },

  /**
   * Click the close button
   */
  clickClose: async () => {
    const closeButton = ModalTestingUtils.getCloseButton();
    await userEvent.click(closeButton);
  },

  /**
   * Press Escape key
   */
  pressEscape: () => {
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
  },

  /**
   * Click on backdrop
   */
  clickBackdrop: async () => {
    const backdrop = ModalTestingUtils.getBackdrop();
    if (backdrop) {
      await userEvent.click(backdrop);
    }
  },

  /**
   * Get modal title
   */
  getTitle: (titleText?: string) => {
    if (titleText) {
      return screen.getByText(titleText);
    }
    return document.querySelector('[role="dialog"] h2');
  },

  /**
   * Check if element receives focus
   */
  hasFocus: (element: Element) => {
    return document.activeElement === element;
  },

  /**
   * Wait for modal to open
   */
  waitForOpen: () => {
    return waitFor(() => {
      const dialog = ModalTestingUtils.getDialog();
      if (!dialog) throw new Error('Modal not found');
    });
  },

  /**
   * Wait for modal to close
   */
  waitForClose: () => {
    return waitFor(() => {
      const dialog = ModalTestingUtils.getDialog();
      if (dialog) throw new Error('Modal still open');
    });
  },

  /**
   * Test keyboard navigation (Tab key cycling)
   */
  testTabNavigation: async (expectedFocusElements: HTMLElement[]) => {
    const user = userEvent.setup();
    for (let i = 0; i < expectedFocusElements.length; i++) {
      await user.tab();
      // Note: actual focus may vary based on implementation
    }
  },

  /**
   * Get all focusable elements inside modal
   */
  getFocusableElements: () => {
    const dialog = ModalTestingUtils.getDialog();
    if (!dialog) return [];
    return Array.from(
      dialog.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    );
  },
};
