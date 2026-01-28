import { useState, useCallback } from 'react';
import { fetchEmojiStats } from '../api/emojis';

export const useEmojiStats = () => {
    const [emojis, setEmojis] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [total, setTotal] = useState(0);

    const getEmojis = useCallback(async ({ startTime, endTime, limit, offset, filter, typeFilter, isInitial = false }) => {
        try {
            if (isInitial) setLoading(true);
            else setIsRefreshing(true);

            const data = await fetchEmojiStats({
                startTime,
                endTime,
                limit,
                offset,
                filter,
                typeFilter
            });

            setEmojis(data.emojis || []);
            setTotal(data.total || 0);
            setError(null);
        } catch (err) {
            console.error('Error fetching emoji stats:', err);
            setError(err.message);
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    return {
        emojis,
        loading,
        isRefreshing,
        error,
        total,
        getEmojis
    };
};
