import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import MessageContextModal from './MessageContextModal';
import * as chatApi from '../../api/chat';

vi.mock('../../api/chat', () => ({
    fetchChatMessages: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeMsg = (id, overrides = {}) => ({
    id,
    time: '2026-02-21T08:55:00.000000',
    author: `@user-${id}`,
    author_id: `author-${id}`,
    message: `Message ${id}`,
    emotes: [],
    message_type: 'text_message',
    money: null,
    ...overrides,
});

const TARGET_ID = 'msg_target';
const targetMessage = makeMsg(TARGET_ID, { message: 'Target message' });

// 20 messages where the target sits in the middle
const PAGE_MSGS = [
    ...Array.from({ length: 10 }, (_, i) => makeMsg(`newer_${i}`)),
    targetMessage,
    ...Array.from({ length: 9 }, (_, i) => makeMsg(`older_${i}`)),
];

const DEFAULT_PROPS = {
    isOpen: true,
    onClose: vi.fn(),
    targetMessage,
    startTime: '2026-02-21T00:00:00.000Z',
    endTime: null,
};

/**
 * Set up the three sequential API calls Effect 1 makes on open:
 *   call 1 – count N (messages from startTime up to target)
 *   call 2 – count M (total messages in range)
 *   call 3 – page fetch for targetPage
 *
 * Default: countN=25, countM=50
 *   → messagesAfterTarget = 25  → targetPage = floor(25/20)+1 = 2
 *   → totalPages = ceil(50/20) = 3
 */
const setupInitialOpen = ({
    countN = 25,
    countM = 50,
    pageMessages = PAGE_MSGS,
} = {}) => {
    chatApi.fetchChatMessages
        .mockResolvedValueOnce({ total: countN, messages: [], limit: 1, offset: 0 })
        .mockResolvedValueOnce({ total: countM, messages: [], limit: 1, offset: 0 })
        .mockResolvedValueOnce({ total: countM, messages: pageMessages, limit: 20, offset: 20 });
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MessageContextModal', () => {
    // jsdom does not implement scrollIntoView; define a no-op so that any
    // scroll effect timers that fire after a test ends don't throw TypeError.
    beforeAll(() => {
        window.HTMLElement.prototype.scrollIntoView = () => {};
    });
    afterAll(() => {
        delete window.HTMLElement.prototype.scrollIntoView;
    });

    beforeEach(() => {
        chatApi.fetchChatMessages.mockReset();
    });

    // ── Visibility ──────────────────────────────────────────────────────────

    test('renders nothing when isOpen is false', () => {
        const { container } = render(
            <MessageContextModal {...DEFAULT_PROPS} isOpen={false} />
        );
        expect(container).toBeEmptyDOMElement();
    });

    test('renders modal header when open', async () => {
        setupInitialOpen();
        render(<MessageContextModal {...DEFAULT_PROPS} />);
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('訊息列表')).toBeInTheDocument();
    });

    // ── Close ───────────────────────────────────────────────────────────────

    test('calls onClose when × button is clicked', async () => {
        setupInitialOpen();
        const onClose = vi.fn();
        const user = userEvent.setup();
        render(<MessageContextModal {...DEFAULT_PROPS} onClose={onClose} />);

        await user.click(screen.getByRole('button', { name: '關閉' }));

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    // ── Loading state ────────────────────────────────────────────────────────

    test('shows loading indicator while fetching', () => {
        // Never-resolving promises keep the component in loading state
        chatApi.fetchChatMessages.mockReturnValue(new Promise(() => {}));
        render(<MessageContextModal {...DEFAULT_PROPS} />);

        expect(screen.getByText('載入中...')).toBeInTheDocument();
    });

    // ── Message content ──────────────────────────────────────────────────────

    test('renders messages after load completes', async () => {
        setupInitialOpen();
        render(<MessageContextModal {...DEFAULT_PROPS} />);

        await waitFor(() =>
            expect(screen.queryByText('載入中...')).not.toBeInTheDocument()
        );

        expect(screen.getAllByText('Target message').length).toBeGreaterThan(0);
    });

    test('shows empty-state when no messages returned', async () => {
        chatApi.fetchChatMessages
            .mockResolvedValueOnce({ total: 0, messages: [], limit: 1, offset: 0 })
            .mockResolvedValueOnce({ total: 0, messages: [], limit: 1, offset: 0 })
            .mockResolvedValueOnce({ total: 0, messages: [], limit: 20, offset: 0 });

        render(<MessageContextModal {...DEFAULT_PROPS} />);

        await waitFor(() =>
            expect(screen.queryByText('載入中...')).not.toBeInTheDocument()
        );

        expect(screen.getByText('無資料')).toBeInTheDocument();
    });

    // ── Highlight ────────────────────────────────────────────────────────────

    test('wraps target message with amber highlight classes', async () => {
        setupInitialOpen();
        render(<MessageContextModal {...DEFAULT_PROPS} />);

        await waitFor(() =>
            expect(screen.queryByText('載入中...')).not.toBeInTheDocument()
        );

        // Both mobile and desktop render the message; check at least one is highlighted
        const targetEls = screen.getAllByText('Target message');
        const highlighted = targetEls.some(
            (el) => el.closest('[class*="ring-amber"]') !== null
        );
        expect(highlighted).toBe(true);
    });

    // ── Emoji rendering ──────────────────────────────────────────────────────

    test('renders custom emotes as <img> elements', async () => {
        const emojiMsg = makeMsg('emoji_msg', {
            message: 'hi :yougotthis:',
            emotes: [{ name: ':yougotthis:', images: [{ url: 'https://example.com/ygt.png' }] }],
        });
        chatApi.fetchChatMessages
            .mockResolvedValueOnce({ total: 1, messages: [], limit: 1, offset: 0 })
            .mockResolvedValueOnce({ total: 1, messages: [], limit: 1, offset: 0 })
            .mockResolvedValueOnce({ total: 1, messages: [emojiMsg], limit: 20, offset: 0 });

        render(<MessageContextModal {...DEFAULT_PROPS} targetMessage={emojiMsg} />);

        await waitFor(() =>
            expect(screen.queryByText('載入中...')).not.toBeInTheDocument()
        );

        const imgs = screen.getAllByAltText(':yougotthis:');
        expect(imgs.length).toBeGreaterThan(0);
        expect(imgs[0]).toHaveAttribute('src', 'https://example.com/ygt.png');
    });

    test('leaves plain text intact when message has no emotes', async () => {
        setupInitialOpen({ pageMessages: [makeMsg('plain', { message: 'just text' })] });
        render(<MessageContextModal {...DEFAULT_PROPS} targetMessage={makeMsg('plain', { message: 'just text' })} />);

        await waitFor(() =>
            expect(screen.queryByText('載入中...')).not.toBeInTheDocument()
        );

        expect(screen.getAllByText('just text').length).toBeGreaterThan(0);
    });

    // ── Paid messages ────────────────────────────────────────────────────────

    test('shows money amount for paid_message type', async () => {
        const paidMsg = makeMsg('paid_1', {
            message: 'Super chat!',
            message_type: 'paid_message',
            money: { text: '$50.00' },
        });
        chatApi.fetchChatMessages
            .mockResolvedValueOnce({ total: 1, messages: [], limit: 1, offset: 0 })
            .mockResolvedValueOnce({ total: 1, messages: [], limit: 1, offset: 0 })
            .mockResolvedValueOnce({ total: 1, messages: [paidMsg], limit: 20, offset: 0 });

        render(<MessageContextModal {...DEFAULT_PROPS} targetMessage={paidMsg} />);

        await waitFor(() =>
            expect(screen.queryByText('載入中...')).not.toBeInTheDocument()
        );

        expect(screen.getAllByText('$50.00').length).toBeGreaterThan(0);
    });

    // ── Pagination footer ─────────────────────────────────────────────────────

    test('shows correct page / total in footer after load', async () => {
        // countN=25, countM=50 → targetPage=2, totalPages=3
        setupInitialOpen();
        render(<MessageContextModal {...DEFAULT_PROPS} />);

        await waitFor(() =>
            expect(screen.queryByText('載入中...')).not.toBeInTheDocument()
        );

        expect(screen.getByText('第 2 / 3 頁（共 50 則）')).toBeInTheDocument();
    });

    test('hides pagination footer when total is 0', async () => {
        chatApi.fetchChatMessages
            .mockResolvedValueOnce({ total: 0, messages: [], limit: 1, offset: 0 })
            .mockResolvedValueOnce({ total: 0, messages: [], limit: 1, offset: 0 })
            .mockResolvedValueOnce({ total: 0, messages: [], limit: 20, offset: 0 });

        render(<MessageContextModal {...DEFAULT_PROPS} />);

        await waitFor(() =>
            expect(screen.queryByText('載入中...')).not.toBeInTheDocument()
        );

        expect(screen.queryByRole('button', { name: '上一頁' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '下一頁' })).not.toBeInTheDocument();
    });

    test('prev button is disabled on page 1', async () => {
        // countN = countM → messagesAfterTarget = 0 → targetPage = 1
        setupInitialOpen({ countN: 50, countM: 50 });
        render(<MessageContextModal {...DEFAULT_PROPS} />);

        await waitFor(() =>
            expect(screen.queryByText('載入中...')).not.toBeInTheDocument()
        );

        expect(screen.getByRole('button', { name: '上一頁' })).toBeDisabled();
    });

    test('next button is disabled on the last page', async () => {
        // countN=20, countM=40 → messagesAfterTarget=20 → targetPage=2, totalPages=2
        chatApi.fetchChatMessages
            .mockResolvedValueOnce({ total: 20, messages: [], limit: 1, offset: 0 })
            .mockResolvedValueOnce({ total: 40, messages: [], limit: 1, offset: 0 })
            .mockResolvedValueOnce({ total: 40, messages: PAGE_MSGS, limit: 20, offset: 20 });

        render(<MessageContextModal {...DEFAULT_PROPS} />);

        await waitFor(() =>
            expect(screen.queryByText('載入中...')).not.toBeInTheDocument()
        );

        expect(screen.getByRole('button', { name: '下一頁' })).toBeDisabled();
    });

    // ── User-driven pagination ────────────────────────────────────────────────

    test('clicking 下一頁 fetches and displays the next page', async () => {
        setupInitialOpen(); // lands on page 2 of 3
        chatApi.fetchChatMessages.mockResolvedValueOnce({
            total: 50,
            messages: [makeMsg('page3_msg', { message: 'Page 3 message' })],
            limit: 20,
            offset: 40,
        });

        const user = userEvent.setup();
        render(<MessageContextModal {...DEFAULT_PROPS} />);
        await waitFor(() =>
            expect(screen.queryByText('載入中...')).not.toBeInTheDocument()
        );

        await user.click(screen.getByRole('button', { name: '下一頁' }));

        await waitFor(() =>
            expect(screen.getByText('第 3 / 3 頁（共 50 則）')).toBeInTheDocument()
        );
        expect(screen.getAllByText('Page 3 message').length).toBeGreaterThan(0);
    });

    test('clicking 上一頁 fetches and displays the previous page', async () => {
        setupInitialOpen(); // lands on page 2 of 3
        chatApi.fetchChatMessages.mockResolvedValueOnce({
            total: 50,
            messages: [makeMsg('page1_msg', { message: 'Page 1 message' })],
            limit: 20,
            offset: 0,
        });

        const user = userEvent.setup();
        render(<MessageContextModal {...DEFAULT_PROPS} />);
        await waitFor(() =>
            expect(screen.queryByText('載入中...')).not.toBeInTheDocument()
        );

        await user.click(screen.getByRole('button', { name: '上一頁' }));

        await waitFor(() =>
            expect(screen.getByText('第 1 / 3 頁（共 50 則）')).toBeInTheDocument()
        );
        expect(screen.getAllByText('Page 1 message').length).toBeGreaterThan(0);
    });

    test('can paginate multiple times consecutively', async () => {
        setupInitialOpen(); // page 2 of 3
        chatApi.fetchChatMessages
            .mockResolvedValueOnce({             // page 3 fetch
                total: 50,
                messages: [makeMsg('p3')],
                limit: 20,
                offset: 40,
            })
            .mockResolvedValueOnce({             // back to page 2
                total: 50,
                messages: [makeMsg('p2_again')],
                limit: 20,
                offset: 20,
            });

        const user = userEvent.setup();
        render(<MessageContextModal {...DEFAULT_PROPS} />);
        await waitFor(() =>
            expect(screen.queryByText('載入中...')).not.toBeInTheDocument()
        );

        await user.click(screen.getByRole('button', { name: '下一頁' }));
        await waitFor(() =>
            expect(screen.getByText('第 3 / 3 頁（共 50 則）')).toBeInTheDocument()
        );

        await user.click(screen.getByRole('button', { name: '上一頁' }));
        await waitFor(() =>
            expect(screen.getByText('第 2 / 3 頁（共 50 則）')).toBeInTheDocument()
        );
    });

    // ── Time range filter ─────────────────────────────────────────────────────

    test('shows time-range arrow in header when startTime is provided', async () => {
        setupInitialOpen();
        render(<MessageContextModal {...DEFAULT_PROPS} startTime="2026-02-21T00:00:00.000Z" />);

        expect(screen.getByText(/→/)).toBeInTheDocument();
    });

    test('hides time-range from header when both startTime and endTime are null', async () => {
        setupInitialOpen();
        render(<MessageContextModal {...DEFAULT_PROPS} startTime={null} endTime={null} />);

        expect(screen.queryByText(/→/)).not.toBeInTheDocument();
    });

    // ── 12-hour default when no time filter ───────────────────────────────────

    test('injects 12-hour start window when startTime is null', async () => {
        setupInitialOpen();
        render(<MessageContextModal {...DEFAULT_PROPS} startTime={null} endTime={null} />);

        await waitFor(() => {
            expect(chatApi.fetchChatMessages).toHaveBeenCalled();
        });

        // Every fetchChatMessages call should include a non-null startTime
        chatApi.fetchChatMessages.mock.calls.forEach(([args]) => {
            expect(args.startTime).toBeTruthy();
        });
    });

    test('uses provided startTime as-is when it is not null', async () => {
        const startTime = '2026-02-21T00:00:00.000Z';
        setupInitialOpen();
        render(<MessageContextModal {...DEFAULT_PROPS} startTime={startTime} />);

        await waitFor(() => {
            expect(chatApi.fetchChatMessages).toHaveBeenCalled();
        });

        chatApi.fetchChatMessages.mock.calls.forEach(([args]) => {
            expect(args.startTime).toBe(startTime);
        });
    });

    // ── Scroll-to-target ──────────────────────────────────────────────────────

    test('scrolls target message into view after messages load', async () => {
        const scrollIntoView = vi.spyOn(window.HTMLElement.prototype, 'scrollIntoView');

        setupInitialOpen();
        render(<MessageContextModal {...DEFAULT_PROPS} />);

        // Wait for messages to load
        await waitFor(() =>
            expect(screen.queryByText('載入中...')).not.toBeInTheDocument()
        );

        // Wait past the component's 100ms scroll setTimeout
        await new Promise(resolve => setTimeout(resolve, 200));

        expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
        scrollIntoView.mockRestore();
    });

    // ── State reset on close ──────────────────────────────────────────────────

    test('hides the modal when isOpen switches to false', async () => {
        setupInitialOpen();
        const { rerender } = render(<MessageContextModal {...DEFAULT_PROPS} />);
        await waitFor(() =>
            expect(screen.queryByText('載入中...')).not.toBeInTheDocument()
        );

        rerender(<MessageContextModal {...DEFAULT_PROPS} isOpen={false} />);

        expect(screen.queryByText('訊息列表')).not.toBeInTheDocument();
    });

    test('re-fetches fresh data when modal reopens with a new target', async () => {
        setupInitialOpen();
        const { rerender } = render(<MessageContextModal {...DEFAULT_PROPS} />);
        await waitFor(() =>
            expect(screen.queryByText('載入中...')).not.toBeInTheDocument()
        );

        // Close and reopen with a different message
        rerender(<MessageContextModal {...DEFAULT_PROPS} isOpen={false} />);

        const newTarget = makeMsg('msg_new', { message: 'New target message' });
        chatApi.fetchChatMessages
            .mockResolvedValueOnce({ total: 5, messages: [], limit: 1, offset: 0 })
            .mockResolvedValueOnce({ total: 10, messages: [], limit: 1, offset: 0 })
            .mockResolvedValueOnce({ total: 10, messages: [newTarget], limit: 20, offset: 0 });

        rerender(
            <MessageContextModal {...DEFAULT_PROPS} isOpen targetMessage={newTarget} />
        );

        await waitFor(() =>
            expect(screen.queryByText('載入中...')).not.toBeInTheDocument()
        );

        expect(screen.getAllByText('New target message').length).toBeGreaterThan(0);
    });
});
