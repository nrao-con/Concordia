const HOST = "concordianyc.com";

export async function pingIndexNow(urls: string[]): Promise<void> {
  const key = process.env.INDEXNOW_KEY;
  if (!key || urls.length === 0) return;

  const body = {
    host: HOST,
    key,
    keyLocation: `https://${HOST}/${key}.txt`,
    urlList: urls,
  };

  try {
    const res = await fetch("https://api.indexnow.org/IndexNow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`[IndexNow] ping returned ${res.status} for ${urls.join(", ")}`);
    } else {
      console.log(`[IndexNow] pinged ${urls.length} URL(s): ${urls.join(", ")}`);
    }
  } catch (err) {
    console.warn("[IndexNow] ping failed (network error):", err);
  }
}
