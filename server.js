import express from "express";
import fs from "fs";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

// =========================================================
//  LOAD USERS FROM FILE
//  Format per line:
//  username|password|hwid|isadmin
// =========================================================
const USERS_FILE = "users.txt";

function loadUsers() {
    if (!fs.existsSync(USERS_FILE)) return [];
    const lines = fs.readFileSync(USERS_FILE, "utf8").split("\n");
    let users = [];

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        let parts = line.split("|");
        if (parts.length < 4) continue;

        users.push({
            username: parts[0],
            password: parts[1],
            hwid: parts[2],
            admin: parts[3] === "1"
        });
    }
    return users;
}

function saveUsers(users) {
    let out = users
        .map(u => `${u.username}|${u.password}|${u.hwid}|${u.admin ? "1" : "0"}`)
        .join("\n");
    fs.writeFileSync(USERS_FILE, out);
}

// =========================================================
//  LOGIN ROUTE
// =========================================================
app.post("/login", (req, res) => {
    let { username, password, hwid } = req.body;
    let users = loadUsers();

    let user = users.find(u => u.username === username);
    if (!user) return res.send("invalid");

    if (user.password !== password) return res.send("invalid");

    // HWID Lock
    if (user.hwid === "0") {
        // first login, bind hwid
        user.hwid = hwid;
        saveUsers(users);
    } else if (user.hwid !== hwid) {
        return res.send("hwid_mismatch");
    }

    return res.send(`success|${user.admin ? "admin" : "user"}`);
});

// =========================================================
//  ADMIN CHECK
// =========================================================
function checkAdmin(req, res) {
    let { admin_user, admin_pass } = req.body;
    let users = loadUsers();
    let u = users.find(x => x.username === admin_user);
    if (!u) return null;
    if (u.password !== admin_pass) return null;
    if (!u.admin) return null;
    return users;
}

// =========================================================
//  LIST USERS
// =========================================================
app.post("/admin/users", (req, res) => {
    let users = checkAdmin(req, res);
    if (!users) return res.send("invalid_admin");

    let out = users
        .map(u => `${u.username}|${u.password}|${u.hwid}|${u.admin ? "1" : "0"}`)
        .join("\n");

    res.send(out);
});

// =========================================================
//  SAVE USER (ADD/UPDATE)
// =========================================================
app.post("/admin/save_user", (req, res) => {
    let users = checkAdmin(req, res);
    if (!users) return res.send("invalid_admin");

    let { username, password, hwid, is_admin } = req.body;

    let u = users.find(x => x.username === username);

    if (u) {
        // update
        u.password = password;
        u.hwid = hwid;
        u.admin = is_admin === "1";
    } else {
        // add new
        users.push({
            username,
            password,
            hwid,
            admin: is_admin === "1"
        });
    }

    saveUsers(users);
    res.send("success");
});

// =========================================================
//  DELETE USER
// =========================================================
app.post("/admin/delete_user", (req, res) => {
    let users = checkAdmin(req, res);
    if (!users) return res.send("invalid_admin");

    let { username } = req.body;

    if (username === "admin") return res.send("cannot_delete_main_admin");

    users = users.filter(u => u.username !== username);

    saveUsers(users);
    res.send("success");
});

// =========================================================
//  RESET HWID
// =========================================================
app.post("/admin/reset_hwid", (req, res) => {
    let users = checkAdmin(req, res);
    if (!users) return res.send("invalid_admin");

    let { username } = req.body;

    let u = users.find(x => x.username === username);
    if (!u) return res.send("not_found");

    u.hwid = "0";
    saveUsers(users);

    res.send("success");
});

// =========================================================
//  SERVER START
// =========================================================
app.listen(3000, () => {
    console.log("GLOM API running on port 3000");
});
