const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET") {
    return res.end(JSON.stringify({
      ok: true,
      hasClientId: !!GOOGLE_CLIENT_ID,
      hasClientSecret: !!GOOGLE_CLIENT_SECRET,
    }));
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  var body = req.body || {};
  var code = body.code;
  var code_verifier = body.code_verifier;
  var redirect_uri = body.redirect_uri;

  if (!code || !code_verifier) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "Missing code or code_verifier" }));
  }

  fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirect_uri || "https://brinc-proposal-generator.vercel.app/google/callback",
      grant_type: "authorization_code",
      code_verifier: String(code_verifier),
    }),
  }).then(function(r) { return r.json(); }).then(function(tokens) {
    if (tokens.error) throw new Error(tokens.error_description || tokens.error);
    return fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: "Bearer " + tokens.access_token },
    }).then(function(r) { return r.json(); }).then(function(user) {
      return {
        email: user.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || "",
      };
    });
  }).then(function(result) {
    res.end(JSON.stringify({ ok: true, email: result.email, accessToken: result.accessToken, refreshToken: result.refreshToken }));
  }).catch(function(err) {
    res.statusCode = 400;
    res.end(JSON.stringify({ ok: false, error: err.message || "Token exchange failed" }));
  });
}
