import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../Tabs';

expect.extend(toHaveNoViolations);

describe('Tabs', () => {
  const TabsExample = ({ value, onValueChange }: { value: string; onValueChange: (v: string) => void }) => (
    <Tabs value={value} onValueChange={onValueChange}>
      <TabsList>
        <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        <TabsTrigger value="tab3">Tab 3</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">Content 1</TabsContent>
      <TabsContent value="tab2">Content 2</TabsContent>
      <TabsContent value="tab3">Content 3</TabsContent>
    </Tabs>
  );

  describe('Rendering', () => {
    it('renders all tab triggers', () => {
      const handleChange = jest.fn();
      render(<TabsExample value="tab1" onValueChange={handleChange} />);
      
      expect(screen.getByRole('tab', { name: 'Tab 1' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Tab 2' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Tab 3' })).toBeInTheDocument();
    });

    it('renders only active tab content', () => {
      const handleChange = jest.fn();
      render(<TabsExample value="tab1" onValueChange={handleChange} />);
      
      expect(screen.getByRole('tabpanel')).toHaveTextContent('Content 1');
      expect(screen.queryByText('Content 2')).not.toBeInTheDocument();
      expect(screen.queryByText('Content 3')).not.toBeInTheDocument();
    });

    it('marks active tab with aria-selected', () => {
      const handleChange = jest.fn();
      render(<TabsExample value="tab2" onValueChange={handleChange} />);
      
      expect(screen.getByRole('tab', { name: 'Tab 1' })).toHaveAttribute('aria-selected', 'false');
      expect(screen.getByRole('tab', { name: 'Tab 2' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: 'Tab 3' })).toHaveAttribute('aria-selected', 'false');
    });

    it('applies active styling to selected tab', () => {
      const handleChange = jest.fn();
      render(<TabsExample value="tab1" onValueChange={handleChange} />);
      
      const activeTab = screen.getByRole('tab', { name: 'Tab 1' });
      expect(activeTab).toHaveClass('border-primary-500');
    });

    it('renders tablist with role', () => {
      const handleChange = jest.fn();
      render(<TabsExample value="tab1" onValueChange={handleChange} />);
      
      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    it('renders tabpanel with role', () => {
      const handleChange = jest.fn();
      render(<TabsExample value="tab1" onValueChange={handleChange} />);
      
      expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    });

    it('applies custom className to Tabs', () => {
      const handleChange = jest.fn();
      const { container } = render(
        <Tabs value="tab1" onValueChange={handleChange} className="custom-tabs">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          </TabsList>
        </Tabs>
      );
      
      expect(container.querySelector('.custom-tabs')).toBeInTheDocument();
    });

    it('applies custom className to TabsList', () => {
      const handleChange = jest.fn();
      render(
        <Tabs value="tab1" onValueChange={handleChange}>
          <TabsList className="custom-list">
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          </TabsList>
        </Tabs>
      );
      
      expect(screen.getByRole('tablist')).toHaveClass('custom-list');
    });
  });

  describe('Interaction', () => {
    it('calls onValueChange when tab is clicked', async () => {
      const user = userEvent.setup();
      const handleChange = jest.fn();
      render(<TabsExample value="tab1" onValueChange={handleChange} />);
      
      await user.click(screen.getByRole('tab', { name: 'Tab 2' }));
      expect(handleChange).toHaveBeenCalledWith('tab2');
    });

    it('switches content when tab is clicked', async () => {
      const user = userEvent.setup();
      let currentValue = 'tab1';
      const handleChange = jest.fn((value: string) => {
        currentValue = value;
      });
      
      const { rerender } = render(<TabsExample value={currentValue} onValueChange={handleChange} />);
      expect(screen.getByRole('tabpanel')).toHaveTextContent('Content 1');
      
      await user.click(screen.getByRole('tab', { name: 'Tab 2' }));
      
      rerender(<TabsExample value="tab2" onValueChange={handleChange} />);
      expect(screen.getByRole('tabpanel')).toHaveTextContent('Content 2');
    });

    it('active tab has tabIndex 0', () => {
      const handleChange = jest.fn();
      render(<TabsExample value="tab1" onValueChange={handleChange} />);
      
      expect(screen.getByRole('tab', { name: 'Tab 1' })).toHaveAttribute('tabIndex', '0');
    });

    it('inactive tabs have tabIndex -1', () => {
      const handleChange = jest.fn();
      render(<TabsExample value="tab1" onValueChange={handleChange} />);
      
      expect(screen.getByRole('tab', { name: 'Tab 2' })).toHaveAttribute('tabIndex', '-1');
      expect(screen.getByRole('tab', { name: 'Tab 3' })).toHaveAttribute('tabIndex', '-1');
    });
  });

  describe('Keyboard Navigation', () => {
    it('navigates to next tab with ArrowRight', async () => {
      const user = userEvent.setup();
      let currentValue = 'tab1';
      const handleChange = jest.fn((value: string) => {
        currentValue = value;
      });
      
      const { rerender } = render(<TabsExample value={currentValue} onValueChange={handleChange} />);
      
      const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
      const tab2 = screen.getByRole('tab', { name: 'Tab 2' });
      
      tab1.focus();
      await user.keyboard('{ArrowRight}');
      
      expect(tab2).toHaveFocus();
      expect(handleChange).toHaveBeenCalledWith('tab2');
    });

    it('navigates to previous tab with ArrowLeft', async () => {
      const user = userEvent.setup();
      let currentValue = 'tab2';
      const handleChange = jest.fn((value: string) => {
        currentValue = value;
      });
      
      const { rerender } = render(<TabsExample value={currentValue} onValueChange={handleChange} />);
      
      const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
      const tab2 = screen.getByRole('tab', { name: 'Tab 2' });
      
      tab2.focus();
      await user.keyboard('{ArrowLeft}');
      
      expect(tab1).toHaveFocus();
      expect(handleChange).toHaveBeenCalledWith('tab1');
    });

    it('wraps to first tab when ArrowRight on last tab', async () => {
      const user = userEvent.setup();
      const handleChange = jest.fn();
      render(<TabsExample value="tab3" onValueChange={handleChange} />);
      
      const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
      const tab3 = screen.getByRole('tab', { name: 'Tab 3' });
      
      tab3.focus();
      await user.keyboard('{ArrowRight}');
      
      expect(tab1).toHaveFocus();
      expect(handleChange).toHaveBeenCalledWith('tab1');
    });

    it('wraps to last tab when ArrowLeft on first tab', async () => {
      const user = userEvent.setup();
      const handleChange = jest.fn();
      render(<TabsExample value="tab1" onValueChange={handleChange} />);
      
      const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
      const tab3 = screen.getByRole('tab', { name: 'Tab 3' });
      
      tab1.focus();
      await user.keyboard('{ArrowLeft}');
      
      expect(tab3).toHaveFocus();
      expect(handleChange).toHaveBeenCalledWith('tab3');
    });

    it('navigates to first tab with Home key', async () => {
      const user = userEvent.setup();
      const handleChange = jest.fn();
      render(<TabsExample value="tab3" onValueChange={handleChange} />);
      
      const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
      const tab3 = screen.getByRole('tab', { name: 'Tab 3' });
      
      tab3.focus();
      await user.keyboard('{Home}');
      
      expect(tab1).toHaveFocus();
      expect(handleChange).toHaveBeenCalledWith('tab1');
    });

    it('navigates to last tab with End key', async () => {
      const user = userEvent.setup();
      const handleChange = jest.fn();
      render(<TabsExample value="tab1" onValueChange={handleChange} />);
      
      const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
      const tab3 = screen.getByRole('tab', { name: 'Tab 3' });
      
      tab1.focus();
      await user.keyboard('{End}');
      
      expect(tab3).toHaveFocus();
      expect(handleChange).toHaveBeenCalledWith('tab3');
    });

    it('can tab to tablist', async () => {
      const user = userEvent.setup();
      const handleChange = jest.fn();
      render(
        <>
          <button>Before</button>
          <TabsExample value="tab1" onValueChange={handleChange} />
        </>
      );
      
      const beforeButton = screen.getByRole('button', { name: 'Before' });
      const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
      
      beforeButton.focus();
      await user.tab();
      
      expect(tab1).toHaveFocus();
    });

    it('tab navigates to tabpanel after active tab', async () => {
      const user = userEvent.setup();
      const handleChange = jest.fn();
      render(<TabsExample value="tab1" onValueChange={handleChange} />);
      
      const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
      const tabpanel = screen.getByRole('tabpanel');
      
      tab1.focus();
      await user.tab();
      
      expect(tabpanel).toHaveFocus();
    });
  });

  describe('ARIA and Accessibility', () => {
    it('tablist has role="tablist"', () => {
      const handleChange = jest.fn();
      render(<TabsExample value="tab1" onValueChange={handleChange} />);
      
      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    it('tabs have role="tab"', () => {
      const handleChange = jest.fn();
      render(<TabsExample value="tab1" onValueChange={handleChange} />);
      
      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(3);
    });

    it('tabpanel has role="tabpanel"', () => {
      const handleChange = jest.fn();
      render(<TabsExample value="tab1" onValueChange={handleChange} />);
      
      expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    });

    it('tab has correct aria-controls', () => {
      const handleChange = jest.fn();
      render(<TabsExample value="tab1" onValueChange={handleChange} />);
      
      const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
      expect(tab1).toHaveAttribute('aria-controls', 'tab-panel-tab1');
    });

    it('tabpanel has correct aria-labelledby', () => {
      const handleChange = jest.fn();
      render(<TabsExample value="tab1" onValueChange={handleChange} />);
      
      const tabpanel = screen.getByRole('tabpanel');
      expect(tabpanel).toHaveAttribute('aria-labelledby', 'tab-trigger-tab1');
    });

    it('tab and tabpanel have matching IDs', () => {
      const handleChange = jest.fn();
      render(<TabsExample value="tab1" onValueChange={handleChange} />);
      
      const tab = screen.getByRole('tab', { name: 'Tab 1' });
      const tabpanel = screen.getByRole('tabpanel');
      
      expect(tab).toHaveAttribute('id', 'tab-trigger-tab1');
      expect(tab).toHaveAttribute('aria-controls', 'tab-panel-tab1');
      expect(tabpanel).toHaveAttribute('id', 'tab-panel-tab1');
      expect(tabpanel).toHaveAttribute('aria-labelledby', 'tab-trigger-tab1');
    });

    it('active tab has aria-selected="true"', () => {
      const handleChange = jest.fn();
      render(<TabsExample value="tab2" onValueChange={handleChange} />);
      
      expect(screen.getByRole('tab', { name: 'Tab 2' })).toHaveAttribute('aria-selected', 'true');
    });

    it('inactive tabs have aria-selected="false"', () => {
      const handleChange = jest.fn();
      render(<TabsExample value="tab2" onValueChange={handleChange} />);
      
      expect(screen.getByRole('tab', { name: 'Tab 1' })).toHaveAttribute('aria-selected', 'false');
      expect(screen.getByRole('tab', { name: 'Tab 3' })).toHaveAttribute('aria-selected', 'false');
    });

    it('tabpanel can receive focus', () => {
      const handleChange = jest.fn();
      render(<TabsExample value="tab1" onValueChange={handleChange} />);
      
      const tabpanel = screen.getByRole('tabpanel');
      expect(tabpanel).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('Accessibility Violations', () => {
    it('should not have accessibility violations - default', async () => {
      const handleChange = jest.fn();
      const { container } = render(<TabsExample value="tab1" onValueChange={handleChange} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - different active tab', async () => {
      const handleChange = jest.fn();
      const { container } = render(<TabsExample value="tab2" onValueChange={handleChange} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - with complex content', async () => {
      const handleChange = jest.fn();
      const { container } = render(
        <Tabs value="tab1" onValueChange={handleChange}>
          <TabsList>
            <TabsTrigger value="tab1">Profile</TabsTrigger>
            <TabsTrigger value="tab2">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">
            <h3>User Profile</h3>
            <p>Profile information goes here</p>
            <button>Edit Profile</button>
          </TabsContent>
          <TabsContent value="tab2">
            <form>
              <label htmlFor="email">Email</label>
              <input id="email" type="email" />
              <button type="submit">Save</button>
            </form>
          </TabsContent>
        </Tabs>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Error Handling', () => {
    it('throws error when TabsTrigger is used outside Tabs', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      expect(() => {
        render(<TabsTrigger value="tab1">Tab</TabsTrigger>);
      }).toThrow('Tabs subcomponents must be used inside <Tabs>');
      
      consoleSpy.mockRestore();
    });

    it('throws error when TabsContent is used outside Tabs', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      expect(() => {
        render(<TabsContent value="tab1">Content</TabsContent>);
      }).toThrow('Tabs subcomponents must be used inside <Tabs>');
      
      consoleSpy.mockRestore();
    });
  });
});
