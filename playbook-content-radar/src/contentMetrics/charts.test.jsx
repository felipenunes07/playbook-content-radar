/* @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AccountGrowthChart, paddedDomain } from './charts.jsx';

afterEach(cleanup);

describe('paddedDomain', () => {
  it('cola o eixo nos dados em vez de começar no zero', () => {
    // Foi isso que achatava o gráfico: 20.811..20.965 num eixo 0..22.000.
    const [min, max] = paddedDomain([20811, 20846, 20965]);
    expect(min).toBeGreaterThan(20000);
    expect(max).toBeLessThan(21000);
    expect(min).toBeLessThan(20811);
    expect(max).toBeGreaterThan(20965);
  });

  it('inclui o zero no modo variação, pra linha base aparecer', () => {
    const [min, max] = paddedDomain([35, 154], { includeZero: true });
    expect(min).toBeLessThanOrEqual(0);
    expect(max).toBeGreaterThan(154);
  });

  it('abre uma faixa quando a série é constante', () => {
    expect(paddedDomain([500, 500])).toEqual([499, 501]);
  });

  it('lida com valores negativos (perda de seguidores)', () => {
    const [min, max] = paddedDomain([-40, 0, 20], { includeZero: true });
    expect(min).toBeLessThan(-40);
    expect(max).toBeGreaterThan(20);
  });

  it('não quebra sem valores', () => {
    expect(paddedDomain([])).toEqual([0, 1]);
    expect(paddedDomain([null, undefined])).toEqual([0, 1]);
  });
});

const growth = [
  { metric_date: '2026-07-02', 'Victor Baggio': 20846, 'Fernando Tedesco': 16871 },
  { metric_date: '2026-07-08', 'Victor Baggio': 20965, 'Fernando Tedesco': 16884 },
];

describe('AccountGrowthChart', () => {
  it('abre no modo Variação e permite trocar para Total', () => {
    render(<AccountGrowthChart data={growth} />);
    expect(screen.getByRole('tab', { name: 'Variação' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/cresceu desde a primeira coleta/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Total' }));
    expect(screen.getByRole('tab', { name: 'Total' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/Número total de seguidores/i)).toBeInTheDocument();
  });

  it('não renderiza nada sem dados', () => {
    const { container } = render(<AccountGrowthChart data={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
