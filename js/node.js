/**
 * Universal generioc I/O node for LS.
 * @version 1.0.0
 * 
 * How is this different from simple EventHandler?
 * Not much, but it allows for a consistent way to send data across unrelated nodes using custom protocols and connect in a tree structure.
 * Your main application can have a main input/output node, and then different components or even 3rd party plugins can interact with it using a standard protocol.
 * For example, a DAW could use this to allow plugins to communicate with each other.
 * LS.Patcher is compatible with LS.Node too.
 * 
 * Example workflow:
 * @example
 * const main = new LS.Node({
 *     onSignal (signal, data, sender) {
 *         switch (signal) {
 *             case "audio":
 *               // Play audio data
 *               break;
 *         }
 *     }
 * });
 * 
 * const audio_processor = new LS.Node({
 *     onSignal (signal, data, sender) {
 *         switch (signal) {
 *             case "audio":
 *               // Process audio data
 *               this.output("audio", processedData);
 *               break;
 *         }
 *     }
 * });
 * 
 * main.addChild(audio_processor);
 * 
 * // The following code could be made independently of the main application:
 * const plugin = new LS.Node({
 *     onSignal (signal, data, sender) {
 *         switch (signal) {
 *              case "start":
 *                 // Start processing
 *                 this.output("audio", <audio_data>);
 *                 break;
 *         }
 *     }
 * });
 * 
 * // And the main application can simply connect it:
 * audio_processor.addChild(plugin);
 * audio_processor.send("start");
 */

LS.LoadComponent(class Node extends LS.EventHandler {
    constructor(options = {}) {
        super();

        if (typeof options.onSignal === "function") {
            this.on("signal", options.onSignal);
        }

        this.signalEmitter = this.prepareEvent("signal");

        if(options.hasChildren) {
            this.children = [];
        }

        this.parent = null;
    }

    send(signal, data, propagate = true, sender = null) {
        this.quickEmit(this.signalEmitter, [signal, data, sender || this]);
        if (propagate && this.children) for (const child of this.children) {
            child.send(signal, data, propagate, this);
        }
    }

    output(signal, data) {
        if (this.parent) {
            this.parent.send(signal, data, this);
        }
    }

    addChild(child) {
        if (!(child instanceof Node)) {
            throw new Error("Child must be an instance of Node");
        }

        if (!this.children) return;

        if (child.parent) {
            child.parent.removeChild(child);
        }

        this.children.push(child);
        child.parent = this;

        this.emit("childAdded", [child]);
        return this;
    }

    removeChild(child) {
        if (!this.children) return;

        const index = this.children.indexOf(child);
        if (index === -1) return;

        this.children.splice(index, 1);
        child.parent = null;

        this.emit("childRemoved", child);
    }
}, { name: "Node", global: true });
