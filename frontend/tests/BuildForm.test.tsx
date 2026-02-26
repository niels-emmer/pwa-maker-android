import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BuildForm } from '../src/components/BuildForm.js';

// Mock useManifest to avoid real fetch calls
vi.mock('../src/hooks/useManifest.js', () => ({
  useManifest: vi.fn().mockReturnValue({ data: null, loading: false, error: null }),
}));

describe('BuildForm', () => {
  const mockSubmit = vi.fn();

  beforeEach(() => {
    mockSubmit.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders all required fields', () => {
    render(<BuildForm onSubmit={mockSubmit} disabled={false} />);
    expect(screen.getByLabelText(/website url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/app name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/short name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/package id/i)).toBeInTheDocument();
  });

  it('renders Generate APK button', () => {
    render(<BuildForm onSubmit={mockSubmit} disabled={false} />);
    expect(screen.getByRole('button', { name: /generate apk/i })).toBeInTheDocument();
  });

  it('disables button initially (empty required fields)', () => {
    render(<BuildForm onSubmit={mockSubmit} disabled={false} />);
    expect(screen.getByRole('button', { name: /generate apk/i })).toBeDisabled();
  });

  it('disables all inputs when disabled=true', () => {
    render(<BuildForm onSubmit={mockSubmit} disabled={true} />);
    const inputs = screen.getAllByRole('textbox');
    inputs.forEach((input) => expect(input).toBeDisabled());
  });

  it('shows Building… text when disabled', () => {
    render(<BuildForm onSubmit={mockSubmit} disabled={true} />);
    expect(screen.getByText(/building/i)).toBeInTheDocument();
  });

  it('shows manifest fetch success when manifest loads', async () => {
    const { useManifest } = await import('../src/hooks/useManifest.js');
    vi.mocked(useManifest).mockReturnValue({
      data: {
        pwaUrl: 'https://example.com',
        appName: 'Loaded App',
      },
      loading: false,
      error: null,
    });

    render(<BuildForm onSubmit={mockSubmit} disabled={false} />);
    expect(screen.getByText(/manifest loaded/i)).toBeInTheDocument();
  });

  it('shows warning when manifest fetch fails', async () => {
    const { useManifest } = await import('../src/hooks/useManifest.js');
    vi.mocked(useManifest).mockReturnValue({
      data: null,
      loading: false,
      error: 'Connection refused',
    });

    render(<BuildForm onSubmit={mockSubmit} disabled={false} />);
    expect(screen.getByText(/could not fetch manifest/i)).toBeInTheDocument();
  });

  it('shows loading spinner while manifest is fetching', async () => {
    const { useManifest } = await import('../src/hooks/useManifest.js');
    vi.mocked(useManifest).mockReturnValue({
      data: null,
      loading: true,
      error: null,
    });

    render(<BuildForm onSubmit={mockSubmit} disabled={false} />);
    expect(screen.getByLabelText(/loading manifest/i)).toBeInTheDocument();
  });

  it('validates packageId format on blur', async () => {
    const user = userEvent.setup();
    render(<BuildForm onSubmit={mockSubmit} disabled={false} />);

    const packageInput = screen.getByLabelText(/package id/i);
    await user.clear(packageInput);
    await user.type(packageInput, 'invalid');
    await user.tab();

    await waitFor(() =>
      expect(screen.getByText(/must be like com\.example\.app/i)).toBeInTheDocument()
    );
  });

  it('shows color swatch for theme color', () => {
    render(<BuildForm onSubmit={mockSubmit} disabled={false} />);
    expect(screen.getByLabelText(/theme color picker/i)).toBeInTheDocument();
  });

  it('does not call onSubmit if form is invalid', async () => {
    render(<BuildForm onSubmit={mockSubmit} disabled={false} />);
    fireEvent.submit(screen.getByRole('form', { name: /build configuration/i }));
    expect(mockSubmit).not.toHaveBeenCalled();
  });
});
