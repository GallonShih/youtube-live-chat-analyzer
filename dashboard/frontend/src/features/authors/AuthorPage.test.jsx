import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import AuthorPage from './AuthorPage';

vi.mock('../../components/common/Navigation', () => ({
    default: () => <div>nav-mock</div>,
}));

vi.mock('./AuthorDetailContent', () => ({
    default: ({ authorId, initialStartTime, initialEndTime, showOpenInNewPage }) => (
        <div>
            detail:{authorId}:{initialStartTime}:{initialEndTime}:{String(showOpenInNewPage)}
        </div>
    ),
}));

describe('AuthorPage', () => {
    test('reads author id and query time range from url', () => {
        render(
            <MemoryRouter initialEntries={['/authors/UC123?start_time=2026-02-17T00:00:00Z&end_time=2026-02-17T12:00:00Z']}>
                <Routes>
                    <Route path="/authors/:authorId" element={<AuthorPage />} />
                </Routes>
            </MemoryRouter>,
        );

        expect(screen.getByText('Author Profile')).toBeInTheDocument();
        expect(screen.getByText('回 Dashboard')).toBeInTheDocument();
        expect(screen.getByText('nav-mock')).toBeInTheDocument();
        expect(
            screen.getByText('detail:UC123:2026-02-17T00:00:00Z:2026-02-17T12:00:00Z:false'),
        ).toBeInTheDocument();
    });
});
