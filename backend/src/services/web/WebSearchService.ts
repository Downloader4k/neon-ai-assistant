import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../../utils/logger';

export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
}

export class WebSearchService {
    private readonly USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

    /**
     * Perform a web search using DuckDuckGo API (free, fast) with Wikipedia fallback
     */
    async search(query: string, limit: number = 5): Promise<SearchResult[]> {
        try {
            logger.info(`Searching web for: ${query}`);

            // Search DuckDuckGo and Wikipedia in parallel
            const [ddgResults, wikiResults] = await Promise.all([
                this.searchDuckDuckGo(query, limit),
                this.searchWikipedia(query, limit)
            ]);

            // Combine results, Wikipedia first (better for German queries), then DuckDuckGo
            const combined: SearchResult[] = [];
            const seenUrls = new Set<string>();

            for (const result of [...wikiResults, ...ddgResults]) {
                if (!seenUrls.has(result.url)) {
                    seenUrls.add(result.url);
                    combined.push(result);
                }
            }

            logger.info(`Found ${combined.length} results (DDG: ${ddgResults.length}, Wiki: ${wikiResults.length})`);
            return combined.slice(0, limit);

        } catch (error) {
            logger.error('Web search failed', { error, query });
            return [];
        }
    }

    /**
     * Search using DuckDuckGo Instant Answer API (official, free)
     */
    private async searchDuckDuckGo(query: string, limit: number = 5): Promise<SearchResult[]> {
        try {
            // Use DuckDuckGo's official API (no rate limits for reasonable use)
            const response = await axios.get('https://api.duckduckgo.com/', {
                params: {
                    q: query,
                    format: 'json',
                    no_html: 1,
                    skip_disambig: 1,
                    kl: 'de-de'  // Deutsche Ergebnisse bevorzugen
                },
                headers: {
                    'User-Agent': this.USER_AGENT
                },
                timeout: 5000
            });

            const results: SearchResult[] = [];
            const data = response.data;

            // Abstract (instant answer summary)
            if (data.Abstract && data.AbstractURL) {
                results.push({
                    title: data.Heading || query,
                    url: data.AbstractURL,
                    snippet: data.Abstract
                });
            }

            // Related topics
            if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
                for (const topic of data.RelatedTopics.slice(0, limit - results.length)) {
                    if (topic.Text && topic.FirstURL) {
                        results.push({
                            title: topic.Text.split(' - ')[0],
                            url: topic.FirstURL,
                            snippet: topic.Text
                        });
                    }
                }
            }

            logger.info(`DuckDuckGo returned ${results.length} results`);
            return results.slice(0, limit);

        } catch (error) {
            logger.warn('DuckDuckGo API failed', { error });
            return [];
        }
    }

    /**
     * Search Wikipedia for articles
     */
    private async searchWikipedia(query: string, limit: number = 5): Promise<SearchResult[]> {
        try {
            // Use Wikipedia's opensearch API
            const response = await axios.get('https://de.wikipedia.org/w/api.php', {
                params: {
                    action: 'opensearch',
                    search: query,
                    limit: limit,
                    format: 'json'
                },
                headers: {
                    'User-Agent': this.USER_AGENT
                },
                timeout: 5000
            });

            const [, titles, snippets, urls] = response.data;
            const results: SearchResult[] = [];

            for (let i = 0; i < titles.length && i < limit; i++) {
                results.push({
                    title: titles[i],
                    snippet: snippets[i] || 'Wikipedia-Artikel',
                    url: urls[i]
                });
            }

            return results;

        } catch (error) {
            logger.warn('Wikipedia search failed, will try fallback', { error });
            return [];
        }
    }

    /**
     * Read the content of a specific web page
     */
    async readPage(url: string): Promise<string> {
        try {
            logger.info(`Reading page: ${url}`);

            const response = await axios.get(url, {
                headers: {
                    'User-Agent': this.USER_AGENT
                },
                timeout: 10000 // 10s timeout
            });

            const $ = cheerio.load(response.data);

            // Remove clutter
            $('script').remove();
            $('style').remove();
            $('nav').remove();
            $('footer').remove();
            $('header').remove();
            $('.ad').remove();
            $('.advertisement').remove();

            // Extract text from paragraphs and headings
            let content = '';
            $('h1, h2, h3, p, li').each((_, el) => {
                const text = $(el).text().trim();
                if (text.length > 20) { // arbitrary filter for short/empty lines
                    content += text + '\n\n';
                }
            });

            // If content is too long, truncate
            if (content.length > 10000) {
                content = content.substring(0, 10000) + '... [Truncated]';
            }

            return content.trim();

        } catch (error) {
            logger.error('Failed to read page', { error, url });
            return `[Fehler beim Laden der Seite: ${url}]`;
        }
    }
}

export const webSearchService = new WebSearchService();
