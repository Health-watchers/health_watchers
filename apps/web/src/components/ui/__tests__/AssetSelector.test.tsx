import { render, screen } from '@testing-library/react';
import { AssetSelector } from '../AssetSelector';

describe('AssetSelector', () => {
  it('marks required fields and associates inline errors accessibly', () => {
    render(
      <AssetSelector
        id="receive-asset"
        label="Receive Asset"
        required
        aria-describedby="asset-help"
        error="Choose an asset"
      />
    );

    const select = screen.getByRole('combobox', { name: /receive asset required/i });
    expect(select).toBeRequired();
    expect(select).toHaveAttribute('aria-required', 'true');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAttribute('aria-describedby', 'asset-help receive-asset-error');
    expect(screen.getByRole('alert')).toHaveTextContent('Choose an asset');
  });
});
