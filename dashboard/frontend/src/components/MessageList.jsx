import { useState, useEffect } from 'react';

const MessageRow = ({ message }) => {
    const formatTime = (utcTime) => {
        if (!utcTime) return 'N/A';
        const date = new Date(utcTime + 'Z'); // Ensure UTC parsing
        // Convert to +8 timezone (Asia/Taipei)
        const options = {
            timeZone: 'Asia/Taipei',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        };
        return new Intl.DateTimeFormat('zh-TW', options).format(date);
    };

    const renderMessageWithEmojis = (messageText, emotes) => {
        if (!messageText) return null;
        if (!emotes || emotes.length === 0) {
            return <span>{messageText}</span>;
        }

        // Create a map of emoji names to URLs
        // DB stores: {name: ":emoji:", images: [{url: "https://..."}]}
        const emoteMap = {};
        emotes.forEach(e => {
            if (e.name && e.images && e.images.length > 0) {
                // Use the first image URL
                emoteMap[e.name] = e.images[0].url;
            }
        });

        // Split message by emoji patterns (looking for :emoji_name: format)
        const parts = [];
        let lastIndex = 0;
        const regex = /:[a-zA-Z0-9_-]+:/g;
        let match;

        while ((match = regex.exec(messageText)) !== null) {
            // Add text before emoji
            if (match.index > lastIndex) {
                parts.push({
                    type: 'text',
                    content: messageText.substring(lastIndex, match.index),
                    key: `text-${lastIndex}`
                });
            }

            // Add emoji or text if not found
            const emojiName = match[0];
            if (emoteMap[emojiName]) {
                parts.push({
                    type: 'emoji',
                    name: emojiName,
                    url: emoteMap[emojiName],
                    key: `emoji-${match.index}`
                });
            } else {
                parts.push({
                    type: 'text',
                    content: emojiName,
                    key: `text-${match.index}`
                });
            }

            lastIndex = match.index + emojiName.length;
        }

        // Add remaining text
        if (lastIndex < messageText.length) {
            parts.push({
                type: 'text',
                content: messageText.substring(lastIndex),
                key: `text-${lastIndex}`
            });
        }

        // Render parts
        return (
            <span>
                {parts.map((part) =>
                    part.type === 'emoji' ? (
                        <img
                            key={part.key}
                            src={part.url}
                            alt={part.name}
                            className="inline-block align-middle mx-0.5"
                            style={{ height: '1.5em', width: 'auto' }}
                            loading="lazy"
                        />
                    ) : (
                        <span key={part.key}>{part.content}</span>
                    )
                )}
            </span>
        );
    };

    return (
        <div className="grid grid-cols-[auto_1fr_3fr] gap-4 text-sm border-b border-gray-200 py-2 hover:bg-gray-50">
            <span className="text-gray-500 whitespace-nowrap">{formatTime(message.time)}</span>
            <span className="font-semibold text-gray-700 truncate">{message.author || 'Unknown'}</span>
            <span className="text-gray-900 break-words">
                {renderMessageWithEmojis(message.message, message.emotes)}
            </span>
        </div>
    );
};

const MessageList = () => {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchMessages();
    }, []);

    const fetchMessages = async () => {
        try {
            setLoading(true);
            const response = await fetch('http://localhost:8000/api/chat/messages?limit=100');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            setMessages(data.messages || []);
            setError(null);
        } catch (err) {
            console.error('Error fetching messages:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="mt-8 bg-white rounded-lg shadow p-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-800">訊息列表</h2>
                <div className="flex justify-center items-center py-8">
                    <div className="text-gray-500">載入中...</div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="mt-8 bg-white rounded-lg shadow p-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-800">訊息列表</h2>
                <div className="flex justify-center items-center py-8">
                    <div className="text-red-500">錯誤: {error}</div>
                </div>
            </div>
        );
    }

    return (
        <div className="mt-8 bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">訊息列表</h2>
            <div className="mb-2 grid grid-cols-[auto_1fr_3fr] gap-4 text-sm font-semibold text-gray-600 border-b-2 border-gray-300 pb-2">
                <span>時間</span>
                <span>作者</span>
                <span>訊息</span>
            </div>
            <div className="space-y-0 max-h-96 overflow-y-auto">
                {messages.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">暫無訊息</div>
                ) : (
                    messages.map((msg) => <MessageRow key={msg.id} message={msg} />)
                )}
            </div>
        </div>
    );
};

export default MessageList;
