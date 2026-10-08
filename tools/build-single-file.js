// Bundles the game into one self-contained HTML file (CSS + JS inlined) for
// hosts that only accept a single page, like claude.ai artifacts.
//
//   node tools/build-single-file.js out.html [--solo] [--mp-url=https://...]
//
// --solo        hide Host/Join and drop PeerJS (for pages where WebRTC is blocked)
// --mp-url=URL  link shown in solo mode for playing with friends
// The output has no <html>/<head>/<body> wrapper; the artifact host adds one.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith("--"));
const solo = args.includes("--solo");
const mpArg = args.find((a) => a.startsWith("--mp-url="));
const mpUrl = mpArg ? mpArg.slice("--mp-url=".length) : "";
if (!out) { console.error("usage: node tools/build-single-file.js out.html [--solo] [--mp-url=URL]"); process.exit(1); }

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const title = (html.match(/<title>[\s\S]*?<\/title>/) || ["<title>Until 6 AM</title>"])[0];
let body = html.match(/<body>([\s\S]*)<\/body>/)[1];

const inlineJs = (src) => {
  const code = fs.readFileSync(path.join(root, src), "utf8");
  if (/<\/script/i.test(code)) throw new Error(src + " contains </script");
  return "<script>\n" + code + "\n</script>";
};

// the page loads vendored copies; the single file points at the same versions on CDNs
const CDN = {
  "lib/three.min.js": "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js",
  "lib/peerjs.min.js": "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js",
};
if (solo) body = body.replace(/\s*<script src="lib\/peerjs\.min\.js"><\/script>/, "");
body = body.replace(/<script src="(lib\/[\w.-]+\.js)"><\/script>/g, (_, src) => {
  if (!CDN[src]) throw new Error("no CDN copy known for " + src);
  return '<script src="' + CDN[src] + '"></script>';
});
body = body.replace(/<script src="(js\/[\w.-]+\.js)"><\/script>/g, (_, src) => inlineJs(src));
if (/<script src=/.test(body.replace(/<script src="https:\/\/(unpkg\.com|cdnjs\.cloudflare\.com)\/[^"]+"><\/script>/g, ""))) {
  throw new Error("unexpected external script left in page");
}

const flags = solo
  ? "<script>window.SOLO_ONLY = true; window.MULTIPLAYER_URL = " + JSON.stringify(mpUrl) + ";</script>\n"
  : "";
const css = fs.readFileSync(path.join(root, "style.css"), "utf8");
const page = title + "\n<style>\n:root { color-scheme: dark; }\n" + css + "</style>\n" + flags + body.trim() + "\n";
fs.writeFileSync(out, page);
console.log("wrote " + out + " (" + Math.round(page.length / 1024) + " KB)");
