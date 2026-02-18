import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import EventMarkerModal from './EventMarkerModal';

describe('EventMarkerModal', () => {
    const onClose = vi.fn();
    const setMarkers = vi.fn();
    const setShowLabels = vi.fn();
    const setOpacity = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('adds/removes/updates markers and supports escape close', async () => {
        const user = userEvent.setup();
        render(
            <EventMarkerModal
                isOpen
                onClose={onClose}
                markers={[{
                    id: 1,
                    startTime: '2026-02-18T00:00',
                    endTime: '2026-02-18T00:05',
                    label: 'old',
                    color: '#1677ff',
                }]}
                setMarkers={setMarkers}
                showLabels={true}
                setShowLabels={setShowLabels}
                opacity={30}
                setOpacity={setOpacity}
            />,
        );

        await user.click(screen.getByRole('button', { name: '新增標記' }));
        const addUpdater = setMarkers.mock.calls[0][0];
        const added = addUpdater([]);
        expect(added).toHaveLength(1);
        expect(added[0]).toMatchObject({
            label: '',
            startTime: '',
            endTime: '',
        });

        fireEvent.change(screen.getByDisplayValue('old'), {
            target: { value: 'old updated' },
        });
        const updateUpdater = setMarkers.mock.calls.at(-1)[0];
        const updated = updateUpdater([{
            id: 1,
            startTime: '2026-02-18T00:00',
            endTime: '2026-02-18T00:05',
            label: 'old',
            color: '#1677ff',
        }]);
        expect(updated[0].label).toContain('updated');

        await user.click(screen.getByTitle('刪除'));
        const removeUpdater = setMarkers.mock.calls.at(-1)[0];
        const removed = removeUpdater([{ id: 1 }, { id: 2 }]);
        expect(removed).toEqual([{ id: 2 }]);

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });

    test('imports markers from json file', () => {
        const OriginalReader = window.FileReader;
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => { });
        class MockReader {
            readAsText() {
                this.onload({
                    target: {
                        result: JSON.stringify([
                            { startTime: '2026-02-18 10:00', endTime: '2026-02-18 10:15', label: 'A' },
                        ]),
                    },
                });
            }
        }
        window.FileReader = MockReader;

        const { container } = render(
            <EventMarkerModal
                isOpen
                onClose={onClose}
                markers={[]}
                setMarkers={setMarkers}
                showLabels={false}
                setShowLabels={setShowLabels}
                opacity={20}
                setOpacity={setOpacity}
            />,
        );

        const input = container.querySelector('input[type="file"]');
        fireEvent.change(input, {
            target: {
                files: [new File(['data'], 'markers.json', { type: 'application/json' })],
            },
        });

        const updater = setMarkers.mock.calls.at(-1)[0];
        const merged = updater([]);
        expect(merged).toHaveLength(1);
        expect(merged[0]).toMatchObject({
            startTime: '2026-02-18T10:00',
            endTime: '2026-02-18T10:15',
            label: 'A',
        });
        expect(alertSpy).not.toHaveBeenCalled();

        window.FileReader = OriginalReader;
        alertSpy.mockRestore();
    });
});
