import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import TrendsPage from './TrendsPage';
import {
    fetchWordTrendGroups,
    createWordTrendGroup,
    updateWordTrendGroup,
    deleteWordTrendGroup,
    fetchTrendStats,
} from '../../api/wordTrends';

vi.mock('../../components/common/Navigation', () => ({
    default: () => <div data-testid="nav" />,
}));

vi.mock('../../contexts/AuthContext', () => ({
    useAuth: () => ({ isAdmin: true }),
}));

vi.mock('../../hooks/useDefaultStartTime', () => ({
    useDefaultStartTime: () => ({ defaultStartTime: '2026-02-18T00:00', loading: false }),
}));

vi.mock('./TrendChart', () => ({
    default: ({ name, data }) => <div data-testid="trend-chart">{name}:{data.length}</div>,
}));

vi.mock('./WordGroupCard', () => ({
    default: ({ group, isNew, onSave, onDelete, onToggleVisibility }) => (
        <div data-testid={isNew ? 'new-group-card' : `group-card-${group.id}`}>
            <span>{isNew ? 'NEW' : group.name}</span>
            <button onClick={() => onSave(isNew ? { name: 'NewGroup', words: ['x'], color: '#000' } : { ...group, name: `${group.name}-updated` })}>
                save-group
            </button>
            {!isNew && <button onClick={() => onToggleVisibility(group.id)}>toggle-group</button>}
            {!isNew && <button onClick={() => onDelete(group.id)}>delete-group</button>}
        </div>
    ),
}));

vi.mock('../../api/wordTrends', () => ({
    fetchWordTrendGroups: vi.fn(),
    createWordTrendGroup: vi.fn(),
    updateWordTrendGroup: vi.fn(),
    deleteWordTrendGroup: vi.fn(),
    fetchTrendStats: vi.fn(),
}));

describe('TrendsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fetchWordTrendGroups.mockResolvedValue([
            { id: 1, name: 'A', color: '#f00', words: ['a'] },
            { id: 2, name: 'B', color: '#0f0', words: ['b'] },
        ]);
        fetchTrendStats.mockImplementation(async ({ groupIds }) => {
            const map = {
                1: { group_id: 1, total_count: 1, data: [{ hour: '2026-02-18T00:00:00Z', count: 1 }] },
                2: { group_id: 2, total_count: 2, data: [{ hour: '2026-02-18T00:00:00Z', count: 2 }] },
            };
            return { groups: groupIds.map((id) => map[id]).filter(Boolean) };
        });
        createWordTrendGroup.mockResolvedValue({ id: 3, name: 'NewGroup', color: '#000', words: ['x'] });
        updateWordTrendGroup.mockResolvedValue({ id: 1, name: 'A-updated', color: '#f00', words: ['a'] });
        deleteWordTrendGroup.mockResolvedValue({ success: true });
    });

    test('defaults all groups hidden and fetches trends only after toggling visible', async () => {
        const user = userEvent.setup();
        render(<TrendsPage />);

        await waitFor(() => expect(screen.getByTestId('group-card-1')).toBeInTheDocument());
        expect(screen.queryByTestId('trend-chart')).not.toBeInTheDocument();
        expect(fetchTrendStats).not.toHaveBeenCalled();

        await user.click(screen.getAllByRole('button', { name: 'toggle-group' })[0]);
        await waitFor(() => expect(fetchTrendStats).toHaveBeenCalledTimes(1));
        expect(screen.getAllByTestId('trend-chart').length).toBe(1);

        await user.click(screen.getByRole('button', { name: '24H' }));
        await user.click(screen.getByRole('button', { name: '3天' }));
        await user.click(screen.getByRole('button', { name: '7天' }));
        await user.click(screen.getByRole('button', { name: /篩選/ }));

        expect(fetchTrendStats.mock.calls.length).toBeGreaterThan(1);
    });

    test('supports create/update/delete/toggle group operations', async () => {
        const user = userEvent.setup();
        render(<TrendsPage />);

        await waitFor(() => expect(screen.getByTestId('group-card-1')).toBeInTheDocument());

        await user.click(screen.getByRole('button', { name: '+ 新增' }));
        await user.click(screen.getAllByRole('button', { name: 'save-group' })[0]);
        await waitFor(() => expect(createWordTrendGroup).toHaveBeenCalled());
        expect(fetchTrendStats).not.toHaveBeenCalled();

        // Update existing group
        await user.click(screen.getAllByRole('button', { name: 'save-group' })[1]);
        await waitFor(() => expect(updateWordTrendGroup).toHaveBeenCalled());

        // Toggle visibility and delete
        await user.click(screen.getAllByRole('button', { name: 'toggle-group' })[0]);
        await user.click(screen.getAllByRole('button', { name: 'delete-group' })[0]);
        await waitFor(() => expect(deleteWordTrendGroup).toHaveBeenCalledWith(1));
    });

    test('sorts visible charts by message volume when sort button is clicked', async () => {
        const user = userEvent.setup();
        render(<TrendsPage />);

        await waitFor(() => expect(screen.getByTestId('group-card-1')).toBeInTheDocument());
        await user.click(screen.getAllByRole('button', { name: 'toggle-group' })[0]);
        await user.click(screen.getAllByRole('button', { name: 'toggle-group' })[1]);

        await waitFor(() => {
            const charts = screen.getAllByTestId('trend-chart');
            expect(charts[0]).toHaveTextContent('A:1');
            expect(charts[1]).toHaveTextContent('B:1');
        });

        await user.click(screen.getByRole('button', { name: '依訊息量排序' }));

        await waitFor(() => {
            const charts = screen.getAllByTestId('trend-chart');
            expect(charts[0]).toHaveTextContent('B:1');
            expect(charts[1]).toHaveTextContent('A:1');
        });
    });

    test('supports toggle all visibility checkbox', async () => {
        const user = userEvent.setup();
        render(<TrendsPage />);

        await waitFor(() => expect(screen.getByTestId('group-card-1')).toBeInTheDocument());
        const toggleAll = screen.getByLabelText('全部顯示詞彙組');

        expect(toggleAll).not.toBeChecked();
        expect(fetchTrendStats).not.toHaveBeenCalled();
        expect(screen.queryByTestId('trend-chart')).not.toBeInTheDocument();

        await user.click(toggleAll);
        await waitFor(() => {
            expect(toggleAll).toBeChecked();
            expect(fetchTrendStats).toHaveBeenCalledTimes(1);
            expect(screen.getAllByTestId('trend-chart')).toHaveLength(2);
        });

        await user.click(toggleAll);
        await waitFor(() => {
            expect(toggleAll).not.toBeChecked();
            expect(screen.queryByTestId('trend-chart')).not.toBeInTheDocument();
        });
    });

    test('fetches only newly opened groups and reuses local cache', async () => {
        const user = userEvent.setup();
        render(<TrendsPage />);

        await waitFor(() => expect(screen.getByTestId('group-card-1')).toBeInTheDocument());
        const toggleButtons = screen.getAllByRole('button', { name: 'toggle-group' });

        await user.click(toggleButtons[0]);
        await waitFor(() => expect(fetchTrendStats).toHaveBeenCalledTimes(1));
        expect(fetchTrendStats).toHaveBeenNthCalledWith(1, expect.objectContaining({ groupIds: [1] }));

        await user.click(toggleButtons[1]);
        await waitFor(() => expect(fetchTrendStats).toHaveBeenCalledTimes(2));
        expect(fetchTrendStats).toHaveBeenNthCalledWith(2, expect.objectContaining({ groupIds: [2] }));

        // Hide then re-open group 1: should use cache and not re-fetch
        await user.click(toggleButtons[0]);
        await user.click(toggleButtons[0]);

        await waitFor(() => {
            const charts = screen.getAllByTestId('trend-chart');
            expect(charts.length).toBe(2);
        });
        expect(fetchTrendStats).toHaveBeenCalledTimes(2);
    });

    test('dedupes in-flight trend requests with identical params', async () => {
        const user = userEvent.setup();
        let resolveRequest;
        const pendingRequest = new Promise((resolve) => {
            resolveRequest = resolve;
        });
        fetchTrendStats.mockReset();
        fetchTrendStats.mockReturnValue(pendingRequest);

        render(<TrendsPage />);
        await waitFor(() => expect(screen.getByTestId('group-card-1')).toBeInTheDocument());

        await user.click(screen.getAllByRole('button', { name: 'toggle-group' })[0]);
        await user.click(screen.getByRole('button', { name: /篩選/ }));
        await user.click(screen.getByRole('button', { name: /篩選/ }));

        expect(fetchTrendStats).toHaveBeenCalledTimes(1);

        resolveRequest({
            groups: [{ group_id: 1, total_count: 1, data: [{ hour: '2026-02-18T00:00:00Z', count: 1 }] }],
        });

        await waitFor(() => expect(screen.getByTestId('trend-chart')).toHaveTextContent('A:1'));
    });
});
