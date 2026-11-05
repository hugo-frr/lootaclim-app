// /sitemap.xml : la liste des pages publiques, envoyée à Google.
import { pagesDuSitemap, urlAbsolue } from "../lib/seo";

export default function sitemap() {
  const maintenant = new Date();
  return pagesDuSitemap().map((p) => ({
    url: urlAbsolue(p.chemin),
    lastModified: maintenant,
    changeFrequency: p.frequence,
    priority: p.priorite,
  }));
}
