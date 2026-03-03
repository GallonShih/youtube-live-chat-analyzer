import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import SegmentedControl from './SegmentedControl';

const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
    { value: 'c', label: 'Gamma' },
];

describe('SegmentedControl', () => {
    test('renders all option labels', () => {
        render(<SegmentedControl options={options} value="a" onChange={() => {}} />);
        expect(screen.getByText('Alpha')).toBeInTheDocument();
        expect(screen.getByText('Beta')).toBeInTheDocument();
        expect(screen.getByText('Gamma')).toBeInTheDocument();
    });

    test('applies active style to selected option', () => {
        render(<SegmentedControl options={options} value="b" onChange={() => {}} />);
        const activeBtn = screen.getByText('Beta');
        expect(activeBtn.className).toContain('bg-blue-600');
        expect(activeBtn.className).toContain('text-white');

        const inactiveBtn = screen.getByText('Alpha');
        expect(inactiveBtn.className).toContain('bg-white');
        expect(inactiveBtn.className).not.toContain('bg-blue-600');
    });

    test('calls onChange with correct value on click', () => {
        const handleChange = vi.fn();
        render(<SegmentedControl options={options} value="a" onChange={handleChange} />);
        fireEvent.click(screen.getByText('Gamma'));
        expect(handleChange).toHaveBeenCalledWith('c');
    });

    test('renders with sm size variant', () => {
        render(<SegmentedControl options={options} value="a" onChange={() => {}} size="sm" />);
        const btn = screen.getByText('Alpha');
        expect(btn.className).toContain('text-xs');
    });

    test('renders icon when provided', () => {
        const iconOptions = [
            { value: 'x', label: 'With Icon', icon: <span data-testid="test-icon">★</span> },
        ];
        render(<SegmentedControl options={iconOptions} value="x" onChange={() => {}} />);
        expect(screen.getByTestId('test-icon')).toBeInTheDocument();
    });

    test('applies additional className', () => {
        const { container } = render(
            <SegmentedControl options={options} value="a" onChange={() => {}} className="mt-4" />
        );
        expect(container.firstChild.className).toContain('mt-4');
    });
});
