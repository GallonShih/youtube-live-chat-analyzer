import API_BASE_URL, { authFetch } from './client';

/**
 * 取得所有 ETL 任務
 */
export const fetchETLJobs = async () => {
    const res = await authFetch(`${API_BASE_URL}/api/admin/etl/jobs`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
};

/**
 * 取得排程器狀態
 */
export const fetchSchedulerStatus = async () => {
    const res = await authFetch(`${API_BASE_URL}/api/admin/etl/status`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
};

/**
 * 觸發 ETL 任務
 */
export const triggerETLJob = async (jobId) => {
    const res = await authFetch(`${API_BASE_URL}/api/admin/etl/jobs/${jobId}/trigger`, {
        method: 'POST',
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
};

/**
 * 暫停 ETL 任務
 */
export const pauseETLJob = async (jobId) => {
    const res = await authFetch(`${API_BASE_URL}/api/admin/etl/jobs/${jobId}/pause`, {
        method: 'POST',
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
};

/**
 * 恢復 ETL 任務
 */
export const resumeETLJob = async (jobId) => {
    const res = await authFetch(`${API_BASE_URL}/api/admin/etl/jobs/${jobId}/resume`, {
        method: 'POST',
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
};

/**
 * 取得 ETL 執行記錄
 */
export const fetchETLLogs = async ({ jobId, status, limit = 50 } = {}) => {
    const params = new URLSearchParams();
    if (jobId) params.append('job_id', jobId);
    if (status) params.append('status', status);
    if (limit) params.append('limit', limit);

    const res = await authFetch(`${API_BASE_URL}/api/admin/etl/logs?${params}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
};

/**
 * 取得 ETL 設定
 */
export const fetchETLSettings = async (category = null) => {
    const params = new URLSearchParams();
    if (category) params.append('category', category);

    const res = await authFetch(`${API_BASE_URL}/api/admin/etl/settings?${params}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
};

/**
 * 更新 ETL 設定
 */
export const updateETLSetting = async (key, value) => {
    const res = await authFetch(`${API_BASE_URL}/api/admin/etl/settings/${key}?value=${encodeURIComponent(value)}`, {
        method: 'PUT',
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
};

// ============= Prompt Templates API =============

/**
 * 取得所有提示詞範本
 */
export const fetchPromptTemplates = async () => {
    const res = await authFetch(`${API_BASE_URL}/api/admin/etl/prompt-templates`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
};

/**
 * 取得單一提示詞範本
 */
export const fetchPromptTemplate = async (templateId) => {
    const res = await authFetch(`${API_BASE_URL}/api/admin/etl/prompt-templates/${templateId}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
};

/**
 * 取得啟用的提示詞範本
 */
export const fetchActivePromptTemplate = async () => {
    const res = await authFetch(`${API_BASE_URL}/api/admin/etl/prompt-templates/active/current`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
};

/**
 * 建立新的提示詞範本
 */
export const createPromptTemplate = async (data) => {
    const res = await authFetch(`${API_BASE_URL}/api/admin/etl/prompt-templates`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
};

/**
 * 更新提示詞範本
 */
export const updatePromptTemplate = async (templateId, data) => {
    const res = await authFetch(`${API_BASE_URL}/api/admin/etl/prompt-templates/${templateId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
};

/**
 * 刪除提示詞範本
 */
export const deletePromptTemplate = async (templateId) => {
    const res = await authFetch(`${API_BASE_URL}/api/admin/etl/prompt-templates/${templateId}`, {
        method: 'DELETE',
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
};

/**
 * 啟用提示詞範本
 */
export const activatePromptTemplate = async (templateId) => {
    const res = await authFetch(`${API_BASE_URL}/api/admin/etl/prompt-templates/${templateId}/activate`, {
        method: 'POST',
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
};
