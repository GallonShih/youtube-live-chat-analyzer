import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import AdminPanel from './AdminPanel';

vi.mock('../../components/common/Navigation', () => ({
    default: () => <div data-testid="nav" />,
}));
vi.mock('./ReplaceWordsReview', () => ({ default: () => <div>ReplaceWordsReview</div> }));
vi.mock('./SpecialWordsReview', () => ({ default: () => <div>SpecialWordsReview</div> }));
vi.mock('./CurrencyRateManager', () => ({ default: () => <div>CurrencyRateManager</div> }));
vi.mock('./SettingsManager', () => ({ default: () => <div>SettingsManager</div> }));
vi.mock('./TextMining', () => ({ default: () => <div>TextMining</div> }));
vi.mock('./ETLJobsManager', () => ({ default: () => <div>ETLJobsManager</div> }));
vi.mock('./ActiveDictionary', () => ({ default: () => <div>ActiveDictionary</div> }));

describe('AdminPanel', () => {
    test('renders default tab and switches tabs', async () => {
        const user = userEvent.setup();
        render(<AdminPanel />);

        expect(screen.getByText('ReplaceWordsReview')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /Special/ }));
        expect(screen.getByText('SpecialWordsReview')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /Dictionary/ }));
        expect(screen.getByText('ActiveDictionary')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /Currency/ }));
        expect(screen.getByText('CurrencyRateManager')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /Settings/ }));
        expect(screen.getByText('SettingsManager')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /Mining/ }));
        expect(screen.getByText('TextMining')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /ETL/ }));
        expect(screen.getByText('ETLJobsManager')).toBeInTheDocument();
    });
});

