import { http, HttpResponse } from 'msw';

const API_BASE_URL = 'http://localhost:8000';

export const handlers = [
    http.get(`${API_BASE_URL}/api/chat/authors/:authorId/summary`, ({ params }) => {
        if (params.authorId !== 'author_1') {
            return HttpResponse.json(
                { detail: `查無作者資料：${params.authorId}。可能不在目前直播或時間範圍內。` },
                { status: 404 }
            );
        }

        return HttpResponse.json({
            author_id: 'author_1',
            display_name: '@AuthorOne',
            author_images: [
                { id: 'source', url: 'https://example.com/avatar-source.jpg' },
                { id: '32x32', url: 'https://example.com/avatar-32.jpg' },
                { id: '64x64', url: 'https://example.com/avatar-64.jpg' },
            ],
            badges: [
                { title: 'Member (6 months)', icon_url: 'https://example.com/badge-16.png' }
            ],
            total_messages: 21,
            paid_messages: 1,
            first_seen: '2026-02-17T00:00:00Z',
            last_seen: '2026-02-17T01:00:00Z',
            aliases: [
                {
                    name: '@AuthorOne',
                    first_seen: '2026-02-17T00:00:00Z',
                    last_seen: '2026-02-17T01:00:00Z',
                    message_count: 21,
                },
            ],
        });
    }),

    http.get(`${API_BASE_URL}/api/chat/authors/:authorId/trend`, () => {
        return HttpResponse.json([
            { hour: '2026-02-17T00:00:00Z', count: 10 },
            { hour: '2026-02-17T01:00:00Z', count: 11 },
        ]);
    }),

    http.get(`${API_BASE_URL}/api/chat/authors/:authorId/messages`, ({ request }) => {
        const url = new URL(request.url);
        const offset = Number(url.searchParams.get('offset') || '0');

        if (offset >= 20) {
            return HttpResponse.json({
                author_id: 'author_1',
                total: 21,
                limit: 20,
                offset: 20,
                messages: [
                    {
                        id: 'msg_page_2_1',
                        time: '2026-02-17T00:10:00Z',
                        author: '@AuthorOne',
                        author_id: 'author_1',
                        message: 'page2 message',
                        emotes: [],
                        badges: [{ title: 'Member (6 months)', icon_url: 'https://example.com/badge-16.png' }],
                        message_type: 'text_message',
                        money: null,
                    },
                ],
            });
        }

        return HttpResponse.json({
            author_id: 'author_1',
            total: 21,
            limit: 20,
            offset: 0,
            messages: [
                {
                    id: 'msg_page_1_1',
                    time: '2026-02-17T00:00:00Z',
                    author: '@AuthorOne',
                    author_id: 'author_1',
                    message: 'hello :smile:',
                    emotes: [{ name: ':smile:', images: [{ url: 'https://example.com/smile.png' }] }],
                    badges: [{ title: 'Member (6 months)', icon_url: 'https://example.com/badge-16.png' }],
                    message_type: 'paid_message',
                    money: { text: '$100.00' },
                },
            ],
        });
    }),
];
