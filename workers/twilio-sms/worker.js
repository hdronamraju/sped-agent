// Optional: text parents through Twilio. NOT deployed and NOT wired into the app yet.
//
// The app has no server, so SMS needs this small Cloudflare Worker to hold the
// Twilio secret. It accepts a message only from a signed-in district Google
// account: the browser sends its Google access token, and the worker checks it
// with Google and checks the email domain.
//
// Deploy: `wrangler deploy` with secrets TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM
// and var ALLOWED_DOMAIN (e.g. "sample-unified.org") and ALLOWED_ORIGIN (the app URL).

export default {
  async fetch(req, env) {
    const cors = { "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN, "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST" };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

    const token = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
    const info = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`);
    if (!info.ok) return new Response("Not signed in", { status: 401, headers: cors });
    const { email, email_verified } = await info.json();
    if (email_verified !== "true" || !String(email).endsWith(`@${env.ALLOWED_DOMAIN}`)) return new Response("Forbidden", { status: 403, headers: cors });

    const { to, body } = await req.json();
    if (!/^\+1\d{10}$/.test(to) || typeof body !== "string" || body.length > 1200) return new Response("Bad request", { status: 400, headers: cors });

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${env.TWILIO_SID}:${env.TWILIO_TOKEN}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: env.TWILIO_FROM, Body: body }),
    });
    const out = await res.json();
    // Log only the sender and message id; never the parent's number or text.
    console.log(JSON.stringify({ by: email, sid: out.sid, status: res.status }));
    return new Response(JSON.stringify({ sid: out.sid }), { status: res.ok ? 200 : 502, headers: { ...cors, "Content-Type": "application/json" } });
  },
};
