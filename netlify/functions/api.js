var fs = require("fs");
var path = require("path");

var DATA_DIR = "/tmp/ea-data";
var API_SECRET = "LP_ALGO_2025_SECRET_KEY";
var ALLOWED_ACCOUNTS = [159956643, 204122585];

function ensureDir() {
  try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e) {}
}

function getData(key) {
  try {
    var file = path.join(DATA_DIR, key + ".json");
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch(e) { return null; }
}

function setData(key, val) {
  try {
    ensureDir();
    fs.writeFileSync(path.join(DATA_DIR, key + ".json"), JSON.stringify(val));
    return true;
  } catch(e) { return false; }
}

function isAllowed(id) {
  var num = parseInt(id);
  if (!num || num <= 0) return false;
  for (var i = 0; i < ALLOWED_ACCOUNTS.length; i++) {
    if (ALLOWED_ACCOUNTS[i] === num) return true;
  }
  return false;
}

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

  var params = event.queryStringParameters || {};
  var action = params.action || "";
  var accountId = params.account_id || "";
  var apiKey = params.api_key || "";

  if (apiKey !== API_SECRET) {
    return { statusCode: 403, headers: headers, body: JSON.stringify({ error: "Invalid API key" }) };
  }

  function ok(data) {
    return { statusCode: 200, headers: headers, body: JSON.stringify(data) };
  }
  function err(data, code) {
    return { statusCode: code || 400, headers: headers, body: JSON.stringify(data) };
  }

  try {
    if (action === "login") {
      if (!accountId) return err({ error: "account_id required" });
      if (!isAllowed(accountId)) return err({ error: "Account not authorized", account_id: accountId }, 403);
      setData("session_" + accountId, { account_id: accountId, time: new Date().toISOString() });
      return ok({ success: true, account_id: accountId, message: "Login berhasil" });
    }

    if (action === "status") {
      if (!accountId) return err({ error: "account_id required" });
      if (event.httpMethod === "POST") {
        var body = {};
        try { body = JSON.parse(event.body || "{}"); } catch(e) { return err({ error: "Invalid JSON" }); }
        setData("status_" + accountId, {
          account_id: accountId,
          ea_online: true,
          data: body,
          updated_at: new Date().toISOString()
        });
        return ok({ success: true, stored: true });
      } else {
        var data = getData("status_" + accountId);
        if (!data) return ok({ account_id: accountId, ea_online: false, data: null });
        var age = Date.now() - new Date(data.updated_at || "2000-01-01").getTime();
        data.ea_online = age < 60000;
        return ok(data);
      }
    }

    if (action === "command") {
      if (!accountId) return err({ error: "account_id required" });
      if (event.httpMethod === "POST") {
        var cbody = {};
        try { cbody = JSON.parse(event.body || "{}"); } catch(e) { return err({ error: "Invalid JSON" }); }
        if (!cbody.cmd) return err({ error: "cmd required" });
        setData("command_" + accountId, {
          account_id: accountId,
          cmd: cbody.cmd,
          params: cbody.params || {},
          executed: false,
          sent_at: new Date().toISOString()
        });
        return ok({ success: true, cmd: cbody.cmd });
      } else {
        var cdata = getData("command_" + accountId);
        if (!cdata || cdata.executed) return ok({ cmd: "NONE" });
        return ok(cdata);
      }
    }

    if (action === "ack") {
      if (!accountId) return err({ error: "account_id required" });
      var adata = getData("command_" + accountId);
      if (adata) {
        adata.executed = true;
        adata.executed_at = new Date().toISOString();
        setData("command_" + accountId, adata);
      }
      return ok({ success: true });
    }

    if (action === "settings") {
      if (!accountId) return err({ error: "account_id required" });
      if (event.httpMethod === "POST") {
        var sbody = {};
        try { sbody = JSON.parse(event.body || "{}"); } catch(e) { return err({ error: "Invalid JSON" }); }
        setData("settings_" + accountId, { account_id: accountId, settings: sbody, applied: false });
        return ok({ success: true });
      } else {
        var sdata = getData("settings_" + accountId);
        if (!sdata) return ok({ settings: null, applied: true });
        return ok(sdata);
      }
    }

    if (action === "settings_ack") {
      if (!accountId) return err({ error: "account_id required" });
      var sadata = getData("settings_" + accountId);
      if (sadata) { sadata.applied = true; setData("settings_" + accountId, sadata); }
      return ok({ success: true });
    }

    return ok({ name: "LP Algo Remote Control API", version: "2.0", status: "running", storage: "tmpfs", time: new Date().toISOString() });

  } catch(e) {
    return err({ error: "Server error: " + e.message }, 500);
  }
};
