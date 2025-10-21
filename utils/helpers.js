const slugify = require("slugify");
const Tenant = require("../models/Tenant");

const genCode     = () => Math.floor(100000 + Math.random()*900000).toString();
const clean       = (s) => String(s||"").trim();
const cleanEmail  = (s) => clean(s).toLowerCase();
const isEmail     = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail(s));

function makeSlugBase(name) {
  const raw = String(name || '').trim();
  let s = slugify(raw, { lower: true, strict: true, locale: 'he' });
  if (!s) {
    const ascii = raw.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
    s = ascii || `biz-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
  }
  return s.slice(0, 64);
}
async function uniqueTenantSlug(name) {
  const base = makeSlugBase(name);
  let slug = base;
  let i = 1;
  while (await Tenant.exists({ slug })) { slug = `${base}-${i++}`; }
  return slug;
}

module.exports = { genCode, clean, cleanEmail, isEmail, makeSlugBase, uniqueTenantSlug };
