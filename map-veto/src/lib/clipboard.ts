/** Reject empty content and report success only when a copy operation succeeds. */
export async function copyText(text: string): Promise<void> {
    if (!text.trim()) throw new Error('This link is unavailable. Close this dialog and load the links again.');
    try {
        await navigator.clipboard.writeText(text);
        return;
    } catch {
        // Older browsers or denied Clipboard API access may still allow selection copying.
        const previousFocus = document.activeElement;
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.setAttribute('readonly', '');
        document.body.appendChild(textarea);
        try {
            textarea.focus();
            textarea.select();
            if (!document.execCommand('copy')) throw new Error('Copy failed. Check your browser clipboard permissions and try again.');
        } finally {
            textarea.remove();
            if (previousFocus instanceof HTMLElement) previousFocus.focus();
        }
    }
}

export const MATCH_LINK_ROLES = ['team_a', 'team_b', 'observer', 'admin'] as const;

/** The dashboard must never open a successful-looking dialog containing empty links. */
export function matchLinkUrls(data: unknown, origin: string, matchId: string): Record<typeof MATCH_LINK_ROLES[number], string> {
    if (!data || typeof data !== 'object') throw new Error('Match links are unavailable. Please retry.');
    const links = data as Record<string, unknown>;
    const result = {} as Record<typeof MATCH_LINK_ROLES[number], string>;
    for (const role of MATCH_LINK_ROLES) {
        const link = links[role];
        if (!link || typeof link !== 'object' || !('token' in link) || typeof link.token !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(link.token)) {
            throw new Error('Some match links are unavailable. Please retry.');
        }
        const url = new URL(`/match/${matchId}`, origin);
        url.searchParams.set('token', link.token);
        result[role] = url.href;
    }
    return result;
}
