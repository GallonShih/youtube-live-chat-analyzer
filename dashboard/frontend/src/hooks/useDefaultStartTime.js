import { useState, useEffect } from 'react';
import API_BASE_URL, { authFetch } from '../api/client';
import { formatLocalHour } from '../utils/formatters';

/**
 * Fetches the admin-configured default_start_time from system_settings.
 * Returns the value converted to local time (for datetime-local inputs) or null.
 */
export function useDefaultStartTime() {
    const [defaultStartTime, setDefaultStartTime] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const res = await authFetch(`${API_BASE_URL}/api/admin/settings/default_start_time`);
                if (!res.ok) throw new Error('not found');
                const data = await res.json();
                if (!cancelled && data.value) {
                    setDefaultStartTime(formatLocalHour(new Date(data.value)));
                }
            } catch {
                // No default set — leave null
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, []);

    return { defaultStartTime, loading };
}
