/* ============================================================
   PUSEWU Member Portal — API client
   Talks to the backend REST API. Auth via JWT stored in
   sessionStorage. Same PUSEWU.* namespace the pages use.
   ============================================================ */
(function () {
  "use strict";

  // API base: same origin as the served frontend, under /api.
  // Override by setting window.PUSEWU_API_BASE before this script loads.
  const API = (window.PUSEWU_API_BASE || "/api").replace(/\/$/, "");
  const K_TOKEN = "pusewu_token";
  const K_USER = "pusewu_user";

  const ROLES = {
    member:  { label: "Member",               home: "dashboard.html" },
    officer: { label: "Membership Officer",    home: "admin.html" },
    finance: { label: "Finance Officer",       home: "finance.html" },
    rep:     { label: "Branch Representative", home: "branch.html" },
    admin:   { label: "System Administrator",  home: "users.html" },
    exec:    { label: "Executive",             home: "executive.html" },
  };

  /* ---- token / session ---- */
  function setSession(token, user) {
    sessionStorage.setItem(K_TOKEN, token);
    sessionStorage.setItem(K_USER, JSON.stringify(user));
  }
  function token() { return sessionStorage.getItem(K_TOKEN); }
  function getUser() { try { return JSON.parse(sessionStorage.getItem(K_USER)); } catch (e) { return null; } }
  function clearSession() { sessionStorage.removeItem(K_TOKEN); sessionStorage.removeItem(K_USER); }

  /* ---- low-level fetch ---- */
  async function api(path, { method = "GET", body, auth = true } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (auth && token()) headers.Authorization = "Bearer " + token();
    let res;
    try {
      res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      throw new Error("Cannot reach the server. Please check your connection and try again.");
    }
    if (res.status === 401 && auth) {
      clearSession();
      if (!location.pathname.endsWith("login.html")) location.href = "login.html";
      throw new Error("Your session has expired. Please sign in again.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed.");
    return data;
  }

  /* ---- auth ---- */
  async function login(email, password) {
    const data = await api("/auth/login", { method: "POST", auth: false, body: { email, password } });
    setSession(data.token, data.user);
    return { ok: true, role: data.user.role, home: (ROLES[data.user.role] || {}).home || "dashboard.html" };
  }
  function logout() { clearSession(); }
  function doLogout() { clearSession(); location.href = "login.html"; }

  function requireRole(...roles) {
    const u = getUser();
    if (!u || !token() || (roles.length && !roles.includes(u.role))) {
      location.href = "login.html";
      return null;
    }
    return u;
  }
  function requireMember() { return requireRole("member"); }

  /* ---- applications ---- */
  function submitApplication(data) { return api("/applications", { method: "POST", auth: false, body: data }); }
  function listApplications() { return api("/applications"); }
  function approveApplication(id) { return api("/applications/" + id + "/approve", { method: "POST" }); }
  function rejectApplication(id) { return api("/applications/" + id + "/reject", { method: "POST" }); }

  /* ---- member ---- */
  function myDashboard() { return api("/members/me"); }
  function updateProfile(patch) { return api("/members/me", { method: "PATCH", body: patch }); }
  function myCases() { return api("/members/me/cases"); }
  function lodgeCase(type, detail) { return api("/members/me/cases", { method: "POST", body: { type, detail } }); }
  function myLoans() { return api("/members/me/loans"); }
  function applyLoan(amount, term, purpose) { return api("/members/me/loans", { method: "POST", body: { amount, term, purpose } }); }
  function myWelfare() { return api("/members/me/welfare"); }
  function fileClaim(relationship, deceasedName) { return api("/members/me/welfare", { method: "POST", body: { relationship, deceasedName } }); }
  function trainings() { return api("/members/trainings"); }
  function rsvp(id) { return api("/members/trainings/" + id + "/rsvp", { method: "POST" }); }
  function caseLibrary() { return api("/members/case-library"); }

  /* ---- finance ---- */
  function getSettings() { return api("/finance/settings"); }
  function saveSettings(s) { return api("/finance/settings", { method: "PUT", body: s }); }
  function pmec() { return api("/finance/pmec"); }
  function fund() { return api("/finance/fund"); }

  /* ---- admin ---- */
  function listUsers() { return api("/admin/users"); }
  function addUser(u) { return api("/admin/users", { method: "POST", body: u }); }
  function setUserRole(id, role) { return api("/admin/users/" + id + "/role", { method: "PATCH", body: { role } }); }
  function removeUser(id) { return api("/admin/users/" + id, { method: "DELETE" }); }
  function branch() { return api("/admin/branch"); }
  function executive() { return api("/admin/executive"); }

  /* ---- formatting helpers ---- */
  let _currency = "K";
  function setCurrency(c) { if (c) _currency = c; }
  function money(n) {
    if (n === null || n === undefined || n === "") return "—";
    return _currency + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function pct(n) {
    if (n === null || n === undefined || n === "") return "—";
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }) + "%";
  }

  /* ---- shared chrome ---- */
  const icon = {
    dash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    savings:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    sub:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
    case:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4h16v12H7l-3 3V4z"/><path d="M8 9h8M8 12h5"/></svg>',
    lib:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 19V5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2z"/><path d="M8 7h8M8 11h6"/></svg>',
    loan:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5a2.5 2 0 0 1 5 0c0 2.5-5 1.5-5 4a2.5 2 0 0 0 5 0"/></svg>',
    welfare:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 21s-7-4.6-9.5-9C.9 8.4 2.9 4.5 6.5 4.5c2 0 3.6 1.1 5.5 3 1.9-1.9 3.5-3 5.5-3 3.6 0 5.6 3.9 4 7.5C19 16.4 12 21 12 21z"/></svg>',
    train:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1 3 3 6 3s6-2 6-3v-5"/></svg>',
    profile:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></svg>',
    members:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-5 7-5"/><circle cx="17" cy="9" r="3"/><path d="M14 20c0-3 2.5-4.5 6-4.5"/></svg>',
    money:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>',
    chart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="7"/><rect x="12" y="6" width="3" height="11"/><rect x="17" y="13" width="3" height="4"/></svg>',
    branch:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>',
  };
  function link(href, ic, label, active, cur) { return `<a href="${href}" class="${active === cur ? "active" : ""}">${icon[ic]}<span>${label}</span></a>`; }
  function navFor(role, a) {
    switch (role) {
      case "member": return `<div class="navsec">My membership</div>
        ${link("dashboard.html","dash","Dashboard",a,"dashboard")}
        ${link("savings.html","savings","Retirement Savings",a,"savings")}
        ${link("subscription.html","sub","My Subscription",a,"subscription")}
        <div class="navsec">Support</div>
        ${link("cases.html","case","My Issues",a,"cases")}
        ${link("library.html","lib","Case Library",a,"library")}
        ${link("loans.html","loan","Soft Loans",a,"loans")}
        ${link("welfare.html","welfare","Welfare / Funeral",a,"welfare")}
        ${link("training.html","train","Training & Events",a,"training")}
        <div class="navsec">Account</div>
        ${link("profile.html","profile","My Profile",a,"profile")}`;
      case "officer": return `<div class="navsec">Membership Office</div>
        ${link("admin.html","members","Applications",a,"admin")}
        ${link("library.html","lib","Case Library",a,"library")}`;
      case "finance": return `<div class="navsec">Finance Office</div>
        ${link("finance.html","money","Deduction Settings",a,"finance")}`;
      case "rep": return `<div class="navsec">Branch</div>
        ${link("branch.html","branch","My Branch",a,"branch")}`;
      case "admin": return `<div class="navsec">Administration</div>
        ${link("users.html","members","Users & Roles",a,"users")}`;
      case "exec": return `<div class="navsec">Executive</div>
        ${link("executive.html","chart","Oversight Dashboard",a,"executive")}`;
      default: return "";
    }
  }
  function renderChrome(active) {
    const u = getUser() || { firstName: "User", surname: "", role: "member" };
    const roleLabel = (ROLES[u.role] || {}).label || "";
    const initials = ((u.firstName || "U")[0] || "U") + ((u.surname || "")[0] || "");
    const header = document.getElementById("appHeader");
    if (header) {
      header.innerHTML = `<div class="bar">
        <button class="app-menu-btn" aria-label="Menu" onclick="PUSEWU.toggleNav()">☰</button>
        <a class="brand" href="../index.html" style="text-decoration:none">
          <img src="../img/pusewu-logo.png" alt="PUSEWU"><span class="name">PUSEWU<small>${roleLabel || "Portal"}</small></span>
        </a>
        <div class="spacer"></div>
        <div class="app-user"><div class="avatar">${initials.toUpperCase()}</div>
          <span>${(u.firstName || "") + " " + (u.surname || "")}</span>
          <button class="linkbtn" onclick="PUSEWU.doLogout()">Log out</button></div>
      </div>`;
    }
    const nav = document.getElementById("appNav");
    if (nav) nav.innerHTML = navFor(u.role, active);
  }
  function toggleNav() { const n = document.getElementById("appNav"); if (n) n.classList.toggle("open"); }
  function showError(el, err) {
    if (!el) return;
    el.innerHTML = `<div class="notice warn" style="margin:1rem 0">${(err && err.message) || "Something went wrong."}</div>`;
  }

  window.PUSEWU = {
    ROLES, API_BASE: API,
    login, logout, doLogout, getUser, token, requireRole, requireMember,
    submitApplication, listApplications, approveApplication, rejectApplication,
    myDashboard, updateProfile, myCases, lodgeCase, myLoans, applyLoan,
    myWelfare, fileClaim, trainings, rsvp, caseLibrary,
    getSettings, saveSettings, pmec, fund,
    listUsers, addUser, setUserRole, removeUser, branch, executive,
    renderChrome, toggleNav, money, pct, setCurrency, showError,
  };
})();
