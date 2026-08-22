import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OrderEntry } from '../src/screens/OrderEntry/OrderEntry';
import { InMemoryMockApiClient } from '../src/api/ApiClient';

describe('OrderEntry conditional customer fields', () => {
  it('does not render customer fields for the default Dine In order type', async () => {
    const apiClient = new InMemoryMockApiClient();
    render(<OrderEntry apiClient={apiClient} />);

    await waitFor(() => expect(screen.getByTestId('order-entry-screen')).toBeInTheDocument());

    expect(screen.getByTestId('order-type-tab-dine_in')).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('customer-fields')).not.toBeInTheDocument();
  });

  it('renders customer fields when the Delivery tab is selected', async () => {
    const apiClient = new InMemoryMockApiClient();
    render(<OrderEntry apiClient={apiClient} />);

    await waitFor(() => expect(screen.getByTestId('order-entry-screen')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('order-type-tab-delivery'));

    expect(screen.getByTestId('customer-fields')).toBeInTheDocument();
    expect(screen.getByLabelText('Mobile')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Address')).toBeInTheDocument();
    expect(screen.getByLabelText('Locality')).toBeInTheDocument();
  });

  it('renders customer fields when the Pick Up tab is selected', async () => {
    const apiClient = new InMemoryMockApiClient();
    render(<OrderEntry apiClient={apiClient} />);

    await waitFor(() => expect(screen.getByTestId('order-entry-screen')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('order-type-tab-pickup'));

    expect(screen.getByTestId('customer-fields')).toBeInTheDocument();
  });

  it('hides customer fields again after switching back to Dine In', async () => {
    const apiClient = new InMemoryMockApiClient();
    render(<OrderEntry apiClient={apiClient} />);

    await waitFor(() => expect(screen.getByTestId('order-entry-screen')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('order-type-tab-pickup'));
    expect(screen.getByTestId('customer-fields')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('order-type-tab-dine_in'));
    expect(screen.queryByTestId('customer-fields')).not.toBeInTheDocument();
  });
});
