import { beforeEach, describe, expect, test, vi } from 'vitest';

const renderSpy = vi.fn();
const createRootSpy = vi.fn(() => ({ render: renderSpy }));

vi.mock('react-dom/client', () => ({
    default: {
        createRoot: createRootSpy,
    },
    createRoot: createRootSpy,
}));

vi.mock('./App.jsx', () => ({
    default: () => null,
}));

vi.mock('./index.css', () => ({}));

describe('main entry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="root"></div>';
    });

    test('bootstraps react app into #root', async () => {
        await import('./main.jsx');
        expect(createRootSpy).toHaveBeenCalledWith(document.getElementById('root'));
        expect(renderSpy).toHaveBeenCalled();
    });
});
