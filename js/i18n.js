/**
 * Simple LS internationalization (i18n) module.
 * 
 * 
 * 
 * 
 * !                                                               !
 * ! Very early version/proof of concept, do not use in production !
 * !                                                               !
 */

(() => {
    console.warn("LS.i18n is in a very early stage");

    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.hasAttribute("data-ls-i18n")) {
                        const key = node.getAttribute("data-ls-i18n");
                        node.textContent = LS.i18n.translate(key, node._lsI18nVars, LS.i18n.locale, node._lsI18nFallback);
                    }

                    for (const element of node.querySelectorAll("[data-ls-i18n]")) {
                        const key = element.getAttribute("data-ls-i18n");
                        element.textContent = LS.i18n.translate(key, element._lsI18nVars, LS.i18n.locale, element._lsI18nFallback);
                    }
                }
            }
        }
    });

    LS.once("ready", () => {
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    });

    LS.LoadComponent({
        locale: "en",
        fallbackLocale: "en",

        sourceString: "locales/{locale}.json",

        locales: {},

        async loadLocale(locale, set = false) {
            if(typeof locale === "object") {
                LS.i18n.locales[locale.code] = locale.translations;
                return;
            }

            const url = LS.i18n.sourceString.replace("{locale}", locale);
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Failed to load locale '${locale}' from '${url}': ${response.status} ${response.statusText}`);
                LS.i18n.locales[locale] = await response.json();
            } catch (error) {
                console.error(`Error loading locale '${locale}':`, error);
            }


            if(set) {
                LS.i18n.changeLocale(locale, false);
            }

            LS.emit("localeLoaded", locale);
        },

        changeLocale(locale, load = true) {
            if (LS.i18n.locales[locale]) {
                LS.i18n.locale = locale;
            } else {
                if(load) {
                    LS.i18n.loadLocale(locale, true);
                    return;
                } else {
                    console.warn(`Locale '${locale}' not loaded.`);
                }
            }

            LS.emit("localeChanged", locale);

            // document.documentElement.dir = ["ar", "he", "fa"].includes(locale)? "rtl" : "ltr";

            for (const element of document.querySelectorAll("[data-ls-i18n]")) {
                const key = element.getAttribute("data-ls-i18n");

                if(!element._lsI18nFallback && element.hasAttribute("data-ls-i18n-fallback")) {
                    element._lsI18nFallback = element.getAttribute("data-ls-i18n-fallback");
                }

                element.textContent = LS.i18n.translate(key, element._lsI18nVars, locale, element._lsI18nFallback);
            }
        },

        translate(key, vars = {}, locale, fallback = null) {
            locale = locale || LS.i18n.locale;

            const translations = LS.i18n.locales[locale] || {};

            let value = key.split(".").reduce((obj, k) => obj?.[k], translations);

            if(value == null && LS.i18n.fallbackLocale && LS.i18n.fallbackLocale !== locale) {
                return LS.i18n.translate(key, vars, LS.i18n.fallbackLocale, fallback);
            }

            if(value == null) {
                // console.warn(`Missing translation: ${key}`, fallback);
                if(!fallback) return key;
                value = fallback;
            }

            // interpolation
            if(vars) {
                value = value.replace(/\{(\w+)\}/g, (_, name) => {
                    return vars[name] ?? `{${name}}`;
                });
            }

            return value;
        },

        setVars(element, vars) {
            element._lsI18nVars = vars;
            const key = element.getAttribute("data-ls-i18n");
            if (key) {
                element.textContent = LS.i18n.translate(key, vars, LS.i18n.locale, element._lsI18nFallback);
            }
        }
    }, { name: "i18n", global: true });
})();