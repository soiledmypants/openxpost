export type TokenType = "text" | "kw" | "str" | "cm" | "num";

type Token = { type: TokenType; value: string };

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function langOf(path: string): string {
  const name = path.split("/").pop() ?? "";
  if (name === ".gitignore") return "text";
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1) : "";
  if (ext === "ts" || ext === "js") return "ts";
  if (ext === "css") return "css";
  if (ext === "html" || ext === "svg") return "html";
  if (ext === "json") return "json";
  if (ext === "md") return "md";
  return "text";
}

const TS_RE =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:abstract|as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|false|finally|for|from|function|if|implements|import|in|instanceof|interface|let|new|null|of|private|protected|public|return|static|super|switch|this|throw|true|try|type|typeof|undefined|var|void|while|with|yield)\b)/g;

const CSS_RE =
  /(\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[0-9a-fA-F]{3,8}\b|\b(?:[0-9]*\.?[0-9]+)(?:px|em|rem|vh|vw|%|ms|s)?\b)/g;

const HTML_RE = /(<!--[\s\S]*?-->|<[^>]+>)/g;

const JSON_RE =
  /("(?:\\.|[^"\\])*")\s*(:)?|(\btrue\b|\bfalse\b|\bnull\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

const MD_RE = /(^#{1,6} .+$|`[^`]+`|\*\*[^*]+\*\*)/gm;

function pushSplit(tokens: Token[], re: RegExp, code: string, kind: (match: RegExpExecArray) => Token): void {
  re.lastIndex = 0;
  let last = 0;
  let match = re.exec(code);
  while (match) {
    if (match.index > last) {
      tokens.push({ type: "text", value: code.slice(last, match.index) });
    }
    tokens.push(kind(match));
    last = match.index + match[0].length;
    if (match[0].length === 0) re.lastIndex += 1;
    match = re.exec(code);
  }
  if (last < code.length) {
    tokens.push({ type: "text", value: code.slice(last) });
  }
}

function tokenize(path: string, code: string): Token[] {
  const lang = langOf(path);
  const tokens: Token[] = [];

  if (lang === "ts") {
    pushSplit(tokens, TS_RE, code, (match) => {
      const value = match[0];
      if (value.startsWith("//") || value.startsWith("/*")) return { type: "cm", value };
      if (value.startsWith("\"") || value.startsWith("'") || value.startsWith("`")) {
        return { type: "str", value };
      }
      return { type: "kw", value };
    });
    return tokens;
  }

  if (lang === "css") {
    pushSplit(tokens, CSS_RE, code, (match) => {
      const value = match[0];
      if (value.startsWith("/*")) return { type: "cm", value };
      if (value.startsWith("\"") || value.startsWith("'")) return { type: "str", value };
      return { type: "num", value };
    });
    return tokens;
  }

  if (lang === "html") {
    pushSplit(tokens, HTML_RE, code, (match) => {
      const value = match[0];
      if (value.startsWith("<!--")) return { type: "cm", value };
      return { type: "kw", value };
    });
    return tokens;
  }

  if (lang === "json") {
    pushSplit(tokens, JSON_RE, code, (match) => {
      if (match[1] !== undefined) return { type: match[2] ? "kw" : "str", value: match[0] };
      if (match[3] !== undefined) return { type: "kw", value: match[0] };
      return { type: "num", value: match[0] };
    });
    return tokens;
  }

  if (lang === "md") {
    pushSplit(tokens, MD_RE, code, (match) => {
      const value = match[0];
      if (value.startsWith("#")) return { type: "kw", value };
      if (value.startsWith("`")) return { type: "str", value };
      return { type: "kw", value };
    });
    return tokens;
  }

  return [{ type: "text", value: code }];
}

export function highlight(path: string, code: string): string {
  return tokenize(path, code)
    .map((token) => {
      const body = esc(token.value);
      if (token.type === "text") return body;
      return `<span class="t-${token.type}">${body}</span>`;
    })
    .join("");
}

export function lineCount(code: string): number {
  if (code.length === 0) return 1;
  return code.split("\n").length;
}
