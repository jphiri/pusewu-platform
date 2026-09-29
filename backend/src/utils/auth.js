"use strict";
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || "12", 10);
const SECRET = process.env.JWT_SECRET || "insecure_dev_secret_change_me";
const EXPIRES = process.env.JWT_EXPIRES_IN || "8h";

async function hashPassword(plain) {
  return bcrypt.hash(plain, ROUNDS);
}
async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}
function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    SECRET,
    { expiresIn: EXPIRES }
  );
}
function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };
