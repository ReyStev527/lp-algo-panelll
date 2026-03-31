exports.handler = async function(event, context) {
  var headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: headers, body: "{}" };
  }

  var API_SECRET = "LP_ALGO_2025_SECRET_KEY";
  var ALLOWED_ACCOUNTS = [159956643, 204122585];

  var params = event.queryStringParameters || {};
  var action = params.action || "";
  var accountId = params.account_id || "";
  var apiKey = params.api_key || "";

  if (apiKey !== API_SECRET) {
    return { statusCode: 403, headers: headers, body: JSON.stringify({ error: "Invalid API key" }) };
  }

  function isAllowed(id) {
    var num = parseInt(id);
    if (!num || num <= 0) return false;
    for (var i = 0; i < ALLOWED_ACCOUNTS.length; i++) {
      if (ALLOWED_ACCOUNTS[i] === num) return true;
    }
    return false;
  }

  function ok(data) {
    return { statusCode: 200, headers: headers, body: JSON.stringify(data) };
  }

  function err(data, code) {
    return { statusCode: code || 400, headers: headers, body: JSON.stringify(data) };
  }

  // Simple in-memory store using Netlify Blobs
  var store = null;
  try {
    var blobs = require("@netlify/blobs");
    store = blobs.getStore("ea-data");
  } catch(e) {
    store = null;
  }

  async function getData(key) {
    if (!store) return null;
    try { return await store.get(key, { type: "json" }); } catch(e) { return null; }
  }

  async function setData(key, val) {
    if (!store) return;
    try { await store.setJSON(key, val); } catch(e) { /* ignore */ }
  }

  try {
    // LOGIN
    if (action === "login") {
      if (!accountId) return err({ error: "account_id required" });
      if (!isAllowed(accountId)) return err({ error: "Account not authorized", account_id: accountId }, 403);
      var token = Math.random().toString(36).substring(2);
      await setData("session_" + accountId, { account_id: accountId, token: token, login_time: new Date().toISOString() });
      return ok({ success: true, account_id: accountId, token: token, message: "Login berhasil" });
    }

    // STATUS
    if (action === "status") {
      if (!accountId) return err({ error: "account_id required" });
      if (event.httpMethod === "POST") {
        var body = {};
        try { body = JSON.parse(event.body || "{}"); } catch(e) { return err({ error: "Invalid JSON" }); }
        await setData("status_" + accountId, { account_id: accountId, ea_online: true, data: body, updated_at: new Date().toISOString() });
        return ok({ success: true });
      } else {
        var data = await getData("status_" + accountId);
        if (!data) return ok({ account_id: accountId, ea_online: false, data: null });
        var age = Date.now() - new Date(data.updated_at || "2000-01-01").getTime();
        data.ea_online = age < 30000;
        return ok(data);
      }
    }

    // COMMAND
    if (action === "command") {
      if (!accountId) return err({ error: "account_id required" });
      if (event.httpMethod === "POST") {
        var cbody = {};
        try { cbody = JSON.parse(event.body || "{}"); } catch(e) { return err({ error: "Invalid JSON" }); }
        if (!cbody.cmd) return err({ error: "cmd required" });
        await setData("command_" + accountId, { account_id: accountId, cmd: cbody.cmd, params: cbody.params || {}, executed: false, sent_at: new Date().toISOString() });
        return ok({ success: true, cmd: cbody.cmd });
      } else {
        var cdata = await getData("command_" + accountId);
        if (!cdata || cdata.executed) return ok({ cmd: "NONE" });
        return ok(cdata);
      }
    }

    // ACK
    if (action === "ack") {
      if (!accountId) return err({ error: "account_id required" });
      var adata = await getData("command_" + accountId);
      if (adata) {
        adata.executed = true;
        adata.executed_at = new Date().toISOString();
        await setData("command_" + accountId, adata);
      }
      return ok({ success: true });
    }

    // SETTINGS
    if (action === "settings") {
      if (!accountId) return err({ error: "account_id required" });
      if (event.httpMethod === "POST") {
        var sbody = {};
        try { sbody = JSON.parse(event.body || "{}"); } catch(e) { return err({ error: "Invalid JSON" }); }
        await setData("settings_" + accountId, { account_id: accountId, settings: sbody, applied: false });
        return ok({ success: true });
      } else {
        var sdata = await getData("settings_" + accountId);
        if (!sdata) return ok({ settings: null });
        return ok(sdata);
      }
    }

    // SETTINGS ACK
    if (action === "settings_ack") {
      if (!accountId) return err({ error: "account_id required" });
      var sadata = await getData("settings_" + accountId);
      if (sadata) { sadata.applied = true; await setData("settings_" + accountId, sadata); }
      return ok({ success: true });
    }

    // DEFAULT
    return ok({ name: "LP Algo Remote Control API", version: "1.0", status: "running", time: new Date().toISOString() });

  } catch(e) {
    return err({ error: "Internal server error" }, 500);
  }
};
