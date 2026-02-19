import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchAllMessages, downloadAsCSV, downloadAsJSON, buildFilename } from './downloadMessages';

vi.mock('../api/chat', () => ({
    fetchAuthorMessages: vi.fn(),
}));

import { fetchAuthorMessages } from '../api/chat';

// jsdom doesn't have URL.createObjectURL — polyfill for tests
beforeEach(() => {
    if (!URL.createObjectURL) {
        URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
    }
    if (!URL.revokeObjectURL) {
        URL.revokeObjectURL = vi.fn();
    }
});

describe('downloadMessages', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('fetchAllMessages', () => {
        test('fetches all messages in a single batch when total <= 200', async () => {
            const msgs = Array.from({ length: 5 }, (_, i) => ({ id: `m${i}` }));
            fetchAuthorMessages.mockResolvedValueOnce({ total: 5, messages: msgs });

            const result = await fetchAllMessages('author_1', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');

            expect(fetchAuthorMessages).toHaveBeenCalledTimes(1);
            expect(fetchAuthorMessages).toHaveBeenCalledWith({
                authorId: 'author_1',
                limit: 200,
                offset: 0,
                startTime: '2026-01-01T00:00:00Z',
                endTime: '2026-01-02T00:00:00Z',
            });
            expect(result).toHaveLength(5);
        });

        test('fetches multiple batches when total > 200', async () => {
            const batch1 = Array.from({ length: 200 }, (_, i) => ({ id: `m${i}` }));
            const batch2 = Array.from({ length: 50 }, (_, i) => ({ id: `m${200 + i}` }));

            fetchAuthorMessages
                .mockResolvedValueOnce({ total: 250, messages: batch1 })
                .mockResolvedValueOnce({ total: 250, messages: batch2 });

            const result = await fetchAllMessages('author_1', null, null);

            expect(fetchAuthorMessages).toHaveBeenCalledTimes(2);
            expect(fetchAuthorMessages).toHaveBeenNthCalledWith(2, expect.objectContaining({ offset: 200 }));
            expect(result).toHaveLength(250);
        });

        test('stops early when batch returns empty messages', async () => {
            fetchAuthorMessages
                .mockResolvedValueOnce({ total: 100, messages: [] });

            const result = await fetchAllMessages('author_1', null, null);

            expect(fetchAuthorMessages).toHaveBeenCalledTimes(1);
            expect(result).toHaveLength(0);
        });

        test('handles total of 0', async () => {
            fetchAuthorMessages.mockResolvedValueOnce({ total: 0, messages: [] });

            const result = await fetchAllMessages('author_1', null, null);

            expect(result).toHaveLength(0);
        });
    });

    describe('downloadAsCSV', () => {
        let capturedContent;
        let clickedLink;
        const OriginalBlob = globalThis.Blob;

        beforeEach(() => {
            capturedContent = null;
            clickedLink = { click: vi.fn() };
            globalThis.Blob = class extends OriginalBlob {
                constructor(parts, options) {
                    super(parts, options);
                    capturedContent = parts[0];
                }
            };
            URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
            URL.revokeObjectURL = vi.fn();
            vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
            vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});
            vi.spyOn(document, 'createElement').mockImplementation((tag) => {
                if (tag === 'a') return clickedLink;
                return OriginalBlob.prototype;
            });
        });

        afterEach(() => {
            globalThis.Blob = OriginalBlob;
        });

        test('generates CSV with BOM, headers, and triggers download', () => {
            const messages = [
                {
                    time: '2026-01-01T00:00:00Z',
                    author: 'Alice',
                    author_id: 'a1',
                    message_type: 'text_message',
                    message: 'hello',
                    money: null,
                },
            ];

            downloadAsCSV(messages, 'test.csv');

            // BOM
            expect(capturedContent.charCodeAt(0)).toBe(0xFEFF);
            // Headers
            expect(capturedContent).toContain('time,author,author_id,message_type,message,money_currency,money_amount');
            // Data row
            expect(capturedContent).toContain('2026-01-01T00:00:00Z,Alice,a1,text_message,hello,,');
            // Download triggered
            expect(clickedLink.download).toBe('test.csv');
            expect(clickedLink.click).toHaveBeenCalled();
            expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
        });

        test('escapes double quotes and commas in CSV values', () => {
            downloadAsCSV([
                {
                    time: '2026-01-01T00:00:00Z',
                    author: 'Bob "the builder"',
                    author_id: 'b1',
                    message_type: 'text_message',
                    message: 'hi, world',
                    money: { currency: 'USD', amount: 100 },
                },
            ], 'test.csv');

            expect(capturedContent).toContain('"Bob ""the builder"""');
            expect(capturedContent).toContain('"hi, world"');
            expect(capturedContent).toContain('USD,100');
        });

        test('handles messages with newlines in content', () => {
            downloadAsCSV([
                {
                    time: '',
                    author: '',
                    author_id: '',
                    message_type: '',
                    message: 'line1\nline2',
                    money: null,
                },
            ], 'test.csv');

            expect(capturedContent).toContain('"line1\nline2"');
        });

        test('handles empty messages array', () => {
            downloadAsCSV([], 'test.csv');

            expect(capturedContent.charCodeAt(0)).toBe(0xFEFF);
            // Only header line, no data rows
            const lines = capturedContent.substring(1).split('\n');
            expect(lines).toHaveLength(1);
            expect(lines[0]).toBe('time,author,author_id,message_type,message,money_currency,money_amount');
        });
    });

    describe('downloadAsJSON', () => {
        let capturedContent;
        let clickedLink;
        const OriginalBlob = globalThis.Blob;

        beforeEach(() => {
            capturedContent = null;
            clickedLink = { click: vi.fn() };
            globalThis.Blob = class extends OriginalBlob {
                constructor(parts, options) {
                    super(parts, options);
                    capturedContent = parts[0];
                }
            };
            URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
            URL.revokeObjectURL = vi.fn();
            vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
            vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});
            vi.spyOn(document, 'createElement').mockImplementation((tag) => {
                if (tag === 'a') return clickedLink;
                return {};
            });
        });

        afterEach(() => {
            globalThis.Blob = OriginalBlob;
        });

        test('generates pretty-printed JSON and triggers download', () => {
            const messages = [{ id: 'm1', message: 'hello' }];

            downloadAsJSON(messages, 'test.json');

            expect(capturedContent).toBe(JSON.stringify(messages, null, 2));
            expect(clickedLink.download).toBe('test.json');
            expect(clickedLink.click).toHaveBeenCalled();
        });
    });

    describe('buildFilename', () => {
        beforeEach(() => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-02-19T12:00:00Z'));
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        test('generates filename with author name, id, and date', () => {
            const result = buildFilename('@AuthorOne', 'author_1', 'csv');
            expect(result).toBe('_AuthorOne_author_1_2026-02-19.csv');
        });

        test('sanitizes special characters in author name', () => {
            const result = buildFilename('Bad/Name<>', 'id-1', 'json');
            // / < > each replaced by _
            expect(result).toBe('Bad_Name___id-1_2026-02-19.json');
        });

        test('uses default name when authorName is null', () => {
            const result = buildFilename(null, 'id_1', 'csv');
            expect(result).toBe('author_id_1_2026-02-19.csv');
        });

        test('preserves Chinese characters in filename', () => {
            const result = buildFilename('測試用戶', 'id_1', 'csv');
            expect(result).toBe('測試用戶_id_1_2026-02-19.csv');
        });
    });
});
