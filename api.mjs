// LP Algo Remote Control API — Netlify Serverless Function
// Menggantikan PHP API, menggunakan Netlify Blobs untuk penyimpanan
import { getStore } from "@netlify/blobs";

// ======================== KONFIGURASI ========================
// GANTI API_SECRET ini! Harus SAMA di EA (InpPanelAPIKey) dan Web Panel
const API_SECRET = "LP_ALGO_2025_SECRET_KEY";

// GANTI daftar akun sesuai EA kamu (sama dengan ALLOWED_ACCOUNT di EA)
const ALLOWED_ACCOUNTS = [
  159956643,  // Account #1
  0,          // Account #2 (isi jika ada)
  0,          // Account #3
  0,          // Account #4
  0,          // Account #5
];

// ======================== HELPER ========================
function respond(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-API-Key, X-Account-ID",
    },
  });
}

function isAllowed(accountId) {
  const num = parseInt(accountId);
  if (!num || num <= 0) return false;
  return ALLOWED_ACCOUNTS.some((a) => a > 0 && a === num);
}

// ======================== MAIN HANDLER ========================
export default async (req, context) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return respond({}, 200);
  }

  // Parse URL parameters
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";
  const accountId = url.searchParams.get("account_id") || "";
  const apiKey = url.searchParams.get("api_key") || req.headers.get("x-api-key") || "";

  // Validasi API key
  if (apiKey !== API_SECRET) {
    return respond({ error: "Invalid API key" }, 403);
  }

  // Inisialisasi Netlify Blobs store
  const store = getStore("ea-data");

  // ======================== ROUTING ========================
  try {
    switch (action) {
      // === LOGIN ===
      case "login": {
        if (!accountId) return respond({ error: "account_id required" }, 400);
        if (!isAllowed(accountId)) {
          return respond({
            error: "Account not authorized",
            account_id: accountId,
          }, 403);
        }
        // Simpan session
        const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
        await store.setJSON(`session_${accountId}`, {
          account_id: accountId,
          token,
          login_time: new Date().toISOString(),
        });
        return respond({
          success: true,
          account_id: accountId,
          token,
          message: "Login berhasil",
        });
      }

      // === STATUS (EA → Server → Web Panel) ===
      case "status": {
        if (!accountId) return respond({ error: "account_id required" }, 400);

        if (req.method === "POST") {
          // EA mengirim status
          let body;
          try { body = await req.json(); } catch { return respond({ error: "Invalid JSON" }, 400); }
          await store.setJSON(`status_${accountId}`, {
            account_id: accountId,
            ea_online: true,
            data: body,
            updated_at: new Date().toISOString(),
          });
          return respond({ success: true });
        } else {
          // Web panel mengambil status
          let data;
          try { data = await store.get(`status_${accountId}`, { type: "json" }); } catch { data = null; }
          if (!data) {
            return respond({
              account_id: accountId,
              ea_online: false,
              data: null,
              message: "EA belum pernah mengirim data",
            });
          }
          // Cek online (timeout 30 detik)
          const updatedAt = new Date(data.updated_at || "2000-01-01").getTime();
          data.ea_online = (Date.now() - updatedAt) < 30000;
          return respond(data);
        }
      }

      // === COMMAND (Web Panel → Server → EA) ===
      case "command": {
        if (!accountId) return respond({ error: "account_id required" }, 400);

        if (req.method === "POST") {
          // Web panel mengirim command
          let body;
          try { body = await req.json(); } catch { return respond({ error: "Invalid JSON" }, 400); }
          if (!body.cmd) return respond({ error: "cmd required" }, 400);
          await store.setJSON(`command_${accountId}`, {
            account_id: accountId,
            cmd: body.cmd,
            params: body.params || {},
            executed: false,
            sent_at: new Date().toISOString(),
          });
          return respond({ success: true, cmd: body.cmd });
        } else {
          // EA mengambil command
          let data;
          try { data = await store.get(`command_${accountId}`, { type: "json" }); } catch { data = null; }
          if (!data || data.executed) {
            return respond({ cmd: "NONE" });
          }
          return respond(data);
        }
      }

      // === ACK (EA konfirmasi command sudah dieksekusi) ===
      case "ack": {
        if (!accountId) return respond({ error: "account_id required" }, 400);
        let data;
        try { data = await store.get(`command_${accountId}`, { type: "json" }); } catch { data = null; }
        if (data) {
          data.executed = true;
          data.executed_at = new Date().toISOString();
          await store.setJSON(`command_${accountId}`, data);
        }
        return respond({ success: true });
      }

      // === SETTINGS ===
      case "settings": {
        if (!accountId) return respond({ error: "account_id required" }, 400);

        if (req.method === "POST") {
          let body;
          try { body = await req.json(); } catch { return respond({ error: "Invalid JSON" }, 400); }
          await store.setJSON(`settings_${accountId}`, {
            account_id: accountId,
            settings: body,
            applied: false,
            updated_at: new Date().toISOString(),
          });
          return respond({ success: true });
        } else {
          let data;
          try { data = await store.get(`settings_${accountId}`, { type: "json" }); } catch { data = null; }
          if (!data) return respond({ settings: null });
          return respond(data);
        }
      }

      // === SETTINGS ACK ===
      case "settings_ack": {
        if (!accountId) return respond({ error: "account_id required" }, 400);
        let data;
        try { data = await store.get(`settings_${accountId}`, { type: "json" }); } catch { data = null; }
        if (data) {
          data.applied = true;
          data.applied_at = new Date().toISOString();
          await store.setJSON(`settings_${accountId}`, data);
        }
        return respond({ success: true });
      }

      default:
        return respond({
          name: "LP Algo Remote Control API",
          version: "1.0",
          status: "running",
          time: new Date().toISOString(),
        });
    }
  } catch (err) {
    console.error("API Error:", err);
    return respond({ error: "Internal server error" }, 500);
  }
};

// Netlify Function config
export const config = {
  path: "/api/*",
};
