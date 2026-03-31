import { getStore } from "@netlify/blobs";

var API_SECRET = "LP_ALGO_2025_SECRET_KEY";
var ALLOWED_ACCOUNTS = [159956643, 204122585];

function isAllowed(id) {
  var num = parseInt(id);
  if (!num || num <= 0) return false;
  for (var i = 0; i < ALLOWED_ACCOUNTS.length; i++) {
    if (ALLOWED_ACCOUNTS[i] === num) return true;
  }
  return false;
}

export async function handler(event, context) {
  var H = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: H, body: "{}" };
  }

  var params = event.queryStringParameters || {};
  var action = params.action || "";
  var accountId = params.account_id || "";
  var apiKey = params.api_key || "";

  if (apiKey !== API_SECRET) {
    return { statusCode: 403, headers: H, body: JSON.stringify({ error: "Invalid API key" }) };
  }

  function ok(d) { return { statusCode: 200, headers: H, body: JSON.stringify(d) }; }
  function fail(d, c) { return { statusCode: c || 400, headers: H, body: JSON.stringify(d) }; }

  var store = null;
  try {
    store = getStore("ea-data");
  } catch (e) {
    store = null;
  }

  async function get(key) {
    if (!store) return null;
    try {
      var raw = await store.get(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  async function set(key, val) {
    if (!store) return false;
    try {
      await store.set(key, JSON.stringify(val));
      return true;
    } catch (e) { return false; }
  }

  try {
    if (action === "login") {
      if (!accountId) return fail({ error: "account_id required" });
      if (!isAllowed(accountId)) return fail({ error: "Account not authorized" }, 403);
      return ok({ success: true, account_id: accountId, message: "Login berhasil" });
    }

    if (action === "status") {
      if (!accountId) return fail({ error: "account_id required" });
      if (event.httpMethod === "POST") {
        var body = null;
        try { body = JSON.parse(event.body || "{}"); } catch (e) { return fail({ error: "Invalid JSON" }); }
        await set("status_" + accountId, {
          account_id: accountId,
          ea_online: true,
          data: body,
          updated_at: new Date().toISOString()
        });
        var pendingCmd = await get("command_" + accountId);
        var cmdResp = { cmd: "NONE" };
        if (pendingCmd && !pendingCmd.executed) {
          cmdResp = { cmd: pendingCmd.cmd, params: pendingCmd.params || {} };
          pendingCmd.executed = true;
          pendingCmd.executed_at = new Date().toISOString();
          await set("command_" + accountId, pendingCmd);
        }
        return ok({ success: true, pending_cmd: cmdResp, storage: store ? "blobs" : "none" });
      } else {
        var data = await get("status_" + accountId);
        if (!data) return ok({ account_id: accountId, ea_online: false, data: null });
        var age = Date.now() - new Date(data.updated_at || "2000-01-01").getTime();
        data.ea_online = age < 60000;
        return ok(data);
      }
    }

    if (action === "command") {
      if (!accountId) return fail({ error: "account_id required" });
      if (event.httpMethod === "POST") {
        var cbody = null;
        try { cbody = JSON.parse(event.body || "{}"); } catch (e) { return fail({ error: "Invalid JSON" }); }
        if (!cbody.cmd) return fail({ error: "cmd required" });
        await set("command_" + accountId, {
          account_id: accountId,
          cmd: cbody.cmd,
          params: cbody.params || {},
          executed: false,
          sent_at: new Date().toISOString()
        });
        return ok({ success: true, cmd: cbody.cmd });
      } else {
        var cdata = await get("command_" + accountId);
        if (!cdata || cdata.executed) return ok({ cmd: "NONE" });
        return ok(cdata);
      }
    }

    if (action === "ack") {
      if (!accountId) return fail({ error: "account_id required" });
      var adata = await get("command_" + accountId);
      if (adata) {
        adata.executed = true;
        await set("command_" + accountId, adata);
      }
      return ok({ success: true });
    }

    if (action === "settings") {
      if (!accountId) return fail({ error: "account_id required" });
      if (event.httpMethod === "POST") {
        var sbody = null;
        try { sbody = JSON.parse(event.body || "{}"); } catch (e) { return fail({ error: "Invalid JSON" }); }
        await set("settings_" + accountId, { account_id: accountId, settings: sbody, applied: false });
        return ok({ success: true });
      } else {
        var sdata = await get("settings_" + accountId);
        if (!sdata) return ok({ settings: null, applied: true });
        return ok(sdata);
      }
    }

    if (action === "settings_ack") {
      if (!accountId) return fail({ error: "account_id required" });
      var sadata = await get("settings_" + accountId);
      if (sadata) { sadata.applied = true; await set("settings_" + accountId, sadata); }
      return ok({ success: true });
    }

    return ok({ name: "LP Algo Remote Control API", version: "4.0", status: "running", storage: store ? "blobs" : "none", time: new Date().toISOString() });

  } catch (e) {
    return fail({ error: "Server error: " + String(e.message || e) }, 500);
  }
}
