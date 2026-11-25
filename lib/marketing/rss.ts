export interface FeedArticle {
  id: string;
  title: string;
  link: string;
  description: string;
  pubDate: string;
  feedTitle?: string;
}

export function parseRssXml(xml: string, feedTitle?: string): FeedArticle[] {
  const articles: FeedArticle[] = [];

  // Match RSS <item> tags
  const itemRegex = /<item[\s\S]*?<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null && articles.length < 15) {
    const itemBlock = match[0];

    const titleMatch = /<title(?:[^>]*)>([\s\S]*?)<\/title>/i.exec(itemBlock);
    const linkMatch = /<link(?:[^>]*)>([\s\S]*?)<\/link>/i.exec(itemBlock);
    const descMatch = /<description(?:[^>]*)>([\s\S]*?)<\/description>/i.exec(itemBlock);
    const pubDateMatch = /<pubDate(?:[^>]*)>([\s\S]*?)<\/pubDate>/i.exec(itemBlock);

    const clean = (val: string | undefined) =>
      val
        ? val
            .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
            .replace(/<[^>]+>/g, '')
            .trim()
        : '';

    const title = clean(titleMatch?.[1]);
    const link = clean(linkMatch?.[1]);
    const description = clean(descMatch?.[1]);
    const pubDate = clean(pubDateMatch?.[1]) || new Date().toISOString();

    if (title) {
      articles.push({
        id: link || `art-${articles.length}-${Date.now()}`,
        title,
        link: link || '#',
        description: description.slice(0, 240) + (description.length > 240 ? '...' : ''),
        pubDate,
        feedTitle,
      });
    }
  }

  // If no <item>, match Atom <entry> tags
  if (articles.length === 0) {
    const entryRegex = /<entry[\s\S]*?<\/entry>/gi;
    while ((match = entryRegex.exec(xml)) !== null && articles.length < 15) {
      const entryBlock = match[0];
      const titleMatch = /<title(?:[^>]*)>([\s\S]*?)<\/title>/i.exec(entryBlock);
      const linkMatch = /<link(?:[^>]*?)href=["']([^"']+)["']/i.exec(entryBlock);
      const summaryMatch = /<(?:summary|content)(?:[^>]*)>([\s\S]*?)<\/(?:summary|content)>/i.exec(entryBlock);
      const publishedMatch = /<(?:published|updated)(?:[^>]*)>([\s\S]*?)<\/(?:published|updated)>/i.exec(entryBlock);

      const clean = (val: string | undefined) =>
        val
          ? val
              .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
              .replace(/<[^>]+>/g, '')
              .trim()
          : '';

      const title = clean(titleMatch?.[1]);
      const link = linkMatch?.[1] || '';
      const description = clean(summaryMatch?.[1]);
      const pubDate = clean(publishedMatch?.[1]) || new Date().toISOString();

      if (title) {
        articles.push({
          id: link || `art-${articles.length}-${Date.now()}`,
          title,
          link: link || '#',
          description: description.slice(0, 240) + (description.length > 240 ? '...' : ''),
          pubDate,
          feedTitle,
        });
      }
    }
  }

  return articles;
}

/** Well-known public feeds offered as one-click subscriptions. */
export const CURATED_FEEDS = [
  { title: 'Creator Science', feedUrl: 'https://creatorscience.com/rss/', siteUrl: 'https://creatorscience.com', category: 'Featured' },
  { title: 'TechCrunch', feedUrl: 'https://techcrunch.com/feed/', siteUrl: 'https://techcrunch.com', category: 'Tech' },
  { title: 'Social Media Today', feedUrl: 'https://www.socialmediatoday.com/rss.xml', siteUrl: 'https://www.socialmediatoday.com', category: 'News' },
  { title: 'SparkToro Blog', feedUrl: 'https://sparktoro.com/blog/feed/', siteUrl: 'https://sparktoro.com/blog', category: 'Business' },
];
