"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/*
 * Local recovery tool for Windows TLS setups where Prisma cannot connect
 * directly to the managed database. It uses the already-running local API
 * and the admin account to apply the exact same catalogue as seed.ts.
 */
require("dotenv/config");
process.env.SKIP_SEED_EXECUTION = '1';
const { MARKET_ITEMS, CASES, dropWeight } = require('./seed');
const baseUrl = process.env.LOCAL_API_URL || 'http://localhost:5000';
async function api(path, token, init = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
        throw new Error(`${path}: ${body.error || response.statusText}`);
    return body;
}
async function main() {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password)
        throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required in .env');
    const login = await api('/api/auth/login', undefined, { method: 'POST', body: JSON.stringify({ email, password }) });
    const token = login.token;
    const existing = await api('/api/admin/items', token);
    for (const item of MARKET_ITEMS) {
        await api(`/api/admin/items/${item.id}`, token, { method: 'PATCH', body: JSON.stringify({ ...item, active: true }) });
    }
    for (const item of existing) {
        if (!MARKET_ITEMS.some((catalogueItem) => catalogueItem.id === item.id)) {
            await api(`/api/admin/items/${item.id}`, token, { method: 'PATCH', body: JSON.stringify({ active: false }) });
        }
    }
    const existingCases = await api('/api/admin/cases', token);
    for (const config of CASES) {
        const targetCase = existingCases.find((item) => item.slug === config.slug);
        if (!targetCase)
            throw new Error(`Case ${config.slug} does not exist; run the regular seed when direct TLS is available.`);
        await api(`/api/admin/cases/${targetCase.id}`, token, { method: 'PATCH', body: JSON.stringify({ name: config.name, price: config.price, image: config.image, active: true }) });
        const items = MARKET_ITEMS.filter((item) => config.itemIds.includes(item.id)).map((item) => ({ itemId: item.id, weight: dropWeight(item.price) }));
        await api(`/api/admin/cases/${targetCase.id}/items`, token, { method: 'PUT', body: JSON.stringify({ items }) });
    }
    console.log(`API catalogue sync complete: ${MARKET_ITEMS.length} skins, ${CASES.length} cases.`);
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=sync-catalog-via-api.js.map