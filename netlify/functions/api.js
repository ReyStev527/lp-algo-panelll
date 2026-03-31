var fs = require("fs");
var path = require("path");

var DATA_DIR = "/tmp/ea-data";
var API_SECRET = "LP_ALGO_2025_SECRET_KEY";
var ALLOWED_ACCOUNTS = [159956643, 204122585];

var CACHE = {};

function ensureDir() {
  try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e) {}
}

function setData(key, val) {
  CACHE[key] = val;
  try { ensureDir(); fs.writeFileSync(path.join(DATA_DIR, key + ".json"), JSON.stringify(val)); } catch(e) {}
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
  for (var i = 0; i < ALLOWED_ACCOUNTS.length; i++) {
    if (ALLOWED_ACCOUNTS[i] > 0 && ALLOWED_ACCOUNTS[i] === num) return true;
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
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: H, body: "{}" };

  var p = event.queryStringParameters || {};
  var action = p.action || "";
  var acc = p.account_id || "";
  var key = p.api_key || "";

  if (key !== API_SECRET) return { statusCode: 403, headers: H, body: JSON.stringify({ error: "Invalid API key" }) };

  function ok(d) { return { statusCode: 200, headers: H, body: JSON.stringify(d) }; }
  function fail(d, c) { return { statusCode: c || 400, headers: H, body: JSON.stringify(d) }; }

  try {
    if (action === "login") {
      if (!acc) return fail({ error: "account_id required" });
      if (!isAllowed(acc)) return fail({ error: "Account not authorized" }, 403);
      return ok({ success: true, account_id: acc, message: "Login berhasil" });
    }

    if (action === "status") {
      if (!acc) return fail({ error: "account_id required" });
      if (event.httpMethod === "POST") {
        var body = {};
        try { body = JSON.parse(event.body || "{}"); } catch(e) { return fail({ error: "Invalid JSON" }); }
        setData("status_" + acc, { account_id: acc, ea_online: true, data: body, updated_at: new Date().toISOString() });
        var cmd = getData("command_" + acc);
        var cr = { cmd: "NONE" };
        if (cmd && !cmd.executed) {
          cr = { cmd: cmd.cmd, params: cmd.params || {} };
          cmd.executed = true;
          setData("command_" + acc, cmd);
        }
        return ok({ success: true, pending_cmd: cr });
      } else {
        var data = getData("status_" + acc);
        if (!data) return ok({ account_id: acc, ea_online: false, data: null });
        var age = Date.now() - new Date(data.updated_at || "2000-01-01").getTime();
        data.ea_online = age < 60000;
        return ok(data);
      }
    }

    if (action === "command") {
      if (!acc) return fail({ error: "account_id required" });
      if (event.httpMethod === "POST") {
        var cb = {};
        try { cb = JSON.parse(event.body || "{}"); } catch(e) { return fail({ error: "Invalid JSON" }); }
        if (!cb.cmd) return fail({ error: "cmd required" });
        setData("command_" + acc, { account_id: acc, cmd: cb.cmd, params: cb.params || {}, executed: false, sent_at: new Date().toISOString() });
        return ok({ success: true, cmd: cb.cmd });
      } else {
        var cd = getData("command_" + acc);
        if (!cd || cd.executed) return ok({ cmd: "NONE" });
        return ok(cd);
      }
    }

    if (action === "ack") {
      if (!acc) return fail({ error: "account_id required" });
      var ad = getData("command_" + acc);
      if (ad) { ad.executed = true; setData("command_" + acc, ad); }
      return ok({ success: true });
    }

    if (action === "settings") {
      if (!acc) return fail({ error: "account_id required" });
      if (event.httpMethod === "POST") {
        var sb = {};
        try { sb = JSON.parse(event.body || "{}"); } catch(e) { return fail({ error: "Invalid JSON" }); }
        setData("settings_" + acc, { account_id: acc, settings: sb, applied: false });
        return ok({ success: true });
      } else {
        var sd = getData("settings_" + acc);
        if (!sd) return ok({ settings: null, applied: true });
        return ok(sd);
      }
    }

    if (action === "settings_ack") {
      if (!acc) return fail({ error: "account_id required" });
      var sa = getData("settings_" + acc);
      if (sa) { sa.applied = true; setData("settings_" + acc, sa); }
      return ok({ success: true });
    }

    return ok({ name: "LP Algo Remote Control API", version: "4.0", status: "running", time: new Date().toISOString() });
  } catch(e) {
    return fail({ error: "Error: " + e.message }, 500);
  }
};
