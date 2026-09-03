// Some networks (several Indian ISPs/routers, some corporate firewalls)
// block or intercept outbound DNS on port 53 to anything but their own
// resolver — this breaks SRV/TXT lookups specifically (mongodb+srv://
// needs both) even though normal A-record lookups, and therefore normal
// browsing, work fine. Pointing dns.setServers() at Google/Cloudflare
// doesn't help in that case, because the block is on the query itself,
// not on which server it's addressed to.
//
// The fix: resolve the SRV/TXT records over DNS-over-HTTPS (plain HTTPS on
// port 443, the same port everything else already uses) instead of classic
// UDP:53 DNS, then build a standard mongodb:// URI so the Mongo driver
// never needs to do its own SRV DNS lookup at all.

async function dohQuery(name, type) {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`;
  const res = await fetch(url, { headers: { accept: "application/dns-json" } });
  if (!res.ok) {
    throw new Error(`DoH ${type} query for ${name} failed: HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.Status !== 0 || !data.Answer?.length) {
    throw new Error(`DoH ${type} query for ${name} returned no records (status ${data.Status})`);
  }
  return data.Answer;
}

function parseSrvRecord(data) {
  // SRV record data comes back as "priority weight port target."
  const [, , port, target] = data.trim().split(/\s+/);
  return { port: Number(port), target: target.replace(/\.$/, "") };
}

/**
 * Converts a mongodb+srv:// URI into a standard mongodb:// URI by resolving
 * the SRV (host list) and TXT (default connection options) records over
 * DNS-over-HTTPS. Throws if the URI isn't a parseable +srv URI.
 */
async function srvUriToStandardUri(srvUri) {
  const match = srvUri.match(/^mongodb\+srv:\/\/([^:]+):([^@]+)@([^/?]+)\/?([^?]*)(\?.*)?$/);
  if (!match) {
    throw new Error("Not a parseable mongodb+srv:// URI");
  }
  const [, user, pass, host, db, queryString = ""] = match;

  const srvAnswers = await dohQuery(`_mongodb._tcp.${host}`, "SRV");
  const hosts = srvAnswers
    .map((a) => parseSrvRecord(a.data))
    .map((s) => `${s.target}:${s.port}`)
    .join(",");

  const params = new URLSearchParams(queryString.replace(/^\?/, ""));
  params.set("ssl", "true");

  // The TXT record carries default query params (e.g. replicaSet name) for
  // +srv connections. It's optional - proceed without it if absent.
  try {
    const txtAnswers = await dohQuery(host, "TXT");
    const txtParams = txtAnswers.map((a) => a.data.replace(/^"|"$/g, "")).join("&");
    for (const pair of txtParams.split("&")) {
      const [key, value] = pair.split("=");
      if (key && value && !params.has(key)) params.set(key, value);
    }
  } catch {
    // No TXT record, or it failed to resolve - not fatal.
  }

  return `mongodb://${user}:${pass}@${hosts}/${db}?${params.toString()}`;
}

module.exports = { srvUriToStandardUri };
