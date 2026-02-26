import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from '../src/components/Header.js';

describe('Header', () => {
  it('renders app title', () => {
    render(<Header />);
    expect(screen.getByText(/pwa maker/i)).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    render(<Header />);
    expect(screen.getByText(/android apk generator/i)).toBeInTheDocument();
  });

  it('renders GitHub link', () => {
    render(<Header />);
    expect(screen.getByLabelText(/github repository/i)).toBeInTheDocument();
  });
});
