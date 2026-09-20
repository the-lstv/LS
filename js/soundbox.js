/**
 * SoundBox class
 * 
 * Lightweight utility for playing and managing sounds/sfx and other simple audio with user-overridable sound packs.
 * A revamped & modernized version of my old jukebox.js mini-library.
 * 
 * Sounds are first registered, then loaded on-demand and cached & can be shared between instances.
 * Supports fallbacks, scopes, custom controls, and effects.
 * 
 * @param {Object} options - The options for the SoundBox.
 * @param {number} options.volume - The global volume of the SoundBox.
 * @param {SoundBox} parent - Optional parent SoundBox. Will inherit the sound map but have its own volume and threads for context isolation.
 * @param {string} nameScope - Optional scope for sound names to also isolate created sounds under a namespace.
 * 
 * @example
 * const soundBox = new LS.SoundBox({
 *     volume: 0.8,
 *     sounds: {
 *         "click": { src: "./click.ogg", fallback: ["./click.mp3"] },
 *         "music": { src: "./music.ogg" },
 *     }
 * });
 * 
 * // You can register, unregister, update, and load sounds as needed.
 * 
 * // Simple playback
 * soundBox.play("click");
 * 
 * // Creating custom threads
 * const bgmThread = await soundBox.createThread("music", { volume: 0.5, loop: true, fadeIn: 0.5, fadeOut: 0.5, speed: 1.5, offset: 0, duration: 2 });
 * bgmThread.play();
 * // You can control the thread
 * 
 * soundBox.stopAll();
 * soundBox.destroy();
 */
class SoundBox {
    static { LS.register(this, { name: "SoundBox", global: true }) }

    constructor(options = {}, parent = null, nameScope = null) {
        this.parent = parent;
        this.nameScope = nameScope;

        this.ctx =      parent? parent.ctx: new (window.AudioContext || window.webkitAudioContext)();
        this.soundMap = parent? parent.soundMap: new Map();
        this.threads =  new Set();

        // Global gain node for controlling volume of all sounds played through this SoundBox
        this.gainNode = this.ctx.createGain();
        this.gainNode.connect(this.ctx.destination);

        this.setVolume(options.volume ?? 1);

        if(options.sounds) {
            this.registerMany(options.sounds);
        }

        if(options.logger) {
            this.log = options.logger;
        } else this.log = LS.DEFAULT_LOG_OUTPUT;

        if(this.parent) {
            this.parent.once("destroy", () => this.destroy());
        }
    }

    /**
     * Sets the volume of all sounds played through this SoundBox.
     * @param {number} volume The volume to set, between 0 and 1.
     */
    setVolume(volume = 1) {
        this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
    }

    get volume() {
        return this.gainNode.gain.value;
    }

    set volume(value) {
        this.setVolume(value);
    }

    /**
     * Creates a new sound thread. Loads the sound if it is not already loaded.
     * @param {*} soundName The name of the sound to play. Must be registered first.
     * @param {*} options Options for the sound thread. Can include volume, loop, playbackRate, etc.
     * @returns {Promise<SoundBoxThread>} A promise that resolves to a SoundBoxThread instance.
     */
    async createThread(soundName, options = {}) {
        let sound = this.soundMap.get(soundName);
        if(!sound) {
            this.log.error("Sound not found:", soundName);
            return null;
        }

        if(!sound.buffer) {
            await this.load(soundName);
            if(!sound.buffer) {
                return;
            }
        }

        const thread = new SoundBoxThread(this, sound, options);
        return thread;
    }

    /**
     * Helper that plays a sound by creating a thread and starting it. It will load the sound if it is not already loaded.
     * @param {*} soundName The name of the sound to play. Must be registered first.
     * @param {*} options Options for the sound thread. Can include volume, loop, playbackRate, etc.
     * @returns {Promise<void>} A promise that resolves when the sound is played.
     */
    async play(soundName, options = {}) {
        options ??= {};
        options.ephemeral ??= true;
        options.autoPlay  ??= true;

        const thread = await this.createThread(soundName, options);
        if(!thread) {
            this.log.error("Failed to create sound thread for:", soundName);
            return;
        }
        return thread;
    }

    /**
     * Registers a sound with the SoundBox.
     * @param {*} soundName The name of the sound to register.
     * @param {*} options Options for the sound. Can include src (URL), volume, loop, etc.
     */
    register(soundName, options) {
        if(!soundName || typeof soundName !== "string") {
            this.log.error("Sound name must be a non-empty string.");
            return;
        }

        if(this.nameScope) {
            soundName = `${this.nameScope}:${soundName}`;
        }

        if(this.soundMap.has(soundName)) {
            this.log.warn("Sound already registered:", soundName);
            return;
        }

        if(typeof options === "string") {
            options = { src: options };
        }

        this.soundMap.set(soundName, options);
    }

    /**
     * Registers multiple sounds at once.
     * @param {Object} sounds - An object where keys are sound names and values are options.
     */
    registerMany(sounds) {
        for(const [soundName, options] of Object.entries(sounds)) {
            this.register(soundName, options);
        }
    }

    unregister(soundName) {
        if(this.nameScope) {
            soundName = `${this.nameScope}:${soundName}`;
        }

        if(!this.soundMap.has(soundName)) {
            this.log.warn("Sound not registered:", soundName);
            return;
        }

        this.soundMap.delete(soundName);
    }

    /**
     * Unregisters multiple sounds at once.
     * @param {string[]} soundNames - An array of sound names to unregister.
     */
    unregisterMany(soundNames) {
        for(const soundName of soundNames) {
            this.unregister(soundName);
        }
    }

    update(soundName, options) {
        if(this.nameScope) {
            soundName = `${this.nameScope}:${soundName}`;
        }

        const existingOptions = this.soundMap.get(soundName);
        if(!existingOptions) {
            this.log.warn("Sound not registered:", soundName);
            return;
        }

        Object.assign(existingOptions, options);
    }

    updateMany(sounds) {
        for(const [soundName, options] of Object.entries(sounds)) {
            this.update(soundName, options);
        }
    }

    /**
     * Loads a sound into the SoundBox. If the sound is already loaded, it will not reload it.
     * @param {*} soundName The name of the sound to load.
     * @returns {Promise<boolean>} Returns true if the sound is playable, false if something went wrong.
     */
    async load(soundName, _fallbackIndex = -1) {
        const sound = this.soundMap.get(soundName);

        if(!sound) {
            this.log.error("Sound not found:", soundName);
            return false;
        }

        if(sound.buffer && sound.__lastSrc === sound.src) return true;

        try {
            const src = _fallbackIndex < 0? sound.src: (this.soundMap.get(sound.fallback[_fallbackIndex])?.src);
            if(!src) throw "No available source";

            const response = await fetch(src);
            const arrayBuffer = await response.arrayBuffer();
            sound.buffer = await this.ctx.decodeAudioData(arrayBuffer);
            sound.__lastSrc = src;
            return true;
        } catch (e) {
            if(Array.isArray(sound.fallback) && sound.fallback.length > (_fallbackIndex + 1)) {
                _fallbackIndex ++;
                this.log.error("Failed to load sound:", soundName, ", trying to fallback to next alternative: ", sound.fallback[_fallbackIndex], e);
                return await this.load(soundName, _fallbackIndex);
            }

            this.log.error("Failed to load sound:", soundName, e);
            return false;
        }
    }

    async loadAll() {
        const loadPromises = [];
        for(const [soundName, sound] of this.soundMap.entries()) {
            loadPromises.push(this.load(soundName));
        }
        await Promise.all(loadPromises);
    }

    stopAll(id = null) {
        for(const thread of this.threads) {
            if(id === null || thread.userId === id) {
                thread.terminate();
            }
        }
        this.threads.clear();
    }

    pauseAll(id = null) {
        for(const thread of this.threads) {
            if(id === null || thread.userId === id) {
                thread.pause();
            }
        }
    }

    resumeAll(id = null) {
        for(const thread of this.threads) {
            if(id === null || thread.userId === id) {
                thread.resume();
            }
        }
    }

    createScope(options, nameScope) {
        return new SoundBox(options, this, nameScope);
    }

    destroy() {
        if(this.destroyed) return;
        this.destroyed = true;

        this.stopAll();

        this.soundMap.clear();
        this.soundMap = null;

        if(this.ctx) {
            this.ctx.close();
            this.ctx = null;
        }
    }
}

/**
 * SoundBoxThread class
 * Represents a single sound thread that can be played, stopped, and controlled.
 * 
 * This class has no awareness of loading or managing media, it simply provides an interface for controlling an existing sound buffer.
 */
class SoundBoxThread {
    created   = false;
    source    = null;
    gainNode  = null;
    outputNode = null;

    __volume = 1;
    __speed = 1;
    __loop = false;

    destroyed = false;

    constructor(parent, sound, options = {}) {
        if(!(parent instanceof SoundBox) || !sound) {
            throw new Error("SoundBoxThread requires a parent SoundBox and a source.");
        }

        this.parent  = parent;
        this.sound   = sound;
        this.options = options ?? {};
        this.parent.threads.add(this);

        this._requiresGainNode =
            this.volume !== 1 ||
            this.options.fadeIn ||
            this.options.fadeOut ||
            this.options.effects?.length > 0;

        this.__volume = this.options.volume ?? 1;
        this.__speed  = this.options.speed  ?? 1;
        this.__loop   = this.options.loop   ?? false;

        this.userId = this.options.userId ?? null;

        // this.span = [0, -1];

        if(this.options.autoPlay) {
            this.play();
        } else if(this.options.autoCreate) {
            this.create();
        }
    }

    /**
     * Creates (or reloads) the audio context for the sound thread.
     */
    create() {
        if(this.destroyed) {
            throw new Error("Cannot initialize a destroyed SoundBoxThread.");
        }

        this.disposeSource();
        this.source = this.parent.ctx.createBufferSource();
        this.source.buffer = this.sound.buffer;

        // This sets the destination, so it needs to be done first.
        this.volume = this.__volume;

        if(Array.isArray(this.options.effects) && this.options.effects.length > 0) {
            for(const effect of this.options.effects) {
                if(effect instanceof AudioNode) {
                    this.source.connect(effect);
                    effect.connect(this.outputNode);
                } else {
                    this.log.error("Invalid effect provided to SoundBoxThread:", effect);
                }
            }
        }

        this.source.connect(this.outputNode);

        this.loop   = this.__loop;
        this.speed  = this.__speed;

        this.created = true;
    }

    /**
     * Plays the sound thread from a specific offset and for a specific duration.
     * Can be called multiple times to play the sound again.
     * @param {number} offset - The offset in seconds to start playing from.
     * @param {number} duration - The duration in seconds to play. If negative, plays the entire sound.
     */
    play(offset = this.options.offset ?? 0, duration = this.options.duration ?? -1) {
        if(this.destroyed) {
            throw new Error("Cannot play a destroyed SoundBoxThread.");
        }

        // Sadly the API was desgined by a r*tard so we have to recreate the source every time we play a sound.
        // if(!this.created) this.create();
        this.create();

        if(duration < 0) {
            duration = this.duration;
        }

        if(this.options.fadeIn) {
            this.gainNode.gain.setValueAtTime(0, this.parent.ctx.currentTime);
            this.gainNode.gain.linearRampToValueAtTime(this.volume, this.parent.ctx.currentTime + this.options.fadeIn);
        }

        this.source.start(0, offset, duration);

        if(this.options.fadeOut) {
            this.source.stop(this.parent.ctx.currentTime + duration);
            this.gainNode.gain.setValueAtTime(this.volume, this.parent.ctx.currentTime + duration - this.options.fadeOut);
            this.gainNode.gain.linearRampToValueAtTime(0, this.parent.ctx.currentTime + duration);
        }

        this.completedPromise().then(() => {
            if(this.destroyed) return;

            if(this.options.ephemeral) {
                // Terminate & delete the thread after the sound has finished playing.
                this.terminate();
            } else {
                // We could reuse the node but we can't.
                this.source.disconnect();
                this.source = null;
            }
        });
    }

    completedPromise() {
        if(!this.source) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            this.source.onended = () => {
                resolve();
            };
        });
    }

    get duration() {
        if(!this.source) {
            return 0;
        }
        return this.source.buffer?.duration || 0;
    }

    get volume() {
        return this.__volume ?? 1;
    }

    set volume(value) {
        value = Math.max(0, Math.min(1, value ?? 1));

        this.__volume = value;
        if(this.gainNode) {
            this.gainNode.gain.value = value;
            this.outputNode = this.gainNode;
            return;
        }

        if(value === 1 && !this._requiresGainNode) {
            // We can skip creating a gain node if the volume is 1.
            this.gainNode = null;
            this.outputNode = this.parent.gainNode;
            return;
        }

        this.gainNode = this.parent.ctx.createGain();
        this.gainNode.gain.value = value;
        this.gainNode.connect(this.parent.gainNode);
        this.outputNode = this.gainNode;
    }

    get loop() {
        return this.__loop;
    }

    set loop(value) {
        this.__loop = !!value;
        if(this.source) {
            this.source.loop = this.__loop;
        }
    }

    get speed() {
        return this.__speed;
    }

    set speed(value) {
        if(!this.source) return;
        this.source.playbackRate.value = value;
        this.__speed = this.source.playbackRate.value;
    }

    pause() {
        if(!this.source) return;
        this.source.playbackRate.value = 0;
    }

    resume() {
        if(!this.source) return;
        this.source.playbackRate.value = this.__speed;
    }

    stop() {
        if(!this.source) return;
        try {
            this.source.stop();
        } catch (e) {
            console.error("Error stopping audio source:", e);
        }
    }

    disposeSource() {
        this.stop();
        if(this.source) {
            this.source.disconnect();
            this.source = null;
        }
    }

    terminate() {
        this.disposeSource();

        if(this.gainNode) {
            this.gainNode.disconnect();
            this.gainNode = null;
        }

        this.parent.threads.delete(this);
        this.parent = null;
        this.sound = null;
        this.options = null;
        this.created = false;
        this.source = null;
        this.outputNode = null;
        this.destroyed = true;
    }
}

/*@ls-export*/ if (typeof module !== "undefined" && module.exports) {
    module.exports = { SoundBox, SoundBoxThread };
}