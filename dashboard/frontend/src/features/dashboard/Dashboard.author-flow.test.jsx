import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import Dashboard from './Dashboard';
import { ToastProvider } from '../../components/common/Toast';

vi.mock('../../components/common/Navigation', () => ({
    default: () => <div data-testid="mock-navigation" />,
}));

vi.mock('./StreamInfoBar', () => ({
    default: () => <div data-testid="mock-stream-info" />,
}));

vi.mock('./EventMarkerModal', () => ({
    default: () => null,
}));

vi.mock('../wordcloud/WordCloudPanel', () => ({
    default: () => <div data-testid="mock-wordcloud" />,
}));

vi.mock('./EmojiStatsPanel', () => ({
    default: () => <div data-testid="mock-emoji" />,
}));

vi.mock('./MoneyStats', () => ({
    default: () => <div data-testid="mock-money" />,
}));

vi.mock('../messages/MessageList', () => ({
    default: ({ onAuthorSelect }) => (
        <button type="button" onClick={() => onAuthorSelect?.('author_from_message_list')}>
            open-author
        </button>
    ),
}));

vi.mock('../authors/AuthorDetailDrawer', () => ({
    default: ({ isOpen, authorId }) => (
        <div data-testid="mock-author-drawer">
            {isOpen ? `open:${authorId}` : 'closed'}
        </div>
    ),
}));

vi.mock('../../api/stats', () => ({
    fetchViewersStats: vi.fn(async () => []),
    fetchCommentsStats: vi.fn(async () => []),
}));

vi.mock('../../hooks/useDefaultStartTime', () => ({
    useDefaultStartTime: () => ({
        defaultStartTime: null,
        loading: false,
    }),
}));

vi.mock('../../utils/chartSetup', () => ({
    registerChartComponents: vi.fn(),
    hourGridPlugin: {},
}));

vi.mock('../../utils/eventMarkerPlugin', () => ({
    default: {},
}));

vi.mock('react-chartjs-2', () => ({
    Chart: () => <div data-testid="mock-chart" />,
}));

describe('Dashboard author flow', () => {
    test('opens author drawer with selected author id from message list', async () => {
        const user = userEvent.setup();

        render(
            <ToastProvider>
                <MemoryRouter>
                    <Dashboard />
                </MemoryRouter>
            </ToastProvider>
        );

        expect(screen.getByTestId('mock-author-drawer')).toHaveTextContent('closed');

        await user.click(screen.getByRole('button', { name: 'open-author' }));

        expect(screen.getByTestId('mock-author-drawer')).toHaveTextContent('open:author_from_message_list');
    });
});
