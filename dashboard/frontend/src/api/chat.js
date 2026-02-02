import API_BASE_URL from './client';

export const fetchChatMessages = async ({ limit, offset, startTime, endTime, authorFilter, messageFilter, paidMessageFilter }) => {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit);
    if (offset) params.append('offset', offset);
    if (startTime) params.append('start_time', startTime);
    if (endTime) params.append('end_time', endTime);
    if (authorFilter) params.append('author_filter', authorFilter);
    if (messageFilter) params.append('message_filter', messageFilter);
    if (paidMessageFilter && paidMessageFilter !== 'all') params.append('paid_message_filter', paidMessageFilter);

    const response = await fetch(`${API_BASE_URL}/api/chat/messages?${params}`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
};

export const fetchChatMessageStats = async ({ startTime, endTime, authorFilter, messageFilter, paidMessageFilter, since }) => {
    const params = new URLSearchParams();
    if (startTime) params.append('start_time', startTime);
    if (endTime) params.append('end_time', endTime);
    if (authorFilter) params.append('author_filter', authorFilter);
    if (messageFilter) params.append('message_filter', messageFilter);
    if (paidMessageFilter && paidMessageFilter !== 'all') params.append('paid_message_filter', paidMessageFilter);
    if (since) params.append('since', since);

    const response = await fetch(`${API_BASE_URL}/api/chat/message-stats?${params}`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
};

export const fetchTopAuthors = async ({ startTime, endTime, authorFilter, messageFilter, paidMessageFilter }) => {
    const params = new URLSearchParams();
    if (startTime) params.append('start_time', startTime);
    if (endTime) params.append('end_time', endTime);
    if (authorFilter) params.append('author_filter', authorFilter);
    if (messageFilter) params.append('message_filter', messageFilter);
    if (paidMessageFilter && paidMessageFilter !== 'all') params.append('paid_message_filter', paidMessageFilter);

    const response = await fetch(`${API_BASE_URL}/api/chat/top-authors?${params}`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
};
