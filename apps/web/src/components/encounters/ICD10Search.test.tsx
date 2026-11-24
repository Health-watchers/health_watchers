/**
 * ICD10Search.test.tsx
 *
 * Unit tests covering:
 * - Favorites toggle logic (add/remove via star button)
 * - Tab switching (Search / Favorites / Recent)
 * - Code selection and recording recent usage
 * - Keyboard navigation (ArrowDown, ArrowUp, Enter, Escape, Tab)
 * - Selected diagnoses list rendering
 * - Set-primary and remove actions on selected chips
 */

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Mock the custom hook module ───────────────────────────────────────────────

const mockAddFavorite = jest.fn();
const mockRemoveFavorite = jest.fn();
const mockRecordRecent = jest.fn();

const defaultFavorites = [
  { code: 'J06.9', description: 'Acute upper respiratory infection', addedAt: '2024-01-01T00:00:00Z' },
];

const defaultRecent = [
  { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications', useCount: 5, lastUsedAt: '2024-01-10T00:00:00Z' },
  { code: 'I10', description: 'Essential (primary) hypertension', useCount: 3, lastUsedAt: '2024-01-09T00:00:00Z' },
];

const defaultSearchResults = [
  { code: 'J06.9', description: 'Acute upper respiratory infection', isFavorite: true },
  { code: 'J00', description: 'Acute nasopharyngitis [common cold]', isFavorite: false },
  { code: 'J02.9', description: 'Acute pharyngitis, unspecified', isFavorite: false },
];

jest.mock('@/hooks/useICD10', () => ({
  useICD10Favorites: jest.fn(() => ({
    data: defaultFavorites,
    isLoading: false,
    error: null,
  })),
  useICD10Recent: jest.fn(() => ({
    data: defaultRecent,
    isLoading: false,
    error: null,
  })),
  useICD10Search: jest.fn(() => ({
    data: defaultSearchResults,
    isFetching: false,
    error: null,
  })),
  useAddICD10Favorite: jest.fn(() => ({
    mutate: mockAddFavorite,
    isPending: false,
  })),
  useRemoveICD10Favorite: jest.fn(() => ({
    mutate: mockRemoveFavorite,
    isPending: false,
  })),
  useRecordICD10Recent: jest.fn(() => ({
    mutate: mockRecordRecent,
    isPending: false,
  })),
}));

// ── Component under test ──────────────────────────────────────────────────────

import ICD10Search, { type SelectedDiagnosis } from '../ICD10Search';
import {
  useICD10Favorites,
  useICD10Search as mockUseICD10Search,
} from '@/hooks/useICD10';

// ── Helpers ───────────────────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

interface WrapperProps {
  selected?: SelectedDiagnosis[];
  onChange?: jest.Mock;
}

function renderComponent({ selected = [], onChange = jest.fn() }: WrapperProps = {}) {
  const qc = createQueryClient();
  const result = render(
    <QueryClientProvider client={qc}>
      <ICD10Search selected={selected} onChange={onChange} />
    </QueryClientProvider>
  );
  return { ...result, onChange };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ICD10Search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('Initial render', () => {
    it('renders the search input', () => {
      renderComponent();
      expect(screen.getByRole('textbox', { name: /search icd-10/i })).toBeInTheDocument();
    });

    it('does not show the dropdown when not focused', () => {
      renderComponent();
      expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
    });

    it('renders nothing in the selected diagnoses list when empty', () => {
      renderComponent();
      expect(screen.queryByRole('list', { name: /selected diagnoses/i })).not.toBeInTheDocument();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('Selected diagnoses chips', () => {
    const diagnosis: SelectedDiagnosis = {
      code: 'J06.9',
      description: 'Acute upper respiratory infection',
      isPrimary: true,
    };

    it('renders selected diagnosis chips', () => {
      renderComponent({ selected: [diagnosis] });
      expect(screen.getByText('J06.9')).toBeInTheDocument();
      expect(screen.getByText('Acute upper respiratory infection')).toBeInTheDocument();
    });

    it('shows the "Primary" badge for the primary diagnosis', () => {
      renderComponent({ selected: [diagnosis] });
      expect(screen.getByRole('button', { name: /primary/i })).toBeInTheDocument();
    });

    it('calls onChange without the code when the remove button is clicked', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();
      renderComponent({ selected: [diagnosis], onChange });

      await user.click(screen.getByRole('button', { name: /remove j06\.9/i }));
      expect(onChange).toHaveBeenCalledWith([]);
    });

    it('calls onChange with isPrimary updated when "Set primary" is clicked', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();
      const twoSelected: SelectedDiagnosis[] = [
        { code: 'J06.9', description: 'URTI', isPrimary: true },
        { code: 'I10', description: 'Hypertension', isPrimary: false },
      ];

      renderComponent({ selected: twoSelected, onChange });

      // Click "Set primary" on the second chip
      const setButtons = screen.getAllByTitle(/set as primary/i);
      await user.click(setButtons[0]); // sets I10 as primary
      expect(onChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ code: 'J06.9', isPrimary: false }),
          expect.objectContaining({ code: 'I10', isPrimary: true }),
        ])
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('Dropdown – tab switching', () => {
    it('opens the dropdown when the input is focused', async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole('textbox'));
      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    it('has Search, Favorites, and Recent tabs', async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole('textbox'));
      expect(screen.getByRole('tab', { name: /search/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /favorites/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /recent/i })).toBeInTheDocument();
    });

    it('shows favorite codes when the Favorites tab is active', async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole('textbox'));
      await user.click(screen.getByRole('tab', { name: /favorites/i }));
      expect(screen.getByText('J06.9')).toBeInTheDocument();
      expect(screen.getByText('Acute upper respiratory infection')).toBeInTheDocument();
    });

    it('shows recent codes when the Recent tab is active', async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole('textbox'));
      await user.click(screen.getByRole('tab', { name: /recent/i }));
      expect(screen.getByText('E11.9')).toBeInTheDocument();
      expect(screen.getByText('I10')).toBeInTheDocument();
    });

    it('shows the search hint on the Search tab when no query is typed', async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole('textbox'));
      expect(
        screen.getByText(/type a code or description to search/i)
      ).toBeInTheDocument();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('Search results', () => {
    it('shows search results after typing a query', async () => {
      const user = userEvent.setup();
      renderComponent();

      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.type(input, 'respiratory');

      // Wait for debounced query to propagate (mocked immediately)
      await waitFor(() => {
        expect(screen.getByText('J00')).toBeInTheDocument();
        expect(screen.getByText('J02.9')).toBeInTheDocument();
      });
    });

    it('marks already-selected codes as "Added"', async () => {
      const user = userEvent.setup();
      const selected: SelectedDiagnosis[] = [
        { code: 'J06.9', description: 'URTI', isPrimary: true },
      ];
      renderComponent({ selected });

      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.type(input, 'respiratory');

      await waitFor(() => {
        expect(screen.getByText('Added')).toBeInTheDocument();
      });
    });

    it('calls onChange and recordRecent when a code is selected', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();
      renderComponent({ onChange });

      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.type(input, 'respiratory');

      await waitFor(() => expect(screen.getByText('J00')).toBeInTheDocument());

      // Click the J00 result row
      const options = screen.getAllByRole('option');
      const j00Option = options.find((el) => el.textContent?.includes('J00'));
      expect(j00Option).toBeDefined();
      await user.click(j00Option!);

      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({ code: 'J00', isPrimary: true }),
      ]);
      expect(mockRecordRecent).toHaveBeenCalledWith({
        code: 'J00',
        description: 'Acute nasopharyngitis [common cold]',
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('Favorites toggle logic', () => {
    it('calls addFavorite when the star button is clicked on a non-favorite result', async () => {
      const user = userEvent.setup();
      renderComponent();

      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.type(input, 'respiratory');

      await waitFor(() => expect(screen.getByText('J00')).toBeInTheDocument());

      // Find the star button for the J00 row
      const starButton = screen.getByRole('button', {
        name: /add J00 to favorites/i,
      });
      await user.click(starButton);

      expect(mockAddFavorite).toHaveBeenCalledWith({
        code: 'J00',
        description: 'Acute nasopharyngitis [common cold]',
      });
    });

    it('calls removeFavorite when the star button is clicked on a favorited result', async () => {
      const user = userEvent.setup();
      renderComponent();

      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.type(input, 'respiratory');

      await waitFor(() => expect(screen.getByText('J06.9')).toBeInTheDocument());

      // J06.9 has isFavorite: true in mockSearchResults
      const starButton = screen.getByRole('button', {
        name: /remove J06\.9 from favorites/i,
      });
      await user.click(starButton);

      expect(mockRemoveFavorite).toHaveBeenCalledWith('J06.9');
    });

    it('does NOT add the diagnosis when the star button is clicked (stopPropagation)', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();
      renderComponent({ onChange });

      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.type(input, 'respiratory');

      await waitFor(() => expect(screen.getByText('J00')).toBeInTheDocument());

      const starButton = screen.getByRole('button', {
        name: /add J00 to favorites/i,
      });
      await user.click(starButton);

      // onChange should NOT have been called — only favorite toggle
      expect(onChange).not.toHaveBeenCalled();
    });

    it('toggles favorites on the Favorites tab (remove)', async () => {
      const user = userEvent.setup();
      renderComponent();

      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.click(screen.getByRole('tab', { name: /favorites/i }));

      await waitFor(() => expect(screen.getByText('J06.9')).toBeInTheDocument());

      const starButton = screen.getByRole('button', {
        name: /remove J06\.9 from favorites/i,
      });
      await user.click(starButton);

      expect(mockRemoveFavorite).toHaveBeenCalledWith('J06.9');
    });

    it('star button is disabled while a mutation is pending', async () => {
      const { useAddICD10Favorite } = jest.requireMock('@/hooks/useICD10');
      (useAddICD10Favorite as jest.Mock).mockReturnValue({
        mutate: mockAddFavorite,
        isPending: true, // simulate in-flight mutation
      });

      const user = userEvent.setup();
      renderComponent();

      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.type(input, 'respiratory');

      await waitFor(() => expect(screen.getByText('J00')).toBeInTheDocument());

      const starButton = screen.getByRole('button', {
        name: /add J00 to favorites/i,
      });
      expect(starButton).toBeDisabled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('Keyboard navigation', () => {
    it('opens the dropdown on ArrowDown', async () => {
      const user = userEvent.setup();
      renderComponent();

      const input = screen.getByRole('textbox');
      input.focus();
      await user.keyboard('{ArrowDown}');

      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    it('closes the dropdown on Escape', async () => {
      const user = userEvent.setup();
      renderComponent();

      const input = screen.getByRole('textbox');
      await user.click(input);
      expect(screen.getByRole('tablist')).toBeInTheDocument();

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    });

    it('cycles through tabs with Tab key', async () => {
      const user = userEvent.setup();
      renderComponent();

      const input = screen.getByRole('textbox');
      await user.click(input);

      // Initially on 'search' tab
      expect(screen.getByRole('tab', { name: /search/i })).toHaveAttribute(
        'aria-selected',
        'true'
      );

      // Tab once → favorites
      await user.keyboard('{Tab}');
      expect(screen.getByRole('tab', { name: /favorites/i })).toHaveAttribute(
        'aria-selected',
        'true'
      );

      // Tab again → recent
      await user.keyboard('{Tab}');
      expect(screen.getByRole('tab', { name: /recent/i })).toHaveAttribute(
        'aria-selected',
        'true'
      );

      // Tab again → wraps back to search
      await user.keyboard('{Tab}');
      expect(screen.getByRole('tab', { name: /search/i })).toHaveAttribute(
        'aria-selected',
        'true'
      );
    });

    it('selects a result with Enter after navigating with ArrowDown', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();
      renderComponent({ onChange });

      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.type(input, 'respiratory');

      await waitFor(() => expect(screen.getByText('J06.9')).toBeInTheDocument());

      // Arrow down to first item and press Enter
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{Enter}');

      // J06.9 is first result (isFavorite: true, sorted first by server)
      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({ code: 'J06.9' }),
      ]);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('Empty states', () => {
    it('shows an empty state message when the Favorites tab has no data', async () => {
      const { useICD10Favorites } = jest.requireMock('@/hooks/useICD10');
      (useICD10Favorites as jest.Mock).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      });

      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole('textbox'));
      await user.click(screen.getByRole('tab', { name: /favorites/i }));

      expect(
        screen.getByText(/no favorites yet/i)
      ).toBeInTheDocument();
    });

    it('shows an empty state message when the Recent tab has no data', async () => {
      const { useICD10Recent } = jest.requireMock('@/hooks/useICD10');
      (useICD10Recent as jest.Mock).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      });

      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole('textbox'));
      await user.click(screen.getByRole('tab', { name: /recent/i }));

      expect(
        screen.getByText(/no recent codes yet/i)
      ).toBeInTheDocument();
    });

    it('shows an empty state when a search returns no results', async () => {
      const { useICD10Search } = jest.requireMock('@/hooks/useICD10');
      (useICD10Search as jest.Mock).mockReturnValue({
        data: [],
        isFetching: false,
        error: null,
      });

      const user = userEvent.setup();
      renderComponent();

      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.type(input, 'xyzunknown');

      await waitFor(() => {
        expect(screen.getByText(/no results found/i)).toBeInTheDocument();
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('Accessibility', () => {
    it('search input has aria-expanded attribute', async () => {
      const user = userEvent.setup();
      renderComponent();

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-expanded', 'false');

      await user.click(input);
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });

    it('star buttons have descriptive aria-labels', async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole('textbox'));
      await user.type(screen.getByRole('textbox'), 'respiratory');

      await waitFor(() => expect(screen.getByText('J00')).toBeInTheDocument());

      // Non-favorite
      expect(
        screen.getByRole('button', { name: /add J00 to favorites/i })
      ).toBeInTheDocument();

      // Already-favorite
      expect(
        screen.getByRole('button', { name: /remove J06\.9 from favorites/i })
      ).toBeInTheDocument();
    });

    it('star buttons have aria-pressed reflecting favorite state', async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole('textbox'));
      await user.type(screen.getByRole('textbox'), 'respiratory');

      await waitFor(() => expect(screen.getByText('J06.9')).toBeInTheDocument());

      const favoriteStar = screen.getByRole('button', {
        name: /remove J06\.9 from favorites/i,
      });
      expect(favoriteStar).toHaveAttribute('aria-pressed', 'true');

      const nonFavoriteStar = screen.getByRole('button', {
        name: /add J00 to favorites/i,
      });
      expect(nonFavoriteStar).toHaveAttribute('aria-pressed', 'false');
    });
  });
});
