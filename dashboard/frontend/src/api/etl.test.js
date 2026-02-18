import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./client', () => ({
    default: 'http://localhost:8000',
    authFetch: vi.fn(),
}));

import { authFetch } from './client';
import * as etl from './etl';

describe('etl api helpers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('job and scheduler endpoints call expected urls', async () => {
        authFetch
            .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'job1' }] })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ running: true }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

        expect(await etl.fetchETLJobs()).toEqual([{ id: 'job1' }]);
        expect(await etl.fetchSchedulerStatus()).toEqual({ running: true });
        await etl.triggerETLJob('job1');
        await etl.pauseETLJob('job1');
        await etl.resumeETLJob('job1');

        expect(authFetch).toHaveBeenNthCalledWith(1, 'http://localhost:8000/api/admin/etl/jobs');
        expect(authFetch).toHaveBeenNthCalledWith(
            3,
            'http://localhost:8000/api/admin/etl/jobs/job1/trigger',
            expect.objectContaining({ method: 'POST' }),
        );
    });

    test('logs/settings/update endpoints build query params', async () => {
        authFetch
            .mockResolvedValueOnce({ ok: true, json: async () => ({ logs: [] }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ settings: [] }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ key: 'k', value: 'v' }) });

        await etl.fetchETLLogs({ jobId: 'job1', status: 'success', limit: 10 });
        await etl.fetchETLSettings('prompt');
        await etl.updateETLSetting('k', 'v x');

        expect(authFetch.mock.calls[0][0]).toContain('/api/admin/etl/logs?');
        expect(authFetch.mock.calls[0][0]).toContain('job_id=job1');
        expect(authFetch.mock.calls[0][0]).toContain('status=success');
        expect(authFetch.mock.calls[0][0]).toContain('limit=10');
        expect(authFetch.mock.calls[1][0]).toContain('category=prompt');
        expect(authFetch.mock.calls[2][0]).toContain('/api/admin/etl/settings/k?value=v%20x');
    });

    test('prompt template CRUD endpoints and activation', async () => {
        authFetch
            .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 1 }] })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1 }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 2 }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1, name: 'u' }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 3 }) });

        expect(await etl.fetchPromptTemplates()).toEqual([{ id: 1 }]);
        expect(await etl.fetchPromptTemplate(1)).toEqual({ id: 1 });
        expect(await etl.createPromptTemplate({ name: 'a' })).toEqual({ id: 2 });
        expect(await etl.updatePromptTemplate(1, { name: 'u' })).toEqual({ id: 1, name: 'u' });
        expect(await etl.deletePromptTemplate(1)).toEqual({ ok: true });
        expect(await etl.activatePromptTemplate(3)).toEqual({ ok: true });
        expect(await etl.fetchActivePromptTemplate()).toEqual({ id: 3 });
    });

    test('throws api error on failed response', async () => {
        authFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
        await expect(etl.fetchETLJobs()).rejects.toThrow('API error: 500');
    });
});
