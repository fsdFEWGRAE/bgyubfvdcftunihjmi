import express from "express";
import mongoose from "mongoose";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// =========================================================
//  CONNECT TO MONGODB
// =========================================================
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000
}).then(() => {
    console.log("MongoDB Connected");
    ensureDefaultAdmin();
}).catch(err => {
    console.log("MongoDB Error:", err);
});

// =========================================================
//  USER MODEL
// =========================================================
const userSchema = new mongoose.Schema({
    username: String,
    password: String,
    hwid: { type: String, default: "0" },
    admin: { type: Boolean, default: false }
});

const User = mongoose.model("User", userSchema);

// =========================================================
//  CREATE DEFAULT ADMIN IF NONE EXISTS
// =========================================================
async function ensureDefaultAdmin() {
    const adminExists = await User.findOne({ admin: true });
    if (!adminExists) {
        await User.create({
            username: "admin",
            password: "GLOM-ADMIN",
            hwid: "0",
            admin: true
        });
        console.log("Default admin created.");
    }
}

// =========================================================
//  LOGIN (FOR GLOM TWEEK)
// =========================================================
app.post("/login", async (req, res) => {
    let { username, password, hwid } = req.body;

    const user = await User.findOne({ username });

    if (!user) return res.send("invalid");
    if (user.password !== password) return res.send("invalid");

    // HWID Lock
    if (user.hwid === "0") {
        user.hwid = hwid;
        await user.save();
    }
    else if (user.hwid !== hwid) {
        return res.send("hwid_mismatch");
    }

    // SUCCESS RESPONSE
    if (user.admin) {
        return res.send('{"status":"success","is_admin":true}');
    } else {
        return res.send('{"status":"success","is_admin":false}');
    }
});

// =========================================================
//  ADMIN CHECK
// =========================================================
async function checkAdmin(req) {
    let { admin_user, admin_pass } = req.body;

    const user = await User.findOne({
        username: admin_user,
        password: admin_pass,
        admin: true
    });

    return user ? true : false;
}

// =========================================================
//  ADMIN: LIST USERS
// =========================================================
app.post("/admin/users", async (req, res) => {
    if (!(await checkAdmin(req))) return res.send("invalid_admin");

    const users = await User.find({});
    let out = users
        .map(u => `${u.username}|${u.password}|${u.hwid}|${u.admin ? "1" : "0"}`)
        .join("\n");

    res.send(out);
});

// =========================================================
//  ADMIN: SAVE USER (ADD OR UPDATE)
// =========================================================
app.post("/admin/save_user", async (req, res) => {
    if (!(await checkAdmin(req))) return res.send("invalid_admin");

    let { username, password, hwid, is_admin } = req.body;

    let user = await User.findOne({ username });

    if (user) {
        user.password = password;
        user.hwid = hwid;
        user.admin = is_admin === "1";
        await user.save();
    } else {
        await User.create({
            username,
            password,
            hwid,
            admin: is_admin === "1"
        });
    }

    res.send("success");
});

// =========================================================
//  ADMIN: DELETE USER
// =========================================================
app.post("/admin/delete_user", async (req, res) => {
    if (!(await checkAdmin(req))) return res.send("invalid_admin");

    let { username } = req.body;

    if (username === "admin")
        return res.send("cannot_delete_main_admin");

    await User.deleteOne({ username });

    res.send("success");
});

// =========================================================
//  ADMIN: RESET HWID
// =========================================================
app.post("/admin/reset_hwid", async (req, res) => {
    if (!(await checkAdmin(req))) return res.send("invalid_admin");

    let { username } = req.body;

    const user = await User.findOne({ username });
    if (!user) return res.send("not_found");

    user.hwid = "0";
    await user.save();

    res.send("success");
});

// =========================================================
//  START SERVER
// =========================================================
app.listen(3000, () => {
    console.log("GLOM API running on port 3000");
});
