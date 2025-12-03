import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";

// =========================================================
//  BASIC APP SETUP
// =========================================================
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

// ممكن تخليها من متغير بيئة في Render
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://user:pass@cluster/dbname";

// =========================================================
//  MONGOOSE SETUP
// =========================================================
mongoose
  .connect(MONGO_URI, {
    // useNewUrlParser: true,
    // useUnifiedTopology: true,
  })
  .then(() => {
    console.log("✅ Connected to MongoDB");
    return ensureDefaultAdmin();
  })
  .then(() => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log("GLOM API running on port " + PORT);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
  });

// =========================================================
//  USER MODEL
//  username|password|hwid|isadmin
// =========================================================
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  hwid: { type: String, default: "0" }, // "0" = not bound
  admin: { type: Boolean, default: false },
});

const User = mongoose.model("User", userSchema);

// =========================================================
//  ENSURE DEFAULT ADMIN
//  أول تشغيل ينشئ أدمن: admin / GLOM-ADMIN
// =========================================================
async function ensureDefaultAdmin() {
  const count = await User.countDocuments({});
  if (count > 0) return;

  await User.create({
    username: "admin",
    password: "GLOM-ADMIN",
    hwid: "0",
    admin: true,
  });

  console.log("✅ Default admin created: admin / GLOM-ADMIN");
}

// =========================================================
//  LOGIN (HWID LOCK FOR ALL ACCOUNTS)
// =========================================================
app.post("/login", async (req, res) => {
  try {
    let { username, password, hwid } = req.body;
    if (!username || !password || !hwid) {
      return res.send("invalid");
    }

    let user = await User.findOne({ username: username });
    if (!user) return res.send("invalid"); // no user

    if (user.password !== password) return res.send("invalid"); // wrong pass

    // ====================================
    // HWID LOCK — applies to ALL accounts
    // ====================================
    if (user.hwid === "0") {
      // First login → bind HWID
      user.hwid = hwid;
      await user.save();
    } else if (user.hwid !== hwid) {
      return res.send("hwid_mismatch"); // different device
    }

    // ====================================
    // LOGIN SUCCESS
    // ====================================
    const isAdmin = user.admin ? "true" : "false";
    return res.send(`{"status":"success","is_admin":${isAdmin}}`);
  } catch (err) {
    console.error("Login error:", err);
    return res.send("invalid");
  }
});

// =========================================================
//  ADMIN CHECK (uses MongoDB)
// =========================================================
async function checkAdmin(req) {
  let { admin_user, admin_pass } = req.body;
  if (!admin_user || !admin_pass) return null;

  let u = await User.findOne({ username: admin_user });
  if (!u) return null;
  if (u.password !== admin_pass) return null;
  if (!u.admin) return null;

  return u; // نرجع الأدمن نفسه (لكن نستخدم الموديل للعمليات)
}

// =========================================================
//  ADMIN: LIST USERS
//  returns: username|password|hwid|isadmin per line
// =========================================================
app.post("/admin/users", async (req, res) => {
  try {
    let admin = await checkAdmin(req);
    if (!admin) return res.send("invalid_admin");

    let users = await User.find({});
    let out = users
      .map(
        (u) =>
          `${u.username}|${u.password}|${u.hwid}|${u.admin ? "1" : "0"}`
      )
      .join("\n");

    res.send(out);
  } catch (err) {
    console.error("/admin/users error:", err);
    res.send("error");
  }
});

// =========================================================
//  ADMIN: SAVE USER (ADD OR UPDATE)
// =========================================================
app.post("/admin/save_user", async (req, res) => {
  try {
    let admin = await checkAdmin(req);
    if (!admin) return res.send("invalid_admin");

    let { username, password, hwid, is_admin } = req.body;
    if (!username || !password) return res.send("invalid_data");

    let isAdminFlag = is_admin === "1";

    let user = await User.findOne({ username: username });

    if (user) {
      // update
      user.password = password;
      if (hwid !== undefined && hwid !== null && hwid !== "") {
        user.hwid = hwid;
      }
      user.admin = isAdminFlag;
      await user.save();
    } else {
      // create
      await User.create({
        username,
        password,
        hwid: hwid && hwid !== "" ? hwid : "0",
        admin: isAdminFlag,
      });
    }

    res.send("success");
  } catch (err) {
    console.error("/admin/save_user error:", err);
    res.send("error");
  }
});

// =========================================================
//  ADMIN: DELETE USER
// =========================================================
app.post("/admin/delete_user", async (req, res) => {
  try {
    let admin = await checkAdmin(req);
    if (!admin) return res.send("invalid_admin");

    let { username } = req.body;
    if (!username) return res.send("invalid_data");

    if (username === "admin") {
      return res.send("cannot_delete_main_admin");
    }

    await User.deleteOne({ username: username });

    res.send("success");
  } catch (err) {
    console.error("/admin/delete_user error:", err);
    res.send("error");
  }
});

// =========================================================
//  ADMIN: RESET HWID
// =========================================================
app.post("/admin/reset_hwid", async (req, res) => {
  try {
    let admin = await checkAdmin(req);
    if (!admin) return res.send("invalid_admin");

    let { username } = req.body;
    if (!username) return res.send("invalid_data");

    let user = await User.findOne({ username: username });
    if (!user) return res.send("not_found");

    user.hwid = "0";
    await user.save();

    res.send("success");
  } catch (err) {
    console.error("/admin/reset_hwid error:", err);
    res.send("error");
  }
});
