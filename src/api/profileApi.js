// src/api/profileApi.js
import { loadSnapshot, saveSnapshot } from "../utils/offlineStore.js";

const API = "http://localhost:5000";

function authHeaders(isJson = true) {
    const token = localStorage.getItem("token") || "";
    const h = {};
    if (isJson) h["Content-Type"] = "application/json";
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
}

async function readJson(r) {
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || `Request failed (${r.status})`);
    return j;
}

/* ---------- cache helpers ---------- */
async function setCache(key, value) {
    try {
        await saveSnapshot(key, value);
    } catch { }
}

async function getCache(key) {
    try {
        return await loadSnapshot(key);
    } catch {
        return null;
    }
}

/* ---------- PROFILE ---------- */

export async function getMyProfile() {
    try {
        const r = await fetch(`${API}/api/users/me`, {
            headers: authHeaders(true),
        });
        const data = await readJson(r);

        await setCache("profile", data);   // ✅ cache
        return data;

    } catch (e) {
        const cached = await getCache("profile");  // ✅ fallback
        if (cached) return cached;
        throw e;
    }
}

export async function uploadAvatar(file) {
    const token = localStorage.getItem("token") || "";
    const fd = new FormData();
    fd.append("avatar", file);

    const r = await fetch(`${API}/api/users/me/avatar`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
    });

    return readJson(r);
}

export async function deleteAvatar() {
    const r = await fetch(`${API}/api/users/me/avatar`, {
        method: "DELETE",
        headers: authHeaders(true),
    });
    return readJson(r);
}

export async function updateMyProfile(patch) {
    const r = await fetch(`${API}/api/users/me`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify(patch || {}),
    });

    const data = await readJson(r);
    await setCache("profile", data);   // refresh cache
    return data;
}

/* ---------- PROFILE CHANGE REQUEST ---------- */

export async function createProfileChangeRequest({ category, payload, note }) {
    const body =
        category === "bank"
            ? { category, bankDetails: payload, note }
            : { category, ...payload, note };

    const r = await fetch(`${API}/api/profile-change-requests`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify(body),
    });

    return readJson(r);
}

export async function getMyProfileChangeRequests() {
    const CACHE_KEY = "profile_requests";

    try {
        const r = await fetch(`${API}/api/profile-change-requests/mine`, {
            headers: authHeaders(true),
        });

        const data = await readJson(r);
        await setCache(CACHE_KEY, data);
        return data;

    } catch (e) {
        const cached = await getCache(CACHE_KEY);
        if (cached) return cached;
        throw e;
    }
}

export async function getProfileChangeApprovals({ status = "pending" } = {}) {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);

    const r = await fetch(`${API}/api/profile-change-requests/approvals?${qs.toString()}`, {
        headers: authHeaders(true),
    });

    return readJson(r);
}

export async function changeMyPassword({ currentPassword, newPassword }) {
    const r = await fetch(`${API}/api/users/me/password`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ currentPassword, newPassword }),
    });

    return readJson(r);
}

export async function decideProfileChangeRequest(id, { status, reviewNote = "" }) {
    const r = await fetch(`${API}/api/profile-change-requests/${id}/decision`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ status, reviewNote }),
    });

    return readJson(r);
}