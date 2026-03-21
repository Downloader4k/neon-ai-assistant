import twemoji from 'twemoji';

/**
 * Parses emojis in a DOM element and replaces them with Twemoji images
 * @param element The DOM element to parse
 */
export function parseTwemoji(element: HTMLElement) {
    if (!element) return;

    twemoji.parse(element, {
        folder: 'svg',
        ext: '.svg',
        base: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/',
        className: 'emoji'
    });
}

/**
 * Converts Unicode emojis in text to Twemoji HTML
 * @param text Text containing Unicode emojis
 * @returns HTML string with emojis replaced by Twemoji images
 */
export function parseEmojis(text: string): string {
    if (!text) return text;

    return twemoji.parse(text, {
        folder: 'svg',
        ext: '.svg',
        base: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/',
        className: 'emoji'
    });
}

/**
 * Creates a React component that renders text with Twemoji emojis
 */
export function TwemojiText({ children }: { children: string }) {
    const html = parseEmojis(children);

    return (
        <span
            dangerouslySetInnerHTML={{ __html: html }}
            className="twemoji-text"
        />
    );
}
