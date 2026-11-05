// /robots.txt : ce que les robots peuvent explorer, et où trouver le sitemap.
import { CHEMINS_PRIVES, SITE_URL } from "../lib/seo";

export default function robots() {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: CHEMINS_PRIVES }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
