/** RFC 2822 message with UTF-8 subject and body, for the Gmail API. */
export function buildMime(from: string, to: string[], subject: string, body: string, inReplyTo?: string): string {
  const encSubject = `=?UTF-8?B?${b64(subject)}?=`;
  const headers = [
    `From: ${from}`,
    `To: ${to.join(", ")}`,
    `Subject: ${encSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : []),
  ];
  return `${headers.join("\r\n")}\r\n\r\n${b64(body).replace(/(.{76})/g, "$1\r\n")}`;
}

export function b64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

export function b64url(s: string): string {
  return b64(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s: string): string {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}
