const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "users.json");

app.use(express.json());

function loadUsers() {
  if (!fs.existsSync(DATA_FILE)) {
    return { users: [] };
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to read users.json:", err);
    return { users: [] };
  }
}

function saveUsers(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (err) {
    console.error("Failed to write users.json:", err);
    return false;
  }
}

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "GLOM Auth API is running" });
});

app.post("/login", (req, res) => {
  const { username, password, hwid } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      code: "MISSING_FIELDS",
      message: "username and password are required"
    });
  }

  if (!hwid || typeof hwid !== "string" || hwid.trim().length === 0) {
    return res.status(400).json({
      success: false,
      code: "HWID_REQUIRED",
      message: "HWID is required"
    });
  }

  const data = loadUsers();
  const user = data.users.find(u => u.username === username);

  if (!user || user.password !== password) {
    return res.status(401).json({
      success: false,
      code: "INVALID_CREDENTIALS",
      message: "Invalid username or password"
    });
  }

  if (!user.hwid || user.hwid.trim().length === 0) {
    user.hwid = hwid;
    const ok = saveUsers(data);
    if (!ok) {
      return res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Failed to save HWID"
      });
    }

    return res.json({
      success: true,
      code: "HWID_REGISTERED",
      message: "First login on this account, HWID registered"
    });
  }

  if (user.hwid !== hwid) {
    return res.status(403).json({
      success: false,
      code: "HWID_MISMATCH",
      message: "This account is already bound to another device"
    });
  }

  return res.json({
    success: true,
    code: "OK",
    message: "Login successful"
  });
});

app.get("/", (req, res) => {
  res.json({
    name: "GLOM Auth API",
    status: "running",
    endpoints: {
      health: "/health",
      login: "/login"
    }
  });
});

app.listen(PORT, () => {
  console.log(`GLOM Auth API listening on port ${PORT}`);
});
