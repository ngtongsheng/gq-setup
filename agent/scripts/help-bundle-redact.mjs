// Secret redaction for the help bundle. Everything the bundle prints goes through redact().
// Patterns are deliberately greedy: a needless <REDACTED> costs nothing, a leaked key costs a rotation.

const SECRET_NAME = "(?:password|passwd|secret|token|api[_-]?key|private[_-]?key)";
const ENV_SECRET_NAME = "[A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|DSN|_URL)[A-Z0-9_]*";

const RULES = [
  // Supabase keys keep the prefix so Tong Sheng can tell which kind it was.
  [/\b(sb_(?:secret|publishable)_)[A-Za-z0-9_-]+/g, "$1<REDACTED>"],
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, "<REDACTED-JWT>"],
  [/\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,})/g, "<REDACTED-GITHUB-TOKEN>"],
  [/\bsk-[A-Za-z0-9_-]{20,}/g, "<REDACTED-API-KEY>"],
  // scheme://user:password@host
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@]*@/gi, "$1<REDACTED>@"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g, "Bearer <REDACTED>"],
  [/(authorization\\?["']?\s*[:=]\s*\\?["']?)(?:(?:Bearer|Basic|token)\s+)?[^\s"'\\]+/gi, "$1<REDACTED>"],
  // password: x, "token": "x", db_password=x. Quoted values may contain spaces.
  [
    new RegExp(`(${SECRET_NAME}[\\w.-]*\\\\?["']?\\s*[:=]\\s*)(?:\\\\?"[^"\\\\\\n]*|\\\\?'[^'\\\\\\n]*|[^\\s"',;\\\\]+)`, "gi"),
    "$1<REDACTED>",
  ],
  // FOO_KEY=value anywhere on a line
  [new RegExp(`(\\b${ENV_SECRET_NAME}=)[^\\s]+`, "g"), "$1<REDACTED>"],
  // Any other KEY=value line, the shape of every .env* file
  [/^([ \t]*(?:export[ \t]+)?[A-Za-z_][A-Za-z0-9_]*=).*$/gm, "$1<REDACTED>"],
];

export function redact(text) {
  return RULES.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text);
}
