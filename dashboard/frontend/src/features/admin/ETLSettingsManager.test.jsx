import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import ETLSettingsManager from './ETLSettingsManager';
import { fetchETLSettings, updateETLSetting } from '../../api/etl';

vi.mock('../../api/etl', () => ({
    fetchETLSettings: vi.fn(),
    updateETLSetting: vi.fn(),
}));

describe('ETLSettingsManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fetchETLSettings.mockResolvedValue({
            settings: [
                { key: 'ETL_BATCH_SIZE', value: '100', value_type: 'integer', category: 'etl', description: 'batch' },
                { key: 'AI_ENABLED', value: 'false', value_type: 'boolean', category: 'ai', description: 'toggle' },
                { key: 'MONITOR_ALERT_STATE', value: 'x', value_type: 'string', category: 'monitor', description: 'hidden' },
            ],
        });
        updateETLSetting.mockResolvedValue({ success: true });
    });

    test('loads settings, hides internal keys, and saves changed integer value', async () => {
        const user = userEvent.setup();
        render(<ETLSettingsManager />);

        await waitFor(() => expect(screen.getByText('ETL_BATCH_SIZE')).toBeInTheDocument());
        expect(screen.queryByText('MONITOR_ALERT_STATE')).not.toBeInTheDocument();

        const numInput = screen.getByDisplayValue('100');
        await user.clear(numInput);
        await user.type(numInput, '200');
        await user.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => expect(updateETLSetting).toHaveBeenCalledWith('ETL_BATCH_SIZE', '200'));
    });

    test('auto-saves boolean settings and refresh button reloads data', async () => {
        const user = userEvent.setup();
        render(<ETLSettingsManager />);

        await waitFor(() => expect(screen.getByText('AI_ENABLED')).toBeInTheDocument());
        const checkbox = screen.getByRole('checkbox');
        await user.click(checkbox);

        await waitFor(() => expect(updateETLSetting).toHaveBeenCalledWith('AI_ENABLED', 'true'));
        await user.click(screen.getByRole('button', { name: /Refresh/ }));
        expect(fetchETLSettings).toHaveBeenCalledTimes(2);
    });
});
