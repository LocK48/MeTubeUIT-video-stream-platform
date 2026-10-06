import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { UserService } from "../service/userService.js";
import vietnix from "../config/storage.js";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
  validateEmail,
  validatePassword,
  validateName,
} from "../util/validation.js";
import { sendEmail } from "../util/mailer.js";
import { generateOtpEmail } from "../util/emailTemplates/otpTemplate.js";

// simple in-memory OTP store: email -> { code, expiresAt, name, passwordHash }
const otpStore = new Map();

const JWT_SECRET = process.env.JWT_SECRET || "metube_secret_key";

// =======================
// REGISTER
// =======================
export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const nameValidation = validateName(name);
    if (!nameValidation.valid) {
      return res.status(400).json({ message: nameValidation.message });
    }

    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return res.status(400).json({ message: emailValidation.message });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ message: passwordValidation.message });
    }

    const existingUser = await UserService.getByEmail(email.toLowerCase());
    if (existingUser) {
      return res.status(409).json({ message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await UserService.createUser({
      name: name.trim(),
      email: email.toLowerCase(),
      passwordHash: hashedPassword,
      role: "user",
    });

    return res.status(201).json({
      message: "Register success",
    });
  } catch (err) {
    return res.status(500).json({
      message: "Register failed",
      error: err.message,
    });
  }
};

// Send OTP to email and store pending registration
export const registerRequest = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const nameValidation = validateName(name);
    if (!nameValidation.valid) {
      return res.status(400).json({ message: nameValidation.message });
    }

    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return res.status(400).json({ message: emailValidation.message });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ message: passwordValidation.message });
    }

    const existingUser = await UserService.getByEmail(email.toLowerCase());
    if (existingUser) {
      return res.status(409).json({ message: "Email already exists" });
    }

    // generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    const hashedPassword = await bcrypt.hash(password, 10);

    otpStore.set(email.toLowerCase(), { code, expiresAt, name: name.trim(), passwordHash: hashedPassword });

    // send email
    console.log(`Generated OTP for ${email}: ${code}`);
    try {
      const html = generateOtpEmail({ name: name.trim(), code, expireMinutes: 10, appName: process.env.APP_NAME || 'Metube' });
      await sendEmail(email, 'Your Metube verification code', `Your verification code is: ${code}. It expires in 10 minutes.`, html);
    } catch (err) {
      console.error('Failed to send OTP email', err.message);
    }

    return res.status(200).json({ message: 'OTP sent to email' });
  } catch (err) {
    return res.status(500).json({ message: 'Failed', error: err.message });
  }
};

export const registerVerify = async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ message: 'Email and code required' });

    const entry = otpStore.get(email.toLowerCase());
    if (!entry) return res.status(400).json({ message: 'No pending registration for this email' });
    if (Date.now() > entry.expiresAt) {
      otpStore.delete(email.toLowerCase());
      return res.status(400).json({ message: 'Code expired' });
    }
    if (entry.code !== String(code).trim()) return res.status(400).json({ message: 'Invalid code' });

    // create user
    const created = await UserService.createUser({ name: entry.name, email: email.toLowerCase(), passwordHash: entry.passwordHash, role: 'user' });
    otpStore.delete(email.toLowerCase());

    // auto-login: issue JWT cookie for the newly created user
    const payload = {
      id: created._id.toString(),
      email: created.email,
      name: created.name,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });
    res.cookie('metube_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000 });

    const safeUser = {
      id: created._id.toString(),
      email: created.email,
      name: created.name,
      avatarUrl: created.avatarUrl || created.avatar || null,
    };

    return res.status(201).json({ message: 'Account verified and logged in', user: safeUser });
  } catch (err) {
    return res.status(500).json({ message: 'Verify failed', error: err.message });
  }
};

// =======================
// LOGIN (JWT ONLY)
// =======================
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password required",
      });
    }

    const user = await UserService.getByEmail(email.toLowerCase());

    if (!user) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    const payload = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: "1d",
    });

    res.cookie("metube_token", token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    });

    // Return sanitized user (include avatarUrl)
    const safeUser = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl || user.avatar || null,
    };

    return res.status(200).json({
      message: "Login success",
      user: safeUser,
    });
  } catch (err) {
    return res.status(500).json({
      message: "Login failed",
      error: err.message,
    });
  }
};

// =======================
// LOGOUT (JWT ONLY)
// =======================
export const logout = (req, res) => {
  res.clearCookie("metube_token", {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
  });

  return res.status(200).json({
    message: "Logout success",
  });
};

// =======================
// GET PROFILE (JWT ONLY)
// =======================
export const getProfile = async (req, res) => {
  try {
    const token = req.cookies?.metube_token;

    if (!token) {
      return res.status(401).json({
        message: "Not authenticated",
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    // Fetch fresh user data from DB to reflect latest avatarUrl and other updates
    const userData = await UserService.getUserById(decoded.id);
    if (!userData) {
      return res.status(404).json({ message: "User not found" });
    }

    const safeUser = {
      id: userData._id.toString(),
      email: userData.email,
      name: userData.name,
      avatarUrl: userData.avatarUrl || userData.avatar || null,
    };

    return res.status(200).json({
      user: safeUser,
    });
  } catch (err) {
    return res.status(401).json({
      message: "Invalid token",
    });
  }
};

// =======================
// CHANGE PASSWORD (JWT ONLY)
// =======================
export const changePassword = async (req, res) => {
  try {
    const token = req.cookies?.metube_token;

    if (!token) {
      return res.status(401).json({
        message: "Not authenticated",
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const { oldPassword, newPassword } = req.body;

    const userData = await UserService.getUserById(decoded.id);

    if (!userData) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const isValid = await bcrypt.compare(oldPassword, userData.passwordHash);

    if (!isValid) {
      return res.status(401).json({
        message: "Old password incorrect",
      });
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await UserService.updatePassword(decoded.id, hashed);

    return res.status(200).json({
      message: "Password changed successfully",
    });
  } catch (err) {
    return res.status(500).json({
      message: "Change password failed",
      error: err.message,
    });
  }
};

// =======================
// CHANGE AVATAR
// =======================
export const changeAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        message: "Invalid file type.",
      });
    }

    // Upload to the configured S3-compatible object storage.
    const bucket = process.env.BUCKET_ASSET;
    const userId = req.user.id;

    // determine extension from mimetype
    const ext = req.file.mimetype === "image/png" ? "png" : req.file.mimetype === "image/webp" ? "webp" : "jpg";
    const key = `asset/avatar/${userId}/avatar.${ext}`;
    const publicBase = (process.env.PUBLIC_ASSET_URL || "").replace(/\/+$/, "");
    const endpoint = process.env.ENDPOINT || "";
    if (endpoint.includes(".r2.cloudflarestorage.com") && !publicBase) {
      throw new Error("Set PUBLIC_ASSET_URL to the public R2 domain for the asset bucket");
    }
    const avatarUrl = publicBase
      ? `${publicBase}/${key}`
      : `${endpoint.replace(/\/+$/, "")}/${bucket}/${key}`;

    const putParams = {
      Bucket: bucket,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    };

    await vietnix.send(new PutObjectCommand(putParams));

    const updatedUser = await UserService.updateAvatar(req.user.id, avatarUrl);

    const safeUser = {
      id: updatedUser._id.toString(),
      email: updatedUser.email,
      name: updatedUser.name,
      avatarUrl: updatedUser.avatarUrl || updatedUser.avatar || null,
    };

    return res.status(200).json({
      message: "Avatar updated successfully",
      avatarUrl: avatarUrl,
      user: safeUser,
    });
  } 
  catch (err) {
    console.error(err.message);
    return res.status(500).json({
      message: "Change avatar failed",
      error: err.message,
    });
  }
};

export const subscribeChannel = async (req, res) => {
  try {
    const userId = req.user.id;
    const { channelId } = req.params;
    if (!channelId) return res.status(400).json({ message: 'Missing channelId' });
    const { UserModel } = await import('../model/userModel.js');
    await UserModel.subscribe(userId, channelId);
    return res.status(200).json({ message: 'Subscribed' });
  } catch (e) {
    console.error('Subscribe failed', e);
    return res.status(500).json({ message: 'Subscribe failed' });
  }
};

export const unsubscribeChannel = async (req, res) => {
  try {
    const userId = req.user.id;
    const { channelId } = req.params;
    if (!channelId) return res.status(400).json({ message: 'Missing channelId' });
    const { UserModel } = await import('../model/userModel.js');
    await UserModel.unsubscribe(userId, channelId);
    return res.status(200).json({ message: 'Unsubscribed' });
  } catch (e) {
    console.error('Unsubscribe failed', e);
    return res.status(500).json({ message: 'Unsubscribe failed' });
  }
};

export const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { NotificationModel } = await import('../model/notificationModel.js');
    const notes = await NotificationModel.findByUserId(userId);
    return res.status(200).json({ notifications: notes });
  } catch (e) {
    console.error('Get notifications failed', e);
    return res.status(500).json({ message: 'Get notifications failed' });
  }
};

export const markNotificationRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'Missing notification id' });
    const { NotificationModel } = await import('../model/notificationModel.js');
    // Optionally verify ownership
    await NotificationModel.markRead(id);
    return res.status(200).json({ message: 'Marked read' });
  } catch (e) {
    console.error('Mark notification failed', e);
    return res.status(500).json({ message: 'Mark notification failed' });
  }
};

export const getUserPublic = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'Missing id' });
    const user = await UserService.getUserById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.status(200).json({ user: { id: user._id.toString(), name: user.name, avatarUrl: user.avatarUrl || user.avatar || null } });
  } catch (e) {
    console.error('Get user public failed', e);
    return res.status(500).json({ message: 'Get user public failed' });
  }
};
