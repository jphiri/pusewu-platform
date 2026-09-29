"use strict";
// Short human-readable reference codes, e.g. APP-5731, GRV-1042, LN-482, WLF-119
function ref(prefix, min, max) {
  const n = Math.floor(min + Math.random() * (max - min));
  return `${prefix}-${n}`;
}
module.exports = {
  appRef: () => ref("APP", 5000, 9000),
  caseRef: () => ref("GRV", 1000, 9999),
  loanRef: () => ref("LN", 100, 999),
  welfareRef: () => ref("WLF", 100, 999),
  memberNo: () => `PSW-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 89999)}`,
};
