/**
 * Single Page Application (SPA) router
 */

(() => {
/**
 * Simple routing class to match groups and wildcards.
 * Taken from Akeno (https://github.com/the-lstv/akeno)
 */
class Matcher {
    constructor(options = {}, info = null) {
        this.exactMatches = new Map();
        this.wildcards = new WildcardMatcher(options.segmentChar || "/", []);
        this.fallback = null;
        this.options = options;
    }

    *expandPattern(pattern) {
        if (typeof pattern !== 'string') {
            throw new Error('Pattern must be a string');
        }

        // Expand only groups not preceded by '!'. Negated groups are preserved for the matcher.
        let searchFrom = 0;
        while (true) {
            const group = pattern.indexOf('{', searchFrom);
            if (group === -1) break;
            const prevChar = group > 0 ? pattern[group - 1] : null;
            if (prevChar !== '!') {
                const endGroup = pattern.indexOf('}', group);
                if (endGroup === -1) {
                    throw new Error(`Unmatched group in pattern: ${pattern}`);
                }

                const groupValues = pattern.slice(group + 1, endGroup);
                const patternStart = pattern.slice(0, group);
                const patternEnd = pattern.slice(endGroup + 1);

                for (let value of groupValues.split(',')) {
                    value = value.trim();
                    const next = patternStart + value + (value === "" && patternEnd.startsWith('.') ? patternEnd.slice(1) : patternEnd);
                    yield* this.expandPattern(next);
                }
                return;
            }
            searchFrom = group + 1;
        }

        if(pattern[pattern.length - 1] === '/') {
            pattern = pattern.slice(0, -1);
        }
        yield pattern;
    }

    add(pattern, handler) {
        if(Array.isArray(pattern)) {
            for(const p of pattern) {
                this.add(p, handler);
            }
            return;
        }

        if (typeof pattern !== 'string' || !handler) {
            throw new Error('Invalid route definition');
        }

        if (pattern.endsWith('.')) {
            pattern = pattern.slice(0, -1);
        }

        if (pattern === '*' || pattern === '**') {
            this.fallback = handler;
            return;
        }

        if (!pattern) {
            return;
        }

        // Expand pattern groups (non-negated only)
        for (const expandedPattern of this.expandPattern(pattern)) {
            // Route patterns with wildcards or negated groups to the wildcard matcher
            if (expandedPattern.indexOf('*') !== -1 || expandedPattern.indexOf('!{') !== -1) {
                this.wildcards.add(expandedPattern, handler);
                continue;
            }

            const existingHandler = this.exactMatches.get(expandedPattern);
            if (existingHandler && existingHandler !== handler) {
                if(this.options.mergeObjects) {
                    handler = Object.assign(existingHandler, handler);
                    continue;
                }

                this.warn(`Warning: Route already exists for domain: ${expandedPattern}, it is being overwritten.`);
            }

            this.exactMatches.set(expandedPattern, handler);
        }
    }

    clear() {
        this.exactMatches.clear();
        this.wildcards.patterns = [];
        this.fallback = null;
    }

    remove(pattern) {
        if (typeof pattern !== 'string') {
            throw new Error('Invalid route pattern');
        }

        for (const expandedPattern of this.expandPattern(pattern)) {
            this.exactMatches.delete(expandedPattern);
            this.wildcards.filter(route => route.pattern !== expandedPattern);
        }
    }

    getBasePath(pattern) {
        const specialIndex = Math.min(
            pattern.indexOf('{') !== -1 ? pattern.indexOf('{') : Infinity,
            pattern.indexOf('*') !== -1 ? pattern.indexOf('*') : Infinity
        );
        
        if (specialIndex !== Infinity) {
            pattern = pattern.slice(0, specialIndex);
        }

        return pattern.replace(/[/!]+$/, '');
    }

    match(input) {
        // Check exact matches first
        const handler = this.exactMatches.get(input);
        if (handler) {
            return handler;
        }

        // Check wildcard matches
        const wildcardHandler = this.wildcards.match(input);
        if (wildcardHandler) {
            return wildcardHandler;
        }

        // If no specific route found, return the fallback route
        if (this.fallback) {
            return this.fallback;
        }

        return false;
    }
}

class WildcardMatcher {
    constructor(segmentChar = "/", patterns = []) {
        this.segmentChar = segmentChar || "/";
        this.patterns = patterns || [];
    }

    add(pattern, handler = pattern) {
        const rawParts = this.split(pattern);
        const parts = rawParts.map(p => {
            if (p.length > 3 && p.startsWith('!{') && p.endsWith('}')) {
                const values = p.slice(2, -1).split(',').map(v => v.trim()).filter(v => v !== '');
                return { type: 'negSet', set: new Set(values) };
            }
            return p;
        });

        // Try to merge with an existing pattern that differs by exactly one string segment
        for (const existing of this.patterns) {
            if (existing.handler !== handler || existing.parts.length !== parts.length) continue;

            let diffIndex = -1;
            let canMerge = true;

            for (let i = 0; i < parts.length; i++) {
                const existingPart = existing.parts[i];
                const newPart = parts[i];

                // Check if parts are equal
                if (existingPart === newPart) continue;

                // Check if existing is a set and new part is a string that can be added
                if (typeof existingPart === 'object' && existingPart && existingPart.type === 'set' && typeof newPart === 'string') {
                    if (diffIndex !== -1) { canMerge = false; break; }
                    diffIndex = i;
                    continue;
                }

                // Check if both are strings (can be converted to set)
                if (typeof existingPart === 'string' && typeof newPart === 'string') {
                    if (diffIndex !== -1) { canMerge = false; break; }
                    diffIndex = i;
                    continue;
                }

                // Parts are incompatible
                canMerge = false;
                break;
            }

            if (canMerge && diffIndex !== -1) {
                const existingPart = existing.parts[diffIndex];
                const newPart = parts[diffIndex];

                if (typeof existingPart === 'object' && existingPart.type === 'set') {
                    // Add to existing set
                    existingPart.set.add(newPart);
                } else {
                    // Convert string to set
                    existing.parts[diffIndex] = { type: 'set', set: new Set([existingPart, newPart]) };
                }
                return;
            }
        }

        this.patterns.push({ parts, handler, pattern });
        this.patterns.sort((a, b) => b.parts.length - a.parts.length);
    }

    filter(callback) {
        this.patterns = this.patterns.filter(callback);
        return this;
    }

    split(path) {
        if (path === "" || !path) return [""];
        if (path[0] !== this.segmentChar) path = this.segmentChar + path;
        return path.split(this.segmentChar);
    }

    /**
     * Fast wildcard matching with segment support.
     * @param {string|array} input - The input string or array of segments to match against.
     */
    match(input) {
        const path = Array.isArray(input) ? input : this.split(input);

        for (const { parts, handler } of this.patterns) {
            // Exact match
            if (parts.length === 1) {
                const only = parts[0];
                if (only === "**" || (typeof only === 'string' && path.length === 1 && ((only === "*" && path[0] !== "") || only === path[0]))) {
                    return handler;
                }

                if (typeof only === 'object' && only) {
                    if (only.type === 'negSet' && path.length === 1 && path[0] !== "" && !only.set.has(path[0])) {
                        return handler;
                    }
                    if (only.type === 'set' && path.length === 1 && only.set.has(path[0])) {
                        return handler;
                    }
                }
                continue;
            }

            let pi = 0, si = 0;
            let starPi = -1, starSi = -1;

            while (si < path.length) {
                const part = parts[pi];
                if (pi < parts.length && part === "**") {
                    starPi = pi;
                    starSi = si;
                    pi++;
                } else if (pi < parts.length && part === "*") {
                    if (path[si] === "") break;
                    pi++;
                    si++;
                } else if (pi < parts.length && typeof part === 'object' && part) {
                    if (part.type === 'negSet') {
                        if (path[si] === "" || part.set.has(path[si])) break;
                    } else if (part.type === 'set') {
                        if (path[si] === "" || !part.set.has(path[si])) break;
                    }
                    pi++;
                    si++;
                } else if (pi < parts.length && part === path[si]) {
                    pi++;
                    si++;
                } else if (starPi !== -1) {
                    pi = starPi + 1;
                    starSi++;
                    si = starSi;
                } else {
                    break;
                }
            }

            while (pi < parts.length && parts[pi] === "**") pi++;
            if (pi === parts.length && si === path.length) {
                return handler;
            }
        }
        return null;
    }
}

const isDebug = false;

class NavigationController extends LS.EventEmitter {
    extensions = new Matcher();
    viewports  = new Map();

    constructor(options = {}) {
        super();

        this.options = options;

        // Event listener for back/forward navigation
        window.addEventListener('popstate', (event) => {
            if(isDebug) this.log("Popstate event:", event);

            const href = event.state?.path ?? (location.pathname + location.hash);
            this.navigate(href, { pushState: false });
        });

        window.addEventListener('click', async (event) => {
            const targetElement = event.target.closest("a");
            if (!targetElement || targetElement.hasAttribute("target")) return;

            const link = targetElement.href;
            const rawHref = targetElement.getAttribute('href');
            if(!rawHref) return;

            if(rawHref === "#") return event.preventDefault();

            const isRelativeLocal = link.startsWith(location.origin) && !link.endsWith("?") && !link.startsWith(location.origin + ":");

            if(isRelativeLocal) {
                let href = rawHref;

                try {
                    const parsed = new URL(link, location.href);
                    href = parsed.pathname + parsed.search + parsed.hash;
                } catch (e) {
                    if(href.startsWith(location.origin)) href = href.substring(location.origin.length);
                }

                if(href.startsWith("#")) {
                    href = location.pathname + href;
                }

                const viewportElement = targetElement.closest(".ls-viewport") || this.viewport.target;
                if (viewportElement) {
                    const viewport = viewportElement.viewportInstance || [...this.viewports.values()].find(v => v.target === viewportElement);
                    if (viewport) {
                        event.preventDefault();
                        viewport.navigate(href, { targetElement });
                        return;
                    } else {
                        console.error("No viewport found for element", viewportElement);
                    }
                } else {
                    console.error("No viewport element found", viewportElement);
                }

                return;
            }

            event.preventDefault();

            if(this.options.externalConfirmDialog !== false && !await LS.Modal.confirm(`You are about to open an external link to: <br><br><b>${link}</b><br><br>Are you sure you want to continue?`, { title: "Open external link?" })) {
                return;
            }

            if(isDebug) this.log("Opening external link in new tab:", link);
            window.open(link, '_blank', 'noopener');
        });
    }
}

const spa = {
    WildcardMatcher,
    Matcher,
    NavigationController,
    // Viewport,

    basicSetup(target, options = {}) {
        if(!target) target = document.body;
        if(!options) options = {};

        const router = new NavigationController(options);
        // const viewport = new Viewport("main", target, options);

        // return { router, viewport };
    }
};

LS.SPA = spa;

/*@ls-export*/ if (typeof module !== "undefined" && module.exports) {
    module.exports = spa;
}
})();
