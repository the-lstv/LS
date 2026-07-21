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

// class Router extends LS.EventEmitter {
//     extensions = new Matcher();
// }

// /**
//  * Viewport class
//  * Represents a viewport (window, frame, etc.) in the application where content contexts can be rendered.
//  */
// let firstPage = true;
// class Viewport extends LS.EventEmitter {
//     constructor(name, element, options = {}) {
//         super();
//         this.name = name || "default";
//         this.target = element;
//         this.current = null;
//         this.history = [];
//         this.options = options;
//         this.target.classList.add("viewport");
//         this.target.viewportInstance = this;
//         this.destroyed = false;

//         // Kernel may not be initilaized yet, that's why we allow a fallback
//         (options.kernel || kernel).viewports.set(this.name, this);
//     }

//     get errorPageElement() {
//         return this.__errorPage || (this.__errorPage = LS.Create({
//             class: 'error_page',
//             inner: [
//                 (this.errorPageStatus = LS.Create({ tag: "h1" })),
//                 { class: 'marqueeBar', inner: [[
//                     (this.errorPageMessage1 = { tag: 'span', textContent: 'Unexpected error.' }),
//                     (this.errorPageMessage2 = { tag: 'span', textContent: 'Unexpected error.' }),
//                 ]]},
//                 { tag: 'br' },
//                 { tag: 'br' },
//                 { tag: 'a', href: '/', textContent: 'Go back home?' }
//             ]
//         }));
//     }

//     /**
//      * Navigate to a new content context
//      * @param {*} pathOrPage The content context to navigate to
//      * @param {*} options Navigation options
//      */
//     async navigate(pathOrPage, options = {}) {
//         let path = typeof pathOrPage === 'string' ? pathOrPage : pathOrPage.path;
//         let page = pathOrPage instanceof ContentContext ? pathOrPage : null;
//         let hash = typeof options.hash === "string" ? options.hash : "";

//         if(typeof hash === "string" && hash.length > 0) {
//             if(!hash.startsWith("#")) hash = "#" + hash;
//             if(hash === "#") hash = "";
//         }

//         if (typeof path === "string") {
//             const hashIndex = path.indexOf("#");
//             if (hashIndex !== -1) {
//                 hash = path.slice(hashIndex);
//                 if(hash === "#") hash = "";
//                 path = path.slice(0, hashIndex) || "/";
//             }
//         }

//         if(this.options.disableRemotePages && (!page || page.src)) {
//             kernel.error("Remote pages are disabled for this viewport (" + this.name + ").");
//             return false;
//         }

//         // Normalize path
//         if (typeof path === "string") {
//             path = LS.Util.normalizePath(path);
//         }

//         // 0. Open app from route (/app/<app-id>)
//         if (!page && typeof path === "string" && path.startsWith("/app/")) {
//             const appId = decodeURIComponent(path.slice(5).split("/")[0] || "").trim();
//             if (!appId) return false;

//             try {
//                 await new Promise((resolve, reject) => {
//                     kernel.openApplication(appId, {
//                         ...options,
//                         windowOptions: {
//                             ...(options.windowOptions || {}),
//                             disableOpenAnimation: true
//                         },
//                         source: options.source || "route-app"
//                     }).done((instance) => {
//                         instance?.window?.maximize(true);
//                         resolve(instance);
//                     }).catch(reject);
//                 });

//                 const manifest = kernel.appManifests.get(appId);
//                 if (this.name === 'main') {
//                     const historyPath = path + (hash || "");
//                     if (!options.browserTriggered && options.pushState !== false && (location.pathname + location.hash) !== historyPath) {
//                         history.pushState({ path: historyPath }, document.title, historyPath);
//                     }
//                     document.title = `LSTV | ${manifest?.name || appId}`;
//                     website.closeToolbar();
//                 }

//                 kernel.log(`Opened app ${appId} from route ${path}`);
//                 return true;
//             } catch (e) {
//                 kernel.error("Failed to open app route:", path, e);
//                 LS.Toast.show("Failed to open app.", { accent: "red" });
//                 return false;
//             }
//         }

//         // 1. Check for SPA Extensions (Routes)
//         const SPAExtension = options.browserTriggered? null: kernel.resolveSPAExtension(path);
//         if (SPAExtension) {
//             if (SPAExtension[2] !== this.current) {
//                 // We need to navigate to the base page first
//                 await this.navigate(SPAExtension[2], { browserTriggered: true });
//             }

//             const historyPath = path + (hash || "");
//             if((location.pathname + location.hash) !== historyPath && !options.browserTriggered && options.pushState !== false && this.name === 'main') {
//                 history.pushState({ path: historyPath }, document.title, historyPath);
//             }
//             kernel.handleSPAExtension(path, SPAExtension, options.targetElement || null);
//             if(hash) {
//                 requestAnimationFrame(() => {
//                     this.navigateToHash(hash);
//                 });
//             }
//             return true;
//         }

//         // 2. Resolve Page Object
//         if (!page) {
//             page = kernel.getPage(path);
//             if (!page) {
//                 // Dynamic Load
//                 kernel.log("Dynamically loading page for", path);
//                 page = kernel.registerPage(path, {
//                     src: location.origin + path,
//                     // Inherit sandbox options if provided in navigation options
//                     sandboxMode: options.sandbox || options.sandboxMode || null
//                 });
//             }
//         }

//         if (!page) {
//             kernel.error("Failed to resolve page for", path);
//             return false;
//         }

//         const old = this.current;

//         if (old === page && !options.reload && !page.requiresReload) {
//             if(hash) {
//                 if(this.name === "main" && !options.browserTriggered && !options.initial) {
//                     const historyPath = page.path + hash;
//                     if((location.pathname + location.hash) !== historyPath) {
//                         history.pushState({ path: historyPath }, document.title, historyPath);
//                     }
//                 }

//                 requestAnimationFrame(() => {
//                     this.navigateToHash(hash);
//                 });
//             }
//             return true;
//         }

//         // Suspend old page
//         if (old) old.suspend();

//         this.target.classList.add("loading");
//         this.target.setAttribute("state", "loading");

//         // Ensure to render the loading indicator; we don't know how long loading will take or if something explodes
//         await (new Promise(resolve => requestAnimationFrame(resolve)));

//         // Load and Render new page
//         try {
//             if (!page.error) {
//                 await page.render(this.target);
//             }

//             if(page.error) {
//                 this.errorPage(page.error);
//             } else {
//                 this.emit("rendered", page);

//                 if(this.name === "main" && !firstPage) page.content.animate([{ opacity: .5, transform: "scale(102%)" }, { opacity: 1, transform: "scale(100%)" }], { duration: 300, easing: "ease" });
//                 firstPage = false;
//             }

//             this.current = page;

//             if (this.name === 'main') {
//                 document.title = page.title || "LSTV | Untitled";//(page.title && page.title.startsWith("LSTV | "))? page.title: `LSTV | ${page.title || 'Untitled'}`;
                
//                 if (!options.browserTriggered && !options.initial) {
//                     const historyPath = page.path + (hash || "");
//                     if((location.pathname + location.hash) !== historyPath) {
//                         history.pushState({ path: historyPath }, document.title, historyPath);
//                     }
//                 }
//                 website.closeToolbar();
//             }

//             if(hash) {
//                 requestAnimationFrame(() => {
//                     this.navigateToHash(hash);
//                 });
//             }

//             kernel.log(`Navigated to ${path} in ${this.name}`);
//             return true;
//         } catch (e) {
//             kernel.error("Navigation failed:", e);

//             // Handle network errors specifically
//             if (e.message && (e.message.includes("fetch") || e.message.includes("Network") || e instanceof TypeError)) {
//                 LS.Modal.buildEphemeral({
//                     title: [{ tag: "i", class: "bi-wifi-off" }, " Could not load page"],
//                     content: "We're sorry, but something seems to have gone wrong while trying to navigate to the site you were trying to get to. Make sure you are connected to the internet!",
//                     buttons: [
//                         { label: "Try again" },
//                         { label: "Go back" }
//                     ]
//                 }, { closeable: false }).open();
//                 return false;
//             }

//             // Restore old page
//             // if (old && !old.destroyed) {
//             //     try {
//             //         await old.render(this.target);
//             //     } catch (restoreError) {
//             //         // Could be dead or something
//             //         kernel.error("Failed to restore previous page:", restoreError);
//             //         this.errorPage(500);
//             //     }
//             // } else {
//             // }
//             this.errorPage(page.error || 500);
//             return false;
//         } finally {
//             this.target.classList.remove("loading");
//             this.target.setAttribute("state", "idle");
//         }
//     }

//     renderFrom(context) {
//         return context.render(this.target).then(() => {
//             this.current = context;
//             this.emit("rendered", context);
//             return true;
//         }).catch((e) => {
//             kernel.error("Rendering from context failed:", e);
//             this.errorPage(500);
//             return false;
//         });
//     }

//     errorPage(status) {
//         this.errorPageElement; // Ensure it's created

//         this.errorPageStatus.textContent = String(status);
//         this.errorPageMessage1.textContent = website.errorMessages[status] || 'Unexpected error.';
//         this.errorPageMessage2.textContent = this.errorPageMessage1.textContent;
//         this.target.replaceChildren(this.errorPageElement);
//     }

//     navigateToHash(hash) {
//         if(typeof hash !== "string" || !hash || hash === "#") return false;

//         let id = hash.startsWith("#") ? hash.slice(1) : hash;
//         if(!id) return false;

//         try {
//             id = decodeURIComponent(id);
//         } catch (e) {}

//         const element = document.getElementById(id) || document.getElementsByName(id)?.[0] || null;
//         if(!element) return false;

//         element.scrollIntoView({ block: "start" });
//         return true;
//     }

//     destroy(destroyContent = false) {
//         if (this.destroyed) return;
//         this.destroyed = true;

//         if (destroyContent && this.current) {
//             this.current.destroy();
//         }
//         this.current = null;

//         if(this.__errorPage) {
//             this.__errorPage.remove();
//             this.__errorPage = null;
//             this.errorPageStatus = null;
//             this.errorPageMessage1 = null;
//             this.errorPageMessage2 = null;
//         }

//         this.history = [];
//         this.history = null;

//         if(this.target.viewportInstance === this) {
//             delete this.target.viewportInstance;
//         }

//         this.target.remove();
//         this.target = null;

//         kernel.viewports.delete(this.name);
//         this.options = null;
//     }
// }


LS.SPA = {
    WildcardMatcher,
    Matcher,
    // Router,
    // Viewport,

    // basicSetup(target, options = {}) {
    //     if(!target) target = document.body;
    //     if(!options) options = {};

    //     const router = new Router(options);
    //     const viewport = new Viewport("main", target, options);

    //     return { router, viewport };
    // }
};
})();
