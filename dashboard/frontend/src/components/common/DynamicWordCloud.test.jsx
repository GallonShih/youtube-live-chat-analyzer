import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import DynamicWordCloud from './DynamicWordCloud';

class MockResizeObserver {
    constructor(callback) {
        this.callback = callback;
    }

    observe() {
        this.callback([
            {
                contentRect: {
                    width: 900,
                    height: 500,
                },
            },
        ]);
    }

    disconnect() { }
}

describe('DynamicWordCloud', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.ResizeObserver = MockResizeObserver;
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
            font: '',
            measureText: (text) => ({ width: String(text).length * 8 }),
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('shows empty state when no words', () => {
        render(<DynamicWordCloud words={[]} />);
        expect(screen.getByText('載入資料後顯示動態文字雲')).toBeInTheDocument();
    });

    test('supports opening controls and tuning parameters', async () => {
        const user = userEvent.setup();
        render(
            <DynamicWordCloud
                words={[
                    { word: 'hello', size: 10 },
                    { word: 'world', size: 8 },
                    { word: 'chat', size: 6 },
                ]}
            />,
        );

        expect(screen.queryByText('載入資料後顯示動態文字雲')).not.toBeInTheDocument();

        await user.click(screen.getByTitle('調整參數'));
        expect(screen.getByText('🔧 物理參數')).toBeInTheDocument();

        const sliders = screen.getAllByRole('slider');
        expect(sliders.length).toBeGreaterThan(5);
        await user.type(sliders[0], '{arrowright}');

        await user.click(screen.getByRole('button', { name: '重置' }));
        expect(screen.getByText('🔧 物理參數')).toBeInTheDocument();
    });
});
