/**
 * Similar behavior as LS.Create, but compiles into a direct optimized function for repeated use.
 * Useful if you have a medium/large structure you expect to create many times and want direct access to its elements.
 * **Not** useful if you intend to do this once ever, it will be slower than LS.Create.
 * @experimental Very experimental
 * 
 * @param {Function|Array|Object|string} templateBuilder A function that returns a template array/object/string or a template array/object/string directly.
 */

LS.CompileTemplate = (() => {
    class ifNode {
        constructor(condition, thenValue, elseValue) {
            this.__lsIf = true;
            this.branches = [{ condition, value: thenValue }];
            this.hasElse = typeof elseValue !== "undefined";
            this.elseValue = elseValue;
        }

        elseIf(cond, value) {
            this.branches.push({ condition: cond, value });
            return this;
        }

        else(value) {
            this.hasElse = true;
            this.elseValue = value;
            return this;
        }
    }

    const symbolProxy = new Proxy({}, {
        get(target, prop) {
            return Symbol(prop);
        }
    });

    const iterProxy = new Proxy({}, {
        get(target, prop) {
            return Symbol(`__iter__.${String(prop)}`);
        }
    });

    // Static logic object
    const logic = {
        // Conditional node
        if(condition, thenValue, elseValue) {
            return new ifNode(condition, thenValue, elseValue);
        },

        // Export node
        export(name, input) {
            input.__exportName = name;
            return input;
        },

        // Concat strings
        concat(...args) {
            return { __lsConcat: true, args };
        },

        // Join with separator
        join(sep, ...args) {
            return { __lsJoin: true, sep, args };
        },

        // Or
        or(...args) {
            return { __lsOr: true, args };
        },

        // Loop
        map(source, fn) {
            return { __lsMap: true, source, fn };
        }
    };

    return (templateBuilder, asString = false) => {

        // Builder now gets (symbolProxy, logic)
        let template = typeof templateBuilder === "function"
            ? templateBuilder(symbolProxy, logic)
            : templateBuilder;

        if (!Array.isArray(template)) {
            template = [template];
        }

        const lines = [];
        let varCounter = 0;
        const exports = [];

        function stripWhitespace(value) {
            return (value ?? "").toString().replace(/\s+/g, "");
        }

        const iterPrefix = "__iter__.";
        function dataRef(sym, iterVar) {
            const desc = stripWhitespace(sym && sym.description) || "";
            let prefix = "d.", key = desc;

            if (iterVar && desc.startsWith(iterPrefix)) {
                key = desc.slice(iterPrefix.length);
                prefix = `${iterVar}.`;
            }

            return `${prefix}${key.replace(/[^a-zA-Z0-9_$.]/g, "_").replace(/\.\.*/g, ".")}`;
        }

        function jsValue(value, iterVar = null) {
            if (typeof value === "symbol") return dataRef(value, iterVar);
            if (value === undefined) return "undefined";
            
            // Handle logic operations
            if (value && typeof value === "object") {
                if (value.__lsOr) {
                    const argExprs = value.args.map(arg => `(${jsValue(arg, iterVar)})`);
                    return argExprs.join(" || ");
                }
                if (value.__lsJoin) {
                    const argExprs = value.args.map(arg => jsValue(arg, iterVar));
                    return `[${argExprs.join(",")}].filter(Boolean).join(${JSON.stringify(value.sep)})`;
                }
                if (value.__lsConcat) {
                    const argExprs = value.args.map(arg => `String(${jsValue(arg, iterVar)})`);
                    return `(${argExprs.join(" + ")})`;
                }
            }
            
            return JSON.stringify(value);
        }

        function isIfNode(value) {
            return !!(value && typeof value === "object" && value.__lsIf);
        }

        function isMapNode(value) {
            return !!(value && typeof value === "object" && value.__lsMap);
        }

        function containsConditional(value) {
            if (isIfNode(value)) return true;
            if (Array.isArray(value)) return value.some(containsConditional);
            return false;
        }

        function textNodeExpr(value, iterVar = null) {
            return `document.createTextNode(${jsValue(value, iterVar)})`;
        }

        function conditionExpr(condition, iterVar = null) {
            return `!!(${jsValue(condition, iterVar)})`;
        }

        function getVarName(prefix = "e") {
            return `${prefix}${varCounter++}`;
        }

        function emitToArray(arrayVar, value, iterVar = null) {
            if (value === null || value === undefined) return;

            // If node
            if (isIfNode(value)) {
                const branches = value.branches || [];
                if (branches.length > 0) {
                    lines.push(`if(${conditionExpr(branches[0].condition, iterVar)}){`);
                    const branchValue = branches[0].value;
                    if (Array.isArray(branchValue)) {
                        for (const v of branchValue) emitToArray(arrayVar, v, iterVar);
                    } else {
                        emitToArray(arrayVar, branchValue, iterVar);
                    }
                    for (let i = 1; i < branches.length; i++) {
                        lines.push(`}else if(${conditionExpr(branches[i].condition, iterVar)}){`);
                        const branchValue = branches[i].value;
                        if (Array.isArray(branchValue)) {
                            for (const v of branchValue) emitToArray(arrayVar, v, iterVar);
                        } else {
                            emitToArray(arrayVar, branchValue, iterVar);
                        }
                    }
                    if (value.hasElse) {
                        lines.push(`}else{`);
                        const elseValue = value.elseValue;
                        if (Array.isArray(elseValue)) {
                            for (const v of elseValue) emitToArray(arrayVar, v, iterVar);
                        } else {
                            emitToArray(arrayVar, elseValue, iterVar);
                        }
                    }
                    lines.push(`}`);
                } else if (value.hasElse) {
                    const elseValue = value.elseValue;
                    if (Array.isArray(elseValue)) {
                        for (const v of elseValue) emitToArray(arrayVar, v, iterVar);
                    } else {
                        emitToArray(arrayVar, elseValue, iterVar);
                    }
                }
                return;
            }

            // Map node
            if (isMapNode(value)) {
                const arrVar = getVarName("a");
                const itVar = getVarName("i");
                // Build item template once with iterator symbol proxy
                const mapItemTemplate = value.fn?.(iterProxy, logic);

                lines.push(`var ${arrVar}=${jsValue(value.source)}||[];`);
                lines.push(`for(const ${itVar} of ${arrVar}){`);
                emitToArray(arrayVar, mapItemTemplate, itVar);
                lines.push(`}`);
                return;
            }

            if (Array.isArray(value)) {
                // Nested array is treated as a div wrapper
                const wrapperVar = getVarName();
                lines.push(`var ${wrapperVar}=document.createElement("div");`);
                for (const v of value) emitToElement(wrapperVar, v, iterVar);
                lines.push(`${arrayVar}.push(${wrapperVar});`);
                return;
            }

            if (typeof value === "string" || typeof value === "symbol" || typeof value === "number" || typeof value === "boolean") {
                lines.push(`${arrayVar}.push(${textNodeExpr(value, iterVar)});`);
                return;
            }

            if (typeof value !== "object") return;

            const nodeVar = processItem(value, null, iterVar);
            if (nodeVar) lines.push(`${arrayVar}.push(${nodeVar});`);
        }

        function emitToElement(parentVar, value, iterVar = null) {
            if (value === null || value === undefined) return;

            // If node
            if (isIfNode(value)) {
                const branches = value.branches || [];
                if (branches.length > 0) {
                    lines.push(`if(${conditionExpr(branches[0].condition, iterVar)}){`);
                    const branchValue = branches[0].value;
                    if (Array.isArray(branchValue)) {
                        for (const v of branchValue) emitToElement(parentVar, v, iterVar);
                    } else {
                        emitToElement(parentVar, branchValue, iterVar);
                    }
                    for (let i = 1; i < branches.length; i++) {
                        lines.push(`}else if(${conditionExpr(branches[i].condition, iterVar)}){`);
                        const branchValue = branches[i].value;
                        if (Array.isArray(branchValue)) {
                            for (const v of branchValue) emitToElement(parentVar, v, iterVar);
                        } else {
                            emitToElement(parentVar, branchValue, iterVar);
                        }
                    }
                    if (value.hasElse) {
                        lines.push(`}else{`);
                        const elseValue = value.elseValue;
                        if (Array.isArray(elseValue)) {
                            for (const v of elseValue) emitToElement(parentVar, v, iterVar);
                        } else {
                            emitToElement(parentVar, elseValue, iterVar);
                        }
                    }
                    lines.push(`}`);
                } else if (value.hasElse) {
                    const elseValue = value.elseValue;
                    if (Array.isArray(elseValue)) {
                        for (const v of elseValue) emitToElement(parentVar, v, iterVar);
                    } else {
                        emitToElement(parentVar, elseValue, iterVar);
                    }
                }
                return;
            }

            // Map node
            if (isMapNode(value)) {
                const arrVar = getVarName("a");
                const itVar = getVarName("i");

                const mapItemTemplate = value.fn?.(iterProxy, logic);

                lines.push(`var ${arrVar}=${jsValue(value.source)}||[];`);
                lines.push(`for(const ${itVar} of ${arrVar}){`);
                emitToElement(parentVar, mapItemTemplate, itVar);
                lines.push(`}`);
                return;
            }

            if (Array.isArray(value)) {
                // Nested array is treated as a div wrapper
                const wrapperVar = getVarName();
                lines.push(`var ${wrapperVar}=document.createElement("div");`);
                for (const v of value) emitToElement(wrapperVar, v, iterVar);
                lines.push(`${parentVar}.appendChild(${wrapperVar});`);
                return;
            }

            if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
                lines.push(`${parentVar}.appendChild(${textNodeExpr(value, iterVar)});`);
                return;
            }

            if (typeof value === "symbol") {
                lines.push(`${parentVar}.appendChild(LS.__dynamicInnerToNode(${jsValue(value, iterVar)}));`);
                return;
            }

            if (typeof value !== "object") return;

            const nodeVar = processItem(value, null, iterVar);
            if (nodeVar) lines.push(`${parentVar}.appendChild(${nodeVar});`);
        }

        function processItem(item, assignTo = null, iterVar = null) {
            // Dynamic symbol node
            if (typeof item === "symbol") {
                const dynVar = assignTo || getVarName("dyn");
                const valueExpr = jsValue(item, iterVar);
                lines.push(`var ${dynVar}=LS.__dynamicInnerToNode(${valueExpr});`);
                return dynVar;
            }

            // Text node
            if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
                if (assignTo) {
                    lines.push(`var ${assignTo}=document.createTextNode(${jsValue(item, iterVar)});`);
                    return assignTo;
                }
                return `document.createTextNode(${jsValue(item, iterVar)})`;
            }

            // Skip invalid items
            if (typeof item !== "object" || item === null) {
                return null;
            }

            if (isIfNode(item)) {
                throw new Error("CompileTemplate error: conditional nodes (logic.if) must be used as children/root values, not as an element object.");
            }

            if (typeof Element !== "undefined" && item instanceof Element) {
                throw new Error("CompileTemplate error: you can't pass a live Element to a template.");
            }

            const {
                tag, tagName: tn, __exportName,
                class: className, tooltip, ns, accent, style,
                inner, content: innerContent, reactive,
                attr, options, attributes,
                ...rest
            } = item;

            const tagName = tag || tn || "div";
            const varName = assignTo || getVarName();
            const needsExport = !!__exportName;

            // Create element
            if (ns) {
                lines.push(`var ${varName}=document.createElementNS(${JSON.stringify(ns)},${JSON.stringify(tagName)});`);
            } else {
                lines.push(`var ${varName}=document.createElement(${JSON.stringify(tagName)});`);
            }

            // Track exports
            if (needsExport) {
                exports.push({ name: __exportName, varName });
            }

            // Apply direct properties (innerHTML, textContent, id, etc.)
            for (const [key, value] of Object.entries(rest)) {
                if (typeof value === "function") {
                    console.warn(`CompileTemplate: function property "${key}" will be ignored`);
                } else if (value !== null && value !== undefined) {
                    lines.push(`${varName}.${key}=${jsValue(value, iterVar)};`);
                }
            }

            // Handle accent attribute
            if (accent) {
                lines.push(`${varName}.setAttribute("ls-accent",${jsValue(accent, iterVar)});`);
            }

            // Handle tooltip
            if (tooltip) {
                lines.push(`${varName}.setAttribute("ls-tooltip",${jsValue(tooltip, iterVar)});LS.Tooltips.updateElement(${varName});`);
            }

            // Handle reactive bindings
            if (reactive) {
                lines.push(`if(!LS.Reactive){LS.on&&LS.on("component-loaded",(c)=>{if(c&&c.name&&c.name.toLowerCase&&c.name.toLowerCase()==="reactive"){LS.Reactive.bindElement(${varName},${jsValue(reactive, iterVar)});return LS.REMOVE_LISTENER;}});}else{LS.Reactive.bindElement(${varName},${jsValue(reactive, iterVar)});}`);
            }

            // Handle attributes
            const attrs = attr || attributes;
            if (attrs) {
                if (Array.isArray(attrs)) {
                    for (const a of attrs) {
                        if (typeof a === "string") {
                            lines.push(`${varName}.setAttribute(${JSON.stringify(a)},"");`);
                        } else if (typeof a === "object" && a !== null) {
                            for (const [aKey, aValue] of Object.entries(a)) {
                                lines.push(`${varName}.setAttribute(${JSON.stringify(aKey)},${jsValue(aValue ?? "", iterVar)});`);
                            }
                        }
                    }
                } else if (typeof attrs === "object") {
                    for (const [aKey, aValue] of Object.entries(attrs)) {
                        lines.push(`${varName}.setAttribute(${JSON.stringify(aKey)},${jsValue(aValue ?? "", iterVar)});`);
                    }
                }
            }

            // Handle className
            if (className) {
                if (Array.isArray(className)) {
                    lines.push(`${varName}.className=${JSON.stringify(className.filter(Boolean).join(" "))};`);
                } else {
                    lines.push(`${varName}.className=${jsValue(className, iterVar)};`);
                }
            }

            // Handle style
            if (style) {
                if (typeof style === "string") {
                    lines.push(`${varName}.style.cssText=${JSON.stringify(style)};`);
                } else if (typeof style === "object") {
                    const styleEntries = Object.entries(style);
                    if (styleEntries.length > 0) {
                        const staticParts = [];
                        const dynamicParts = [];

                        for (const [rule, value] of styleEntries) {
                            const prop = rule.startsWith("--") ? rule : rule.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
                            if (typeof value === "symbol") {
                                dynamicParts.push({ prop, value });
                            } else {
                                staticParts.push(`${prop}:${value}`);
                            }
                        }

                        if (dynamicParts.length === 0) {
                            lines.push(`${varName}.style.cssText=${JSON.stringify(staticParts.join(";"))};`);
                        } else if (staticParts.length === 0) {
                            const parts = dynamicParts.map(d => `${JSON.stringify(d.prop + ":")}+${dataRef(d.value, iterVar)}`);
                            lines.push(`${varName}.style.cssText=${parts.join('+";"+')};`);
                        } else {
                            const dynamicExprs = dynamicParts.map(d => `${JSON.stringify(";" + d.prop + ":")}+${dataRef(d.value, iterVar)}`);
                            lines.push(`${varName}.style.cssText=${JSON.stringify(staticParts.join(";"))}+${dynamicExprs.join("+")};`);
                        }
                    }
                }
            }

            // Handle ls-select options
            if (tagName.toLowerCase() === "ls-select" && options) {
                lines.push(`${varName}._lsSelectOptions=${jsValue(options, iterVar)};`);
            }

            // Handle children
            const contentToAdd = inner || innerContent;
            if (contentToAdd !== undefined && contentToAdd !== null) {
                if(contentToAdd.__lsOr) {
                    throw new Error("CompileTemplate error: logic.or cannot be used as element content via inner at this time. Consider { textContent: logic.or(...) } or logic.if(a, b, c) instead.");
                }

                // Map node as child content
                if (isMapNode(contentToAdd)) {
                    emitToElement(varName, contentToAdd, iterVar);
                } else if (typeof contentToAdd === "symbol") {
                    lines.push(`${varName}.append(LS.__dynamicInnerToNode(${dataRef(contentToAdd, iterVar)}));`);
                } else if (typeof contentToAdd === "string") {
                    lines.push(`${varName}.textContent=${jsValue(contentToAdd, iterVar)};`);
                } else if (typeof contentToAdd === "number") {
                    lines.push(`${varName}.textContent=${JSON.stringify(String(contentToAdd))};`);
                } else {
                    const children = Array.isArray(contentToAdd) ? contentToAdd : [contentToAdd];
                    const validChildren = children.filter(c => c !== null && c !== undefined);
                    const hasConditional = validChildren.some(containsConditional);

                    if (hasConditional) {
                        for (const child of validChildren) {
                            emitToElement(varName, child, iterVar);
                        }
                    } else {
                        if (validChildren.length === 1) {
                            const child = validChildren[0];
                            if (typeof child === "string" || typeof child === "symbol") {
                                const childExpr = processItem(child, null, iterVar);
                                if (childExpr) {
                                    lines.push(`${varName}.appendChild(${childExpr});`);
                                }
                            } else if (Array.isArray(child)) {
                                emitToElement(varName, child, iterVar);
                            } else {
                                const childVar = processItem(child, null, iterVar);
                                if (childVar) {
                                    lines.push(`${varName}.appendChild(${childVar});`);
                                }
                            }
                        } else if (validChildren.length > 1) {
                            const childRefs = [];
                            for (const child of validChildren) {
                                if (typeof child === "string" || typeof child === "symbol") {
                                    const expr = processItem(child, null, iterVar);
                                    if (expr) childRefs.push(expr);
                                } else if (Array.isArray(child)) {
                                    const wrapperVar = getVarName();
                                    lines.push(`var ${wrapperVar}=document.createElement("div");`);
                                    for (const v of child) emitToElement(wrapperVar, v, iterVar);
                                    childRefs.push(wrapperVar);
                                } else {
                                    const childVar = processItem(child, null, iterVar);
                                    if (childVar) childRefs.push(childVar);
                                }
                            }
                            if (childRefs.length > 0) {
                                lines.push(`${varName}.append(${childRefs.join(",")});`);
                            }
                        }
                    }
                }
            }

            return varName;
        }

        // Check if root structure is known at compile time (no conditionals at root level)
        const rootHasConditional = template.some(containsConditional);

        if (rootHasConditional) {
            lines.push(`var __root=[];`);
            for (const item of template) {
                emitToArray(`__root`, item, null);
            }
            lines.push(`var __rootValue=__root.length===1?__root[0]:__root;`);
        } else {
            if (template.length === 1) {
                const item = template[0];
                if (Array.isArray(item)) {
                    const wrapperVar = getVarName();
                    lines.push(`var ${wrapperVar}=document.createElement("div");`);
                    for (const v of item) emitToElement(wrapperVar, v, null);
                    lines.push(`var __rootValue=${wrapperVar};`);
                } else if (typeof item === "string" || typeof item === "symbol") {
                    lines.push(`var __rootValue=${textNodeExpr(item, null)};`);
                } else {
                    const rootVar = processItem(item, null, null);
                    lines.push(`var __rootValue=${rootVar};`);
                }
            } else if (template.length > 1) {
                const rootRefs = [];
                for (const item of template) {
                    if (Array.isArray(item)) {
                        const wrapperVar = getVarName();
                        lines.push(`var ${wrapperVar}=document.createElement("div");`);
                        for (const v of item) emitToElement(wrapperVar, v, null);
                        rootRefs.push(wrapperVar);
                    } else if (typeof item === "string" || typeof item === "symbol") {
                        const nodeVar = getVarName();
                        lines.push(`var ${nodeVar}=${textNodeExpr(item, null)};`);
                        rootRefs.push(nodeVar);
                    } else {
                        const nodeVar = processItem(item, null, null);
                        if (nodeVar) rootRefs.push(nodeVar);
                    }
                }
                lines.push(`var __rootValue=[${rootRefs.join(",")}];`);
            } else {
                lines.push(`var __rootValue=null;`);
            }
        }

        // Build return object
        const retParts = [];
        for (const exp of exports) {
            retParts.push(`${JSON.stringify(exp.name)}:${exp.varName}`);
        }

        retParts.push(`root:__rootValue`);

        lines.push(`return{${retParts.join(",")}};`);

        const fnBody = `'use strict';${lines.join("")}`;

        if (asString) return `function(d){${fnBody}}`;

        try {
            return new Function("d", fnBody);
        } catch (e) {
            console.error("CompileTemplate error:", e, "\nGenerated code:", fnBody);
            throw e;
        }
    }
})();