import type { ProjectFile } from "@/types";

/**
 * In-browser preview for Koda's Computer.
 *
 * Two strategies, picked from the project shape:
 *  • Static site  → assemble index.html, inlining local CSS/JS, render in iframe.
 *  • React/Vite   → transpile every module with Babel-standalone INSIDE the
 *    iframe, wire relative imports through ES-module blob URLs, and resolve bare
 *    deps (react, etc.) from esm.sh. No bundler/server needed.
 *
 * Everything runs in a sandboxed iframe via `srcDoc`, so the generated app can
 * never touch the host page.
 */

function norm(path: string): string {
  return path.replace(/^\.?\/+/, "");
}

function ext(path: string): string {
  const i = path.lastIndexOf(".");
  return i >= 0 ? path.slice(i + 1).toLowerCase() : "";
}

function toMap(files: ProjectFile[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of files) map[norm(f.path)] = f.content;
  return map;
}

/** A project is "React" if it has JSX/TSX sources or a react dependency. */
export function isReactProject(files: ProjectFile[]): boolean {
  const map = toMap(files);
  if (Object.keys(map).some((p) => /\.(jsx|tsx)$/.test(p))) return true;
  const pkg = map["package.json"];
  if (pkg && /"react"\s*:/.test(pkg)) return true;
  // A bare index.html with no react → static.
  if (map["index.html"]) return false;
  // JS-only with imports of react?
  return Object.values(map).some((c) => /from\s+['"]react['"]/.test(c));
}

const RESET_CSS = `*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}#root,#app{min-height:100vh}`;

const ERROR_STYLE = `<style>.koda-err{position:fixed;inset:0;background:#1a1014;color:#ffb4b4;font:13px/1.5 ui-monospace,Menlo,monospace;padding:20px;white-space:pre-wrap;overflow:auto;z-index:99999}</style>`;

/**
 * Keeps the preview from escaping its iframe. The sandbox is same-origin (so
 * storage/router work), which means a placeholder link like href="/" would
 * otherwise navigate the frame to OUR app. This intercepts plain navigations:
 * external links open in a new tab; internal/dummy links are neutralized.
 * Framework routers (react-router) call preventDefault first, so they're left
 * alone (we run in the bubble phase and skip already-handled clicks).
 */
const NAV_GUARD = `
(function(){
  function isExternal(h){return h.indexOf('http://')===0||h.indexOf('https://')===0||h.indexOf('//')===0||h.indexOf('mailto:')===0||h.indexOf('tel:')===0;}
  document.addEventListener('click',function(e){
    if(e.defaultPrevented)return;
    var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;
    if(!a)return;
    var href=a.getAttribute('href')||'';
    if(!href||href.charAt(0)==='#')return;
    if(isExternal(href)){a.target='_blank';a.rel='noopener noreferrer';return;}
    e.preventDefault();
  },false);
  document.addEventListener('submit',function(e){if(!e.defaultPrevented)e.preventDefault();},false);
})();
`;

/** Pull the <body> markup out of an index.html, if present. */
function extractBody(html: string | undefined): string | null {
  if (!html) return null;
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!m) return null;
  // Drop module/script tags — the loader bootstraps the entry itself.
  return m[1].replace(/<script[\s\S]*?<\/script>/gi, "");
}

/** Guess the entry module for a React project. */
function pickEntry(map: Record<string, string>): string {
  const html = map["index.html"];
  if (html) {
    const m = html.match(/<script[^>]+src=["']([^"']+)["']/i);
    if (m) {
      const p = norm(m[1]);
      if (map[p]) return p;
    }
  }
  const candidates = [
    "src/main.jsx", "src/main.tsx", "src/index.jsx", "src/index.tsx",
    "src/main.js", "src/index.js", "main.jsx", "index.jsx", "App.jsx",
  ];
  for (const c of candidates) if (map[c]) return c;
  // Fallback: first jsx/tsx/js file.
  return (
    Object.keys(map).find((p) => /\.(jsx|tsx|js|ts)$/.test(p) && !/\.config\./.test(p)) ??
    Object.keys(map)[0] ??
    ""
  );
}

/**
 * The loader that runs INSIDE the iframe. Written as a plain string with no
 * backticks and no template-interpolation so it embeds verbatim. It receives
 * FILES (path→source), ENTRY (entry path), and uses the global Babel.
 */
// The loader runs INSIDE the iframe. It transpiles each local file with Babel,
// rewrites RELATIVE imports to ES-module blob URLs, and leaves BARE specifiers
// (react, react-dom, react-router, lucide-react, …) for the page's import map
// to resolve from esm.sh. This supports arbitrary npm dependencies while a
// pinned, ?external react keeps a single React instance.
const LOADER_BODY = `
function ext(p){var i=p.lastIndexOf('.');return i>=0?p.slice(i+1).toLowerCase():'';}
function dirname(p){var i=p.lastIndexOf('/');return i>=0?p.slice(0,i):'';}
function normalize(p){
  var parts=p.split('/'),out=[];
  for(var i=0;i<parts.length;i++){
    var s=parts[i];
    if(s===''||s==='.')continue;
    if(s==='..')out.pop();else out.push(s);
  }
  return out.join('/');
}
function resolveRel(from,spec){
  var base=dirname(from);
  var raw=normalize((base?base+'/':'')+spec);
  if(FILES[raw]!=null)return raw;
  var exts=['.jsx','.tsx','.js','.ts','.mjs','.json','.css'];
  for(var i=0;i<exts.length;i++){if(FILES[raw+exts[i]]!=null)return raw+exts[i];}
  for(var j=0;j<exts.length;j++){if(FILES[raw+'/index'+exts[j]]!=null)return raw+'/index'+exts[j];}
  return null;
}
function transpile(path){
  var src=FILES[path]||'';
  var e=ext(path);
  if(e==='json')return 'export default '+src+';';
  if(e==='css')return 'export default {};';
  var presets=[['react',{runtime:'automatic'}]];
  if(e==='ts'||e==='tsx')presets.push(['typescript',{allExtensions:true,isTSX:e==='tsx',onlyRemoveTypeImports:true}]);
  var out=Babel.transform(src,{presets:presets,filename:path,sourceType:'module',sourceMaps:false});
  return out&&out.code?out.code:'';
}
var SPEC_RE=/(from\\s+|import\\s+|import\\(\\s*|export\\s+\\*\\s+from\\s+|export\\s+\\{[^}]*\\}\\s+from\\s+)(['"])([^'"]+)\\2/g;
var blobs={},building={};
function build(path){
  if(blobs[path])return blobs[path];
  if(building[path])return null;
  building[path]=true;
  var code=transpile(path);
  code=code.replace(SPEC_RE,function(m,pre,q,spec){
    if(spec.charAt(0)==='.'){
      if(/\\.css$/.test(spec))return pre+q+'data:text/javascript,export default {}'+q;
      var t=resolveRel(path,spec);
      if(t){var b=build(t);if(b)return pre+q+b+q;}
      return m;
    }
    return m; // bare specifier — resolved by the import map
  });
  var url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
  blobs[path]=url;building[path]=false;
  return url;
}
function showError(msg){
  var d=document.querySelector('.koda-err');
  if(!d){d=document.createElement('div');d.className='koda-err';document.body.appendChild(d);}
  d.textContent='⚠ Preview error\\n\\n'+msg;
}
window.addEventListener('error',function(e){
  if(e&&e.message)showError(e.message+(e.filename?'\\n'+String(e.filename):''));
});
window.addEventListener('unhandledrejection',function(e){
  var r=e&&e.reason;showError('Failed to run: '+(r&&r.message?r.message:String(r)));
});
function boot(){
  if(typeof Babel==='undefined'){showError('Babel failed to load (network/CDN blocked).');return;}
  var entryUrl;
  try{ entryUrl=build(ENTRY); }
  catch(err){ showError(err&&err.stack?err.stack:String(err)); return; }
  if(!entryUrl){ showError('Could not resolve entry module: '+ENTRY); return; }
  // Load the entry as a module; if it defines but never mounts an App, mount it.
  var run='import('+JSON.stringify(entryUrl)+').then(function(mod){'+
    'setTimeout(function(){'+
      'var root=document.getElementById("root")||document.getElementById("app");'+
      'if(root&&root.childElementCount===0&&mod&&typeof mod.default==="function"){'+
        'Promise.all([import("react"),import("react-dom/client")]).then(function(a){'+
          'a[1].createRoot(root).render(a[0].default.createElement(mod.default));'+
        '});'+
      '}'+
    '},80);'+
  '}).catch(function(e){window.__kodaShowError(e&&e.stack?e.stack:String(e));});';
  window.__kodaShowError=showError;
  var s=document.createElement('script');s.type='module';s.textContent=run;document.body.appendChild(s);
}
boot();
`;

/**
 * Escape a string so it is safe to embed inside an inline <script>. Generated
 * files (e.g. a Vite index.html) routinely contain "</script>", which would
 * otherwise close the loader's script tag early and blank the whole preview.
 */
function escapeForScript(s: string): string {
  return s.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
}

/** Prevent injected CSS from closing the surrounding <style> tag early. */
function escapeForStyle(s: string): string {
  return s.replace(/<\/(style)/gi, "<\\/$1");
}

// Pin one React version everywhere so every module shares a single instance.
// React 19 exports modern APIs (use, useOptimistic, …) that generated apps and
// recent libraries rely on, and stays backward-compatible with React 18 code.
const REACT_VERSION = "19.1.0";

/** Map a bare import specifier to a pinned esm.sh URL (single shared React). */
function esmUrl(spec: string): string {
  const rv = REACT_VERSION;
  if (spec === "react") return `https://esm.sh/react@${rv}`;
  if (spec === "react/jsx-runtime") return `https://esm.sh/react@${rv}/jsx-runtime`;
  if (spec === "react/jsx-dev-runtime") return `https://esm.sh/react@${rv}/jsx-dev-runtime`;
  if (spec.startsWith("react/")) return `https://esm.sh/react@${rv}/` + spec.slice(6);
  if (spec === "react-dom") return `https://esm.sh/react-dom@${rv}?external=react`;
  if (spec.startsWith("react-dom/"))
    return `https://esm.sh/react-dom@${rv}/` + spec.slice(10) + "?external=react";
  // Everything else: pull from esm.sh and reuse our React/React-DOM instance.
  return "https://esm.sh/" + spec + "?external=react,react-dom";
}

const BARE_SCAN_RE =
  /(?:from\s+|import\s+|import\(\s*|export\s+\*\s+from\s+|export\s+\{[^}]*\}\s+from\s+)(['"])([^'"]+)\1/g;

/** Build a static import map covering react + every bare dependency in the files. */
function buildImportMap(files: ProjectFile[]): string {
  const imports: Record<string, string> = {
    react: esmUrl("react"),
    "react/jsx-runtime": esmUrl("react/jsx-runtime"),
    "react/jsx-dev-runtime": esmUrl("react/jsx-dev-runtime"),
    "react-dom": esmUrl("react-dom"),
    "react-dom/client": esmUrl("react-dom/client"),
  };
  for (const f of files) {
    if (!/\.(jsx?|tsx?|mjs)$/.test(f.path)) continue;
    const re = new RegExp(BARE_SCAN_RE.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(f.content)) !== null) {
      const spec = m[2];
      if (spec[0] !== "." && !spec.endsWith(".css") && !imports[spec]) {
        imports[spec] = esmUrl(spec);
      }
    }
  }
  return JSON.stringify({ imports });
}

/** Build the React/Vite preview srcDoc (native ESM + import map → esm.sh). */
function reactSrcDoc(files: ProjectFile[]): string {
  const map = toMap(files);
  const css = files.filter((f) => ext(f.path) === "css").map((f) => f.content).join("\n");
  const body = extractBody(map["index.html"]) || '<div id="root"></div>';
  const entry = pickEntry(map);
  // Escape "</script>" inside the embedded file data so it can't close this
  // inline <script> tag early (a Vite index.html always contains one).
  const filesJson = escapeForScript(JSON.stringify(JSON.stringify(map)));
  const importMap = escapeForScript(buildImportMap(files));

  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script type="importmap">${importMap}</script>
<style>${RESET_CSS}</style>
<style>${escapeForStyle(css)}</style>
${ERROR_STYLE}
<script src="https://unpkg.com/@babel/standalone@7.24.7/babel.min.js"></script>
</head><body>${body}
<script>${NAV_GUARD}</script>
<script>
var FILES = JSON.parse(${filesJson});
var ENTRY = ${JSON.stringify(entry)};
${LOADER_BODY}
</script>
</body></html>`;
}

/** Build a static-site preview by inlining local CSS/JS into index.html. */
function staticSrcDoc(files: ProjectFile[]): string {
  const map = toMap(files);
  let html =
    map["index.html"] ||
    `<!doctype html><html><body><pre>${escapeHtml(
      files.map((f) => f.path).join("\n")
    )}</pre></body></html>`;

  // Inline <link rel="stylesheet" href="local.css">
  html = html.replace(
    /<link[^>]*href=["']([^"']+)["'][^>]*>/gi,
    (m, href) => {
      const key = norm(href);
      if (/^https?:|^\/\//.test(href)) return m;
      return map[key] != null ? `<style>${map[key]}</style>` : m;
    }
  );

  // Inline <script src="local.js"></script>
  html = html.replace(
    /<script[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi,
    (m, src) => {
      const key = norm(src);
      if (/^https?:|^\/\//.test(src)) return m;
      return map[key] != null ? `<script>${map[key]}</script>` : m;
    }
  );

  // Stop placeholder links from navigating the iframe back to our app.
  const guard = `<script>${NAV_GUARD}</script>`;
  if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, `${guard}</body>`);
  else html += guard;

  return html;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Build the full iframe srcDoc for a project. */
export function buildPreviewSrcDoc(files: ProjectFile[]): string {
  if (!files.length) {
    return `<!doctype html><html><body style="font:14px system-ui;color:#888;display:grid;place-items:center;height:100vh;margin:0;background:#0b0b0d">Waiting for files…</body></html>`;
  }
  return isReactProject(files) ? reactSrcDoc(files) : staticSrcDoc(files);
}
