import { fetchAuthorMessages } from '../api/chat';

const BATCH_SIZE = 200;

export const fetchAllMessages = async (authorId, startTime, endTime) => {
    const allMessages = [];
    let offset = 0;
    let total = Infinity;

    while (offset < total) {
        const response = await fetchAuthorMessages({
            authorId,
            limit: BATCH_SIZE,
            offset,
            startTime,
            endTime,
        });
        total = response.total || 0;
        const batch = response.messages || [];
        allMessages.push(...batch);
        offset += BATCH_SIZE;
        if (batch.length === 0) break;
    }

    return allMessages;
};

const escapeCSV = (value) => {
    if (value == null) return '';
    const str = String(value);
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

export const downloadAsCSV = (messages, filename) => {
    const headers = ['time', 'author', 'author_id', 'message_type', 'message', 'money_currency', 'money_amount'];
    const rows = messages.map((msg) => {
        const currency = msg.money?.currency || '';
        const amount = msg.money?.amount != null ? msg.money.amount : '';
        return [
            msg.time || '',
            msg.author || '',
            msg.author_id || '',
            msg.message_type || '',
            msg.message || '',
            currency,
            amount,
        ].map(escapeCSV).join(',');
    });

    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    triggerDownload(csv, filename, 'text/csv;charset=utf-8;');
};

export const downloadAsJSON = (messages, filename) => {
    const json = JSON.stringify(messages, null, 2);
    triggerDownload(json, filename, 'application/json;charset=utf-8;');
};

const triggerDownload = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

export const buildFilename = (authorName, authorId, ext) => {
    const date = new Date().toISOString().slice(0, 10);
    const safeName = (authorName || 'author').replace(/[^\w\u4e00-\u9fff-]/g, '_');
    const safeId = (authorId || '').replace(/[^\w-]/g, '_');
    return `${safeName}_${safeId}_${date}.${ext}`;
};
