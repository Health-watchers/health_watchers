import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { Table, TableHead, TableBody, TableRow, TableTh, TableTd } from '../Table';

expect.extend(toHaveNoViolations);

describe('Table Components', () => {
  const SimpleTable = () => (
    <Table>
      <TableHead>
        <TableRow>
          <TableTh>Name</TableTh>
          <TableTh>Email</TableTh>
          <TableTh>Role</TableTh>
        </TableRow>
      </TableHead>
      <TableBody>
        <TableRow>
          <TableTd>John Doe</TableTd>
          <TableTd>john@example.com</TableTd>
          <TableTd>Admin</TableTd>
        </TableRow>
        <TableRow>
          <TableTd>Jane Smith</TableTd>
          <TableTd>jane@example.com</TableTd>
          <TableTd>User</TableTd>
        </TableRow>
      </TableBody>
    </Table>
  );

  describe('Rendering', () => {
    it('renders table element', () => {
      render(<SimpleTable />);
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('renders table headers', () => {
      render(<SimpleTable />);
      expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Email' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Role' })).toBeInTheDocument();
    });

    it('renders table cells', () => {
      render(<SimpleTable />);
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('john@example.com')).toBeInTheDocument();
      expect(screen.getByText('Admin')).toBeInTheDocument();
    });

    it('renders multiple rows', () => {
      render(<SimpleTable />);
      const rows = screen.getAllByRole('row');
      // 1 header row + 2 body rows = 3 total
      expect(rows).toHaveLength(3);
    });

    it('applies wrapper with overflow', () => {
      const { container } = render(<SimpleTable />);
      const wrapper = container.querySelector('.overflow-x-auto');
      expect(wrapper).toBeInTheDocument();
    });

    it('applies custom className to Table', () => {
      render(
        <Table className="custom-table">
          <TableBody>
            <TableRow>
              <TableTd>Data</TableTd>
            </TableRow>
          </TableBody>
        </Table>
      );
      expect(screen.getByRole('table')).toHaveClass('custom-table');
    });

    it('applies custom className to TableHead', () => {
      render(
        <Table>
          <TableHead className="custom-head">
            <TableRow>
              <TableTh>Header</TableTh>
            </TableRow>
          </TableHead>
        </Table>
      );
      const thead = screen.getByRole('table').querySelector('thead');
      expect(thead).toHaveClass('custom-head');
    });

    it('applies custom className to TableBody', () => {
      render(
        <Table>
          <TableBody className="custom-body">
            <TableRow>
              <TableTd>Data</TableTd>
            </TableRow>
          </TableBody>
        </Table>
      );
      const tbody = screen.getByRole('table').querySelector('tbody');
      expect(tbody).toHaveClass('custom-body');
    });

    it('applies custom className to TableRow', () => {
      render(
        <Table>
          <TableBody>
            <TableRow className="custom-row">
              <TableTd>Data</TableTd>
            </TableRow>
          </TableBody>
        </Table>
      );
      const row = screen.getByRole('row');
      expect(row).toHaveClass('custom-row');
    });

    it('applies custom className to TableTh', () => {
      render(
        <Table>
          <TableHead>
            <TableRow>
              <TableTh className="custom-th">Header</TableTh>
            </TableRow>
          </TableHead>
        </Table>
      );
      expect(screen.getByRole('columnheader')).toHaveClass('custom-th');
    });

    it('applies custom className to TableTd', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableTd className="custom-td">Data</TableTd>
            </TableRow>
          </TableBody>
        </Table>
      );
      const cell = screen.getByRole('cell');
      expect(cell).toHaveClass('custom-td');
    });
  });

  describe('ARIA and Accessibility', () => {
    it('table has proper role', () => {
      render(<SimpleTable />);
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('thead cells have columnheader role', () => {
      render(<SimpleTable />);
      const headers = screen.getAllByRole('columnheader');
      expect(headers).toHaveLength(3);
    });

    it('tbody cells have cell role', () => {
      render(<SimpleTable />);
      const cells = screen.getAllByRole('cell');
      expect(cells).toHaveLength(6); // 3 cells × 2 rows
    });

    it('th elements have scope="col"', () => {
      render(<SimpleTable />);
      const nameHeader = screen.getByRole('columnheader', { name: 'Name' });
      expect(nameHeader).toHaveAttribute('scope', 'col');
    });

    it('supports data-* attributes on TableRow', () => {
      render(
        <Table>
          <TableBody>
            <TableRow data-testid="test-row">
              <TableTd>Data</TableTd>
            </TableRow>
          </TableBody>
        </Table>
      );
      expect(screen.getByTestId('test-row')).toBeInTheDocument();
    });

    it('supports aria-label on table', () => {
      render(
        <Table aria-label="User list">
          <TableBody>
            <TableRow>
              <TableTd>Data</TableTd>
            </TableRow>
          </TableBody>
        </Table>
      );
      expect(screen.getByRole('table')).toHaveAttribute('aria-label', 'User list');
    });
  });

  describe('Accessibility Violations', () => {
    it('should not have accessibility violations - basic table', async () => {
      const { container } = render(<SimpleTable />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - table with aria-label', async () => {
      const { container } = render(
        <Table aria-label="Employee directory">
          <TableHead>
            <TableRow>
              <TableTh>Name</TableTh>
              <TableTh>Department</TableTh>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableTd>Alice Johnson</TableTd>
              <TableTd>Engineering</TableTd>
            </TableRow>
          </TableBody>
        </Table>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - empty table', async () => {
      const { container } = render(
        <Table>
          <TableHead>
            <TableRow>
              <TableTh>Column 1</TableTh>
              <TableTh>Column 2</TableTh>
            </TableRow>
          </TableHead>
          <TableBody />
        </Table>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - complex table', async () => {
      const { container } = render(
        <Table>
          <TableHead>
            <TableRow>
              <TableTh>Product</TableTh>
              <TableTh>Price</TableTh>
              <TableTh>Stock</TableTh>
              <TableTh>Actions</TableTh>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableTd>Widget A</TableTd>
              <TableTd>$19.99</TableTd>
              <TableTd>42</TableTd>
              <TableTd>
                <button>Edit</button>
                <button>Delete</button>
              </TableTd>
            </TableRow>
            <TableRow>
              <TableTd>Widget B</TableTd>
              <TableTd>$29.99</TableTd>
              <TableTd>17</TableTd>
              <TableTd>
                <button>Edit</button>
                <button>Delete</button>
              </TableTd>
            </TableRow>
          </TableBody>
        </Table>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Styling', () => {
    it('applies border and rounded corners to wrapper', () => {
      const { container } = render(<SimpleTable />);
      const wrapper = container.querySelector('.overflow-x-auto');
      expect(wrapper).toHaveClass('rounded-lg', 'border');
    });

    it('applies background to thead', () => {
      render(<SimpleTable />);
      const thead = screen.getByRole('table').querySelector('thead');
      expect(thead).toHaveClass('bg-neutral-50');
    });

    it('applies hover effect to rows', () => {
      render(<SimpleTable />);
      const rows = screen.getAllByRole('row');
      rows.forEach((row) => {
        expect(row).toHaveClass('hover:bg-neutral-50');
      });
    });

    it('applies uppercase styling to headers', () => {
      render(<SimpleTable />);
      const headers = screen.getAllByRole('columnheader');
      headers.forEach((header) => {
        expect(header).toHaveClass('uppercase');
      });
    });
  });

  describe('HTML Attributes', () => {
    it('forwards additional props to Table', () => {
      render(
        <Table data-testid="custom-table">
          <TableBody>
            <TableRow>
              <TableTd>Data</TableTd>
            </TableRow>
          </TableBody>
        </Table>
      );
      expect(screen.getByTestId('custom-table')).toBeInTheDocument();
    });

    it('forwards additional props to TableTh', () => {
      render(
        <Table>
          <TableHead>
            <TableRow>
              <TableTh data-testid="custom-th">Header</TableTh>
            </TableRow>
          </TableHead>
        </Table>
      );
      expect(screen.getByTestId('custom-th')).toBeInTheDocument();
    });

    it('forwards additional props to TableTd', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableTd data-testid="custom-td">Data</TableTd>
            </TableRow>
          </TableBody>
        </Table>
      );
      expect(screen.getByTestId('custom-td')).toBeInTheDocument();
    });
  });
});
