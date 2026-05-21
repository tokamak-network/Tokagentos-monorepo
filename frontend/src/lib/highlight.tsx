import { Fragment } from "react";

type Token = {
  type: "plain" | "key" | "str" | "com" | "fn" | "num" | "prop";
  text: string;
};

const KEYWORDS = new Set([
  "import",
  "from",
  "export",
  "default",
  "const",
  "let",
  "var",
  "async",
  "await",
  "return",
  "true",
  "false",
  "null",
  "undefined",
  "new",
  "class",
  "function",
  "if",
  "else",
  "for",
  "while",
  "type",
  "interface",
]);

// Tokens are matched in declaration order; the first match wins.
const TOKEN_RE =
  /(\/\/[^\n]*)|('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)|(\b0x[0-9a-fA-F]+\b|\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_$][A-Za-z0-9_$]*\b(?=\())|(\b[A-Za-z_$][A-Za-z0-9_$]*\b)/g;

function tokenize(code: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  let m: RegExpExecArray | null = TOKEN_RE.exec(code);
  while (m !== null) {
    if (m.index > last) {
      out.push({ type: "plain", text: code.slice(last, m.index) });
    }
    if (m[1]) out.push({ type: "com", text: m[0] });
    else if (m[2]) out.push({ type: "str", text: m[0] });
    else if (m[3]) out.push({ type: "num", text: m[0] });
    else if (m[4]) out.push({ type: "fn", text: m[0] });
    else if (m[5]) {
      out.push({
        type: KEYWORDS.has(m[5]) ? "key" : "plain",
        text: m[0],
      });
    }
    last = m.index + m[0].length;
    m = TOKEN_RE.exec(code);
  }
  if (last < code.length) {
    out.push({ type: "plain", text: code.slice(last) });
  }
  return out;
}

export function Highlighted({ code }: { code: string }) {
  const tokens = tokenize(code);
  return (
    <>
      {tokens.map((t, i) => {
        // Token positions in a static code string are stable across renders;
        // composite key disambiguates duplicate tokens.
        const key = `${i}-${t.type}-${t.text.slice(0, 8)}`;
        return t.type === "plain" ? (
          <Fragment key={key}>{t.text}</Fragment>
        ) : (
          <span key={key} className={`tk-${t.type}`}>
            {t.text}
          </span>
        );
      })}
    </>
  );
}
