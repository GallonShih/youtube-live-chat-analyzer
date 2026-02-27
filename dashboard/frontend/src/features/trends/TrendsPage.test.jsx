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
        fetchTrendStats.mockResolvedValue({
            groups: [
                { group_id: 1, data: [{ ts: 't1', value: 1 }] },
                { group_id: 2, data: [{ ts: 't2', value: 2 }] },
            ],
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
});
