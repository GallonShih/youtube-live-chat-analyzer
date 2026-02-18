import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./client', () => ({
    default: 'http://localhost:8000',
    authFetch: vi.fn(),
}));

import { authFetch } from './client';
import {
    fetchWordFrequency,
    fetchWordlists,
    fetchWordlist,
    createWordlist,
    updateWordlist,
    deleteWordlist,
} from './wordcloud';

describe('wordcloud api helpers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('fetchWordFrequency builds query string', async () => {
        authFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ words: [] }) });

        const data = await fetchWordFrequency({
            startTime: '2026-02-18T00:00:00Z',
            endTime: '2026-02-18T01:00:00Z',
            limit: 50,
            excludeWords: ['a', 'b'],
            replacementWordlistId: 3,
            replacements: [{ source: 'ai', target: 'AI' }],
        });

        expect(data).toEqual({ words: [] });
        const calledUrl = authFetch.mock.calls[0][0];
        expect(calledUrl).toContain('/api/wordcloud/word-frequency?');
        expect(calledUrl).toContain('limit=50');
        expect(calledUrl).toContain('exclude_words=a%2Cb');
        expect(calledUrl).toContain('replacement_wordlist_id=3');
        expect(calledUrl).toContain('replacements=');
    });

    test('wordlist CRUD calls expected endpoints', async () => {
        authFetch
            .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 1 }] })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1 }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 2 }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1, words: ['x'] }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

        expect(await fetchWordlists()).toEqual([{ id: 1 }]);
        expect(await fetchWordlist(1)).toEqual({ id: 1 });
        expect(await createWordlist({ name: 'A', words: ['a'] })).toEqual({ id: 2 });
        expect(await updateWordlist(1, { words: ['x'] })).toEqual({ id: 1, words: ['x'] });
        expect(await deleteWordlist(1)).toBe(true);

        expect(authFetch.mock.calls[0][0]).toContain('/api/exclusion-wordlists');
        expect(authFetch.mock.calls[1][0]).toContain('/api/exclusion-wordlists/1');
        expect(authFetch.mock.calls[4][1]).toEqual(expect.objectContaining({ method: 'DELETE' }));
    });
});

