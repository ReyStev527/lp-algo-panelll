var fs = require("fs");
var path = require("path");

var DATA_DIR = "/tmp/ea-data";
var API_SECRET = "LP_ALGO_2025_SECRET_KEY";
var ALLOWED_ACCOUNTS = [159956643, 204122585];

// Global cache - persists between warm invocations on same instance
var CACHE = {};

function ensureDir() {
  try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e) {}
}

function setData(key, val) {
  CACHE[key] = val;
  try {
    ensureDir();
    fs.writeFileSync(path.join(DATA_DIR, key + ".json"), JSON.stringify(val));
  } catch(e) {}
}

function getData(key) {
  if (CACHE[key]) return CACHE[key];
  try {
    var file = path.join(DATA_DIR, key + ".json");
    if (!fs.existsSync(file)) return null;
    var data = JSON.parse(fs.readFileSync(file, "utf8"));
    CACHE[key] = data;
    return data;
  } catch(e) { return null; }
}

function isAllowed(id) {
  var num = parseInt(id);
  if (!num || num <= 0) return false;
  for (var i = 0; i < ALLOWED_ACCOUNTS.length; i++) {
    if (ALLOWED_ACCOUNTS[i] === num) return true;
  }
  return false;
}

exports.handler = async function(event) {
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

  function ok(data) { return { statusCode: 200, headers: H, body: JSON.stringify(data) }; }
  function err(data, code) { return { statusCode: code || 400, headers: H, body: JSON.stringify(data) }; }

  try {

    // ==================== LOGIN ====================
    if (action === "login") {
      if (!accountId) return err({ error: "account_id required" });
      if (!isAllowed(accountId)) return err({ error: "Account not authorized" }, 403);
      return ok({ success: true, account_id: accountId, message: "Login berhasil" });
    }

    // ==================== STATUS (EA POST + Panel GET) ====================
    if (action === "status") {
      if (!accountId) return err({ error: "account_id required" });

      if (event.httpMethod === "POST") {
        // EA kirim status → simpan + RETURN pending command
        var body = {};
        try { body = JSON.parse(event.body || "{}"); } catch(e) { return err({ error: "Invalid JSON" }); }
        
        setData("status_" + accountId, {
          account_id: accountId,
          ea_online: true,
          data: body,
          updated_at: new Date().toISOString()
        });

        // Cek apakah ada pending command → kirim balik ke EA
        var pendingCmd = getData("command_" + accountId);
        var cmdResponse = { cmd: "NONE" };
        if (pendingCmd && !pendingCmd.executed) {
          cmdResponse = { cmd: pendingCmd.cmd, params: pendingCmd.params || {} };
          // Mark as executed
          pendingCmd.executed = true;
          pendingCmd.executed_at = new Date().toISOString();
          setData("command_" + accountId, pendingCmd);
        }

        return ok({ success: true, pending_cmd: cmdResponse });
      
      } else {
        // Panel GET status
        var data = getData("status_" + accountId);
        if (!data) return ok({ account_id: accountId, ea_online: false, data: null });
        var age = Date.now() - new Date(data.updated_at || "2000-01-01").getTime();
        data.ea_online = age < 60000;
        return ok(data);
      }
    }

    // ==================== COMMAND (Panel POST + EA GET) ====================
    if (action === "command") {
      if (!accountId) return err({ error: "account_id required" });

      if (event.httpMethod === "POST") {
        // Panel kirim command
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
        // EA GET command (backup, primary delivery via status response)
        var cdata = getData("command_" + accountId);
        if (!cdata || cdata.executed) return ok({ cmd: "NONE" });
        return ok(cdata);
      }
    }

    // ==================== ACK ====================
    if (action === "ack") {
      if (!accountId) return err({ error: "account_id required" });
      var adata = getData("command_" + accountId);
      if (adata) {
        adata.executed = true;
        setData("command_" + accountId, adata);
      }
      return ok({ success: true });
    }

    // ==================== SETTINGS ====================
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

    // ==================== DEFAULT ====================
    return ok({ name: "LP Algo Remote Control API", version: "3.0", status: "running", time: new Date().toISOString() });

  } catch(e) {
    return err({ error: "Server error: " + e.message }, 500);
  }
};
