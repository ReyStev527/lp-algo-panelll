import { getStore } from "@netlify/blobs";

const API_SECRET = "LP_ALGO_2025_SECRET_KEY";

const ALLOWED_ACCOUNTS = [
  159956643,
  204122585,
  0,
  0,
  0
];

function respond(data, status) {
  if (!status) status = 200;
  return new Response(JSON.stringify(data), {
    status: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-API-Key, X-Account-ID"
    }
  });
}

function isAllowed(accountId) {
  var num = parseInt(accountId);
  if (!num || num <= 0) return false;
  for (var i = 0; i < ALLOWED_ACCOUNTS.length; i++) {
    if (ALLOWED_ACCOUNTS[i] > 0 && ALLOWED_ACCOUNTS[i] === num) return true;
  }
  return false;
}

export default async function handler(req, context) {
  if (req.method === "OPTIONS") {
    return respond({}, 200);
  }

  var url = new URL(req.url);
  var action = url.searchParams.get("action") || "";
  var accountId = url.searchParams.get("account_id") || "";
  var apiKey = url.searchParams.get("api_key") || req.headers.get("x-api-key") || "";

  if (apiKey !== API_SECRET) {
    return respond({ error: "Invalid API key" }, 403);
  }

  var store = getStore("ea-data");

  try {
    if (action === "login") {
      if (!accountId) return respond({ error: "account_id required" }, 400);
      if (!isAllowed(accountId)) {
        return respond({ error: "Account not authorized", account_id: accountId }, 403);
      }
      var token = Math.random().toString(36).substring(2) + Date.now().toString(36);
      await store.setJSON("session_" + accountId, {
        account_id: accountId,
        token: token,
        login_time: new Date().toISOString()
      });
      return respond({ success: true, account_id: accountId, token: token, message: "Login berhasil" });
    }

    if (action === "status") {
      if (!accountId) return respond({ error: "account_id required" }, 400);
      if (req.method === "POST") {
        var body = null;
        try { body = await req.json(); } catch (e) { return respond({ error: "Invalid JSON" }, 400); }
        await store.setJSON("status_" + accountId, {
          account_id: accountId,
          ea_online: true,
          data: body,
          updated_at: new Date().toISOString()
        });
        return respond({ success: true });
      } else {
        var data = null;
        try { data = await store.get("status_" + accountId, { type: "json" }); } catch (e) { data = null; }
        if (!data) {
          return respond({ account_id: accountId, ea_online: false, data: null, message: "EA belum pernah mengirim data" });
        }
        var updatedAt = new Date(data.updated_at || "2000-01-01").getTime();
        data.ea_online = (Date.now() - updatedAt) < 30000;
        return respond(data);
      }
    }

    if (action === "command") {
      if (!accountId) return respond({ error: "account_id required" }, 400);
      if (req.method === "POST") {
        var cbody = null;
        try { cbody = await req.json(); } catch (e) { return respond({ error: "Invalid JSON" }, 400); }
        if (!cbody.cmd) return respond({ error: "cmd required" }, 400);
        await store.setJSON("command_" + accountId, {
          account_id: accountId,
          cmd: cbody.cmd,
          params: cbody.params || {},
          executed: false,
          sent_at: new Date().toISOString()
        });
        return respond({ success: true, cmd: cbody.cmd });
      } else {
        var cdata = null;
        try { cdata = await store.get("command_" + accountId, { type: "json" }); } catch (e) { cdata = null; }
        if (!cdata || cdata.executed) return respond({ cmd: "NONE" });
        return respond(cdata);
      }
    }

    if (action === "ack") {
      if (!accountId) return respond({ error: "account_id required" }, 400);
      var adata = null;
      try { adata = await store.get("command_" + accountId, { type: "json" }); } catch (e) { adata = null; }
      if (adata) {
        adata.executed = true;
        adata.executed_at = new Date().toISOString();
        await store.setJSON("command_" + accountId, adata);
      }
      return respond({ success: true });
    }

    if (action === "settings") {
      if (!accountId) return respond({ error: "account_id required" }, 400);
      if (req.method === "POST") {
        var sbody = null;
        try { sbody = await req.json(); } catch (e) { return respond({ error: "Invalid JSON" }, 400); }
        await store.setJSON("settings_" + accountId, {
          account_id: accountId,
          settings: sbody,
          applied: false,
          updated_at: new Date().toISOString()
        });
        return respond({ success: true });
      } else {
        var sdata = null;
        try { sdata = await store.get("settings_" + accountId, { type: "json" }); } catch (e) { sdata = null; }
        if (!sdata) return respond({ settings: null });
        return respond(sdata);
      }
    }

    if (action === "settings_ack") {
      if (!accountId) return respond({ error: "account_id required" }, 400);
      var sadata = null;
      try { sadata = await store.get("settings_" + accountId, { type: "json" }); } catch (e) { sadata = null; }
      if (sadata) {
        sadata.applied = true;
        sadata.applied_at = new Date().toISOString();
        await store.setJSON("settings_" + accountId, sadata);
      }
      return respond({ success: true });
    }

    return respond({
      name: "LP Algo Remote Control API",
      version: "1.0",
      status: "running",
      time: new Date().toISOString()
    });

  } catch (err) {
    return respond({ error: "Internal server error" }, 500);
  }
}

export var config = {
  path: "/api/*"
};
