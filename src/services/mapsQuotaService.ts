export const QUOTA_LIMIT = 500;
const STORAGE_KEY = 'google_maps_daily_quota';

interface QuotaData {
    date: string;
    count: number;
}

export const checkMapQuota = (): boolean => {
    try {
        const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const stored = localStorage.getItem(STORAGE_KEY);
        let data: QuotaData = { date: now, count: 0 };

        if (stored) {
            const parsed = JSON.parse(stored);
            // Reset if new day
            if (parsed.date === now) {
                data = parsed;
            }
        }

        if (data.count >= QUOTA_LIMIT) {
            console.error(`Google Maps Daily Internal Quota Exceeded: ${data.count}/${QUOTA_LIMIT}. Preventing request.`);
            return false;
        }

        return true;
    } catch (e) {
        console.error("Error checking map quota", e);
        return true; // Fail open to avoid breaking app if local storage fails
    }
};

export const incrementMapQuota = (): void => {
    try {
        const now = new Date().toISOString().split('T')[0];
        const stored = localStorage.getItem(STORAGE_KEY);
        let data: QuotaData = { date: now, count: 0 };

        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed.date === now) {
                data = parsed;
            }
        }

        data.count++;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

        if (data.count % 50 === 0) {
            if (import.meta.env.DEV) console.log(`Maps Usage Today: ${data.count}/${QUOTA_LIMIT}`);
        }
    } catch (e) {
        console.error("Error incrementing map quota", e);
    }
};

export const getQuotaUsage = (): QuotaData => {
    const now = new Date().toISOString().split('T')[0];
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
    return { date: now, count: 0 };
};
