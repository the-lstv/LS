/**
 * Extras for LS.GL
 * 
 * @namespace LS.GL
 * @version 2.0.0-alpha.0
 * 
 * ! This is an early stage component.
 */

const SDi = LS.GL.SDi;

const op = {
    add: (a, b) => a + b,
    sub: (a, b) => a - b,
    mul: (a, b) => a * b,
    div: (a, b) => a / b,
};

class Sprite {
    /**
     * The texture used by the sprite.
     * @type {Texture}
     */
    texture = null;

    /**
     * @type {number[]} data Packed array
     * Its efficient i guess; also could later use typed or subarrays
     */
    data = [
        /*x*/                 0,
        /*y*/                 0,
        /*z*/                 0,
        /*rx*/                0,
        /*ry*/                0,
        /*rz*/                0,
        /*sx*/                1,
        /*sy*/                1,
        /*sz*/                1,
        /*anchorX*/           0,
        /*anchorY*/           0,
        /*anchorZ*/           0,
        /*offsetX*/           0,
        /*offsetY*/           0,
        /*offsetZ*/           0,
        /*w*/                -1,
        /*h*/                -1,
        /*d*/                 1,
        /*transformFlags*/    0,
        /*visible*/           1,
        /*r*/                 255,
        /*g*/                 255,
        /*b*/                 255,
        /*a*/                 255,
        /*alphaMultiplier*/   1.0,
    ];

    /**
     * @type {Float32Array} 4x4 transformation matrix
     */
    _transformMatrix = null;
    matrixDirty = true;

    /**
     * @type {Container|null} Parent container
     */
    parent = null;

    /**
     * @typedef SpriteOptions
     * @property {Texture} [texture] The texture object to use for the sprite
     * @property {number[]} [position] The position of the sprite [x, y, z]
     * @property {number} [offset] The offset of the sprite [x, y, z]
     * @property {number[]} [size] The size of the sprite [width, height, depth]
     * @property {number[]} [color] The color of the sprite [r, g, b, a]
     * @property {number[]} [rotation] The rotation of the sprite [rx, ry, rz]
     * @property {number[]} [scale] The scale of the sprite [sx, sy, sz]
     * @property {boolean} [visible] Whether the sprite is visible or not
     * @property {number[]} [anchor] The anchor point of the sprite [anchorX, anchorY, anchorZ]
     * @property {number} [x] The x position of the sprite
     * @property {number} [y] The y position of the sprite
     * @property {number} [z] The z position of the sprite
     * @property {number} [offsetX] The x offset of the sprite
     * @property {number} [offsetY] The y offset of the sprite
     * @property {number} [offsetZ] The z offset of the sprite
     * @property {number} [anchorX] The x anchor point of the sprite
     * @property {number} [anchorY] The y anchor point of the sprite
     * @property {number} [anchorZ] The z anchor point of the sprite
     * @property {number} [scaleX] The x scale of the sprite
     * @property {number} [scaleY] The y scale of the sprite
     * @property {number} [scaleZ] The z scale of the sprite
     * @property {number} [rotationX] The x rotation of the sprite
     * @property {number} [rotationY] The y rotation of the sprite
     * @property {number} [rotationZ] The z rotation of the sprite
     * @property {number} [width] The width of the sprite
     * @property {number} [height] The height of the sprite
     * @property {number} [depth] The depth of the sprite
     * @property {number} [colorR] The red component of the sprite's color (0-255)
     * @property {number} [colorG] The green component of the sprite's color (0-255)
     * @property {number} [colorB] The blue component of the sprite's color (0-255)
     * @property {number} [colorA] The alpha component of the sprite's color (0-255)
     * @property {number} [opacity] The opacity of the sprite (0.0 - 1.0); Warning; this currently sets the alpha on the color
    */

    /**
     * Abstract base sprite class for 2D/3D sprites.
     * In QuickSand, most surfaces/groups/3d objects resolve to sprites which handle their position, how they are then actually rendered is up to individual renderers.
     * This class on it's own is mostly virtual, only holds a single number array & texture reference, which makes it a low-overhead object.
     * 
     * @param {SpriteOptions} options Options for the sprite
     * 
     * @example
     * const mySprite = new Sprite({ texture: new Texture(myAsset), position: [100, 200], size: [50, 50] });
     */
    constructor(options) {
        if(options) this.setOptions(options);
    }

    static fromArray(data, texture = null, copy = false) {
        const sprite = new Sprite();
        sprite.data = copy? data.slice(): data;
        sprite.texture = texture;
        return sprite;
    }

    /**
     * Clones the sprite
     * @returns {Sprite} The cloned sprite
     */
    clone(options = {}, into = new Sprite()) {
        into.data = this.data.slice();
        into.texture = this.texture;
        if(options) into.setOptions(options);
        return into;
    }

    /**
     * Checks if a point is contained within the sprite.
     * @param {number} px - X coordinate of the point
     * @param {number} py - Y coordinate of the point
     * @param {number} pz - Z coordinate of the point
     * @returns {boolean} True if the point is contained within the sprite, false otherwise
     */
    containsPoint(px, py, pz = null) {
        // todo :P
        return this.containsPointSimple(px, py, pz);
    }

    /**
     * Checks if a point is contained within the sprite (WITHOUT taking rotation/skew into account; works only if the sprite is facing the camera)
     * @param {number} x - X coordinate of the point
     * @param {number} y - Y coordinate of the point
     * @param {number} z - Z coordinate of the point
     * @returns {boolean} True if the point is contained within the sprite, false otherwise
     */
    containsPointSimple(x, y, z = null) {
        const w = this.width  * this.scaleX;
        const h = this.height * this.scaleY;
        const d = this.depth  * this.scaleZ;

        const wX = this.worldX;
        const wY = this.worldY;
        const wZ = this.worldZ;

        return x >= wX && x <= wX + w &&
               y >= wY && y <= wY + h &&
               (z === null || (z >= wZ && z <= wZ + d));
    }

    /**
     * Set options for sprite.
     * @param {SpriteOptions} options Options to apply to the sprite
     */
    setOptions(options) {
        if(options.texture)               this.texture = options.texture;

        if(options.position)              this.setPosition(options.position);
        if(options.offset)                this.setOffset(options.offset);
        if(options.size)                  this.setSize(options.size);
        if(options.color)                 this.setColor(options.color);
        if(options.rotation)              this.setRotation(options.rotation);
        if(options.scale)                 this.setScale(options.scale);
        if(options.visible !== undefined) this.visible = options.visible? 1: 0;
        if(options.anchor)                this.setAnchor(options.anchor);
        if(options.texture)               this.texture = options.texture;
        if(options.opacity !== undefined) this.opacity = options.opacity;

        if(options.x !== undefined)         this.x           = options.x;
        if(options.y !== undefined)         this.y           = options.y;
        if(options.z !== undefined)         this.z           = options.z;
        if(options.offsetX !== undefined)   this.offsetX     = options.offsetX;
        if(options.offsetY !== undefined)   this.offsetY     = options.offsetY;
        if(options.offsetZ !== undefined)   this.offsetZ     = options.offsetZ;
        if(options.anchorX !== undefined)   this.anchorX     = options.anchorX;
        if(options.anchorY !== undefined)   this.anchorY     = options.anchorY;
        if(options.anchorZ !== undefined)   this.anchorZ     = options.anchorZ;
        if(options.scaleX !== undefined)    this.scaleX      = options.scaleX;
        if(options.scaleY !== undefined)    this.scaleY      = options.scaleY;
        if(options.scaleZ !== undefined)    this.scaleZ      = options.scaleZ;
        if(options.rotationX !== undefined) this.rotationX   = options.rotationX;
        if(options.rotationY !== undefined) this.rotationY   = options.rotationY;
        if(options.rotationZ !== undefined) this.rotationZ   = options.rotationZ;
        if(options.width !== undefined)     this.width       = options.width;
        if(options.height !== undefined)    this.height      = options.height;
        if(options.depth !== undefined)     this.depth       = options.depth;
        if(options.colorR !== undefined)    this.data[SDi.r] = options.colorR;
        if(options.colorG !== undefined)    this.data[SDi.g] = options.colorG;
        if(options.colorB !== undefined)    this.data[SDi.b] = options.colorB;
        if(options.colorA !== undefined)    this.data[SDi.a] = options.colorA;
    }

    get width()      { return this.data[SDi.width] < 0 && this.texture? this.texture.width: this.data[SDi.width]; }
    set width(value) { this.data[SDi.width] = value; }
    
    get height()      { return this.data[SDi.height] < 0 && this.texture? this.texture.height: this.data[SDi.height]; }
    set height(value) { this.data[SDi.height] = value; }

    get depth()      { return this.data[SDi.depth]; }
    set depth(value) { this.data[SDi.depth] = value; }

    get x()      { return this.data[SDi.x]; }
    set x(value) { this.data[SDi.x] = value; this._updatePosition(0); }

    get y()      { return this.data[SDi.y]; }
    set y(value) { this.data[SDi.y] = value; this._updatePosition(1); }

    get z()      { return this.data[SDi.z]; }
    set z(value) { this.data[SDi.z] = value; this._updatePosition(2); }

    get offsetX()      { return this.data[SDi.offsetX]; }
    set offsetX(value) { this.data[SDi.offsetX] = value; this._updatePosition(0); }

    get offsetY()      { return this.data[SDi.offsetY]; }
    set offsetY(value) { this.data[SDi.offsetY] = value; this._updatePosition(1); }

    get offsetZ()      { return this.data[SDi.offsetZ]; }
    set offsetZ(value) { this.data[SDi.offsetZ] = value; this._updatePosition(2); }

    get worldX() { return this._worldMatrix? this._worldMatrix[12]: this.x; }
    get worldY() { return this._worldMatrix? this._worldMatrix[13]: this.y; }
    get worldZ() { return this._worldMatrix? this._worldMatrix[14]: this.z; }

    get anchorX() { return this.data[SDi.anchorX]; }
    set anchorX(value) { this.matrixDirty = true; this.data[SDi.anchorX] = value; }

    get anchorY() { return this.data[SDi.anchorY]; }
    set anchorY(value) { this.matrixDirty = true; this.data[SDi.anchorY] = value; }

    get anchorZ() { return this.data[SDi.anchorZ]; }
    set anchorZ(value) { this.matrixDirty = true; this.data[SDi.anchorZ] = value; }

    get rotationX()      {  return this.data[SDi.rotationX]; }
    set rotationX(value) { this.matrixDirty = true; this.data[SDi.rotationX] = value; }

    get rotationY()      {  return this.data[SDi.rotationY]; }
    set rotationY(value) { this.matrixDirty = true; this.data[SDi.rotationY] = value; }

    get rotationZ()      { return this.data[SDi.rotationZ]; }
    set rotationZ(value) { this.matrixDirty = true; this.data[SDi.rotationZ] = value; }

    get scaleX()      { return this.data[SDi.scaleX]; }
    set scaleX(value) { this.matrixDirty = true; this.data[SDi.scaleX] = value; }

    get scaleY()      { return this.data[SDi.scaleY]; }
    set scaleY(value) { this.matrixDirty = true; this.data[SDi.scaleY] = value; }

    get scaleZ()      {  return this.data[SDi.scaleZ]; }
    set scaleZ(value) { this.matrixDirty = true; this.data[SDi.scaleZ] = value; }

    set scale(value) { return this.setUniformScale(value); }

    get opacity()      { return this.data[SDi.alphaMultiplier]; }
    set opacity(value) { this.data[SDi.alphaMultiplier] = value; }

    set visible(value) { this.data[SDi.visible] = value? 1: 0; }
    get visible()      { return this.data[SDi.visible] === 1;  }

    get color() { return new LS.Color(this.data[SDi.r], this.data[SDi.g], this.data[SDi.b], this.data[SDi.a]); }
    set color(value) { this.setColor(value); }

    /**
     * Gets the transform matrix.
     * @returns {Float32Array} The transform matrix.
     */
    get transformMatrix() {
        if(!this.matrixDirty) return this._transformMatrix;

        if(!this._transformMatrix) {
            this._transformMatrix = new Float32Array(16);
        }

        this.matrixDirty = false;
        return LS.GL.updateMatrix(this.data, this._transformMatrix, this.width, this.height, this.depth);
    }

    get worldMatrix() {
        if(!this._worldMatrix) {
            this._worldMatrix = new Float32Array(16);
        }
        return this._worldMatrix;
    }

    setPosition(x, y, z) {
        if(Array.isArray(x)) {
            [x, y, z] = x;
        }

        if(typeof x === "number") this.data[SDi.x] = x;
        if(typeof y === "number") this.data[SDi.y] = y;
        if(typeof z === "number") this.data[SDi.z] = z;
        this._updatePosition();
    }

    setOffset(x, y, z) {
        if(Array.isArray(x)) {
            [x, y, z] = x;
        }

        if(typeof x === "number") this.data[SDi.offsetX] = x;
        if(typeof y === "number") this.data[SDi.offsetY] = y;
        if(typeof z === "number") this.data[SDi.offsetZ] = z;
        this._updatePosition();
    }

    _updatePosition(axis) {
        // There is more potential for optimization here, though to keep accuracy of all transform features, either a more complex system needs to be implemented, or we could add flags for this

        this.matrixDirty = true;

        // if(axis !== undefined) {
        //     switch(axis) {
        //         case 0: { if(this.data[SDi.anchorX] === 0) { this._transformMatrix[12] = this.data[SDi.x] + this.data[SDi.offsetX]; return; } break; }
        //         case 1: { if(this.data[SDi.anchorX] === 0) { this._transformMatrix[13] = this.data[SDi.y] + this.data[SDi.offsetY]; return; } break; }
        //         case 2: { if(this.data[SDi.anchorX] === 0) { this._transformMatrix[14] = this.data[SDi.z] + this.data[SDi.offsetZ]; return; } break; }
        //     }

        //     this.matrixDirty = true;
        //     return;
        // }

        // if(this._transformMatrix && this.data[SDi.anchorX] === 0 && this.data[SDi.anchorY] === 0 && this.data[SDi.anchorZ] === 0) {
        //     this._transformMatrix[12] = this.data[SDi.x] + this.data[SDi.offsetX];
        //     this._transformMatrix[13] = this.data[SDi.y] + this.data[SDi.offsetY];
        //     this._transformMatrix[14] = this.data[SDi.z] + this.data[SDi.offsetZ];
        // } else this.matrixDirty = true;
    }

    setSize(width, height, depth) {
        if(Array.isArray(width)) {
            [width, height, depth] = width;
        }

        if(typeof width  === "number") this.data[SDi.width] = width;
        if(typeof height === "number") this.data[SDi.height] = height;
        if(typeof depth  === "number") this.data[SDi.depth] = depth;
        this.matrixDirty = true;
    }

    setScale(x, y, z) {
        if(Array.isArray(x)) {
            [x, y, z] = x;
        }

        if(typeof x === "number") this.data[SDi.scaleX] = x;
        if(typeof y === "number") this.data[SDi.scaleY] = y;
        if(typeof z === "number") this.data[SDi.scaleZ] = z;
        this.matrixDirty = true;
    }

    setUniformScale(value) {
        this.data[SDi.scaleX] = value;
        this.data[SDi.scaleY] = value;
        this.data[SDi.scaleZ] = value;
        this.matrixDirty = true;
    }

    setRotation(x, y, z) {
        if(Array.isArray(x)) {
            [x, y, z] = x;
        }

        if(typeof x === "number") this.data[SDi.rotationX] = x;
        if(typeof y === "number") this.data[SDi.rotationY] = y;
        if(typeof z === "number") this.data[SDi.rotationZ] = z;
        this.matrixDirty = true;
    }

    setAnchor(x, y, z) {
        if(Array.isArray(x)) {
            [x, y, z] = x;
        }

        if(typeof x === "number") this.data[SDi.anchorX] = x;
        if(typeof y === "number") this.data[SDi.anchorY] = y;
        if(typeof z === "number") this.data[SDi.anchorZ] = z;
        this.matrixDirty = true;
    }

    setColor(r, g, b, a) {
        if(typeof r === "string") {
            LS.Color.parse(r, null, null, null, this.data, SDi.r);
            return;
        }

        if(r instanceof LS.Color) {
            this.data[SDi.r] = r.r;
            this.data[SDi.g] = r.g;
            this.data[SDi.b] = r.b;
            this.data[SDi.a] = r.a;
            return;
        }

        if(Array.isArray(r)) {
            [r, g, b, a] = r;
        }

        this.data[SDi.r] = r;
        this.data[SDi.g] = g;
        this.data[SDi.b] = b;
        this.data[SDi.a] = a;
    }

    remove() {
        if(this.parent) {
            this.parent.removeChild(this);
        }
    }

    appendTo(container) {
        if(container.isContainer) {
            container.appendChild(this);
        }
        return this;
    }

    /**
     * Appends the sprite to the lowest container, optionally preserving position.
     */
    appendToRoot(preserveTransform = false) {
        if(preserveTransform) {
            const worldMatrix = this.worldMatrix;
            this.setPosition(worldMatrix[12], worldMatrix[13], worldMatrix[14]);
        }

        let current = this;
        while(current.parent) {
            current = current.parent;
        }

        if(current.isContainer) {
            current.appendChild(this);
        }
        return this;
    }

    /**
     * Destroys the sprite
     * @param {boolean} destroyTexture Whether to destroy the texture as well
     */
    destroy(destroyTexture = false) {
        if(this.destroyed) return;
        this.remove();
        this.data = null;
        this._transformMatrix = null;
        this._worldMatrix     = null;
        this.matrixDirty      = null;

        if(destroyTexture && this.texture && typeof this.texture.destroy === "function") {
            this.texture.destroy();
        }

        this.texture = null;
        this.destroyed = true;
    }
}

/**
 * Abstract container class, or sprite with children support.
 * How it is handled is up to the renderer; not all properties have to be respected.
 */
class Container extends Sprite {
    /**
     * @type {Sprite[]} Children sprites
     */
    children = [];

    /**
     * @type {Container|null} Parent container
     */
    parent = null;

    isContainer = true;

    /**
     * Create a container
     * @param {Sprite[]} children Children sprites
     * @param {SpriteOptions} options Options
     */
    constructor(children = [], options) {
        super(options);
        if(children) this.replaceChildren(children);
    }

    /**
     * Replaces the children of the container
     * @param {Sprite[]} newChildren The new children
     */
    replaceChildren(newChildren) {
        this.children = newChildren;
        for(const child of this.children) {
            if(child.parent === this) continue;
            child.remove();
            child.parent = this;
        }

        // todo: find a better way
        this.matrixDirty = true;
    }

    /**
     * Appends a child to the container
     * @param {Sprite} child The child to append
     */
    appendChild(child) {
        if(child.parent) {
            child.remove();
        }

        this.children.push(child);
        child.parent = this;

        // todo: find a better way
        this.matrixDirty = true;
    }

    /**
     * Removes a child from the container
     * @param {Sprite} child The child to remove
     */
    removeChild(child) {
        if(this.destroyed) return;
        if(child.parent !== this) return;

        const index = this.children.indexOf(child);
        if(index !== -1) {
            this.children.splice(index, 1);
            child.parent = null;
        }

        // todo: find a better way
        this.matrixDirty = true;
    }

    /**
     * Creates a copy of the container
     * @param {Object} options Options for the new container
     * @returns {Container} A new container with the same children
     */
    clone(options = {}, into = new Container()) {
        super.clone(options, into);

        for(const child of this.children) {
            if(child.clone) {
                into.appendChild(child.clone());
            } else {
                into.appendChild(child);
            }
        }

        return into;
    }

    get width() {
        let maxWidth = 0;
        for(const child of this.children) {
            const childRight = child.x + child.width;
            if(childRight > maxWidth) {
                maxWidth = childRight;
            }
        }
        return maxWidth;
    }

    get height() {
        let maxHeight = 0;
        for(const child of this.children) {
            const childBottom = child.y + child.height;
            if(childBottom > maxHeight) {
                maxHeight = childBottom;
            }
        }
        return maxHeight;
    }

    /**
     * Destroys the container
     * @param {boolean} children Whether to destroy the children as well
     */
    destroy(children = true) {
        if(this.destroyed) return;
        if(children) {
            for(const child of this.children) {
                if(child.destroy) child.destroy();
            }
        }

        super.destroy();
        this.children = null;
        this.parent = null;
    }
}

class LayoutContainer extends Container {
    /**
     * LayoutContainer is a Container with layout capabilities.
     * It can automatically arrange its children based on the specified layout options.
     */
    constructor(children = [], options, layoutOptions = {}) {
        super(children, options);
        this.layoutOptions = layoutOptions;
        this.layoutDirty = true;
        
        this.layoutX = this.x;
        this.layoutY = this.y;
    }

    // tood: a clearer system is needed
    layoutX = 0;
    layoutY = 0;

    /**
     * Layout the children of the container
     * @param {Object} layoutOptions Options for the layout (e.g., spacing, padding)
     */
    recompute() {
        let x = 0, y = 0;

        const layoutOptions = this.layoutOptions;
        if(!layoutOptions) return;

        const len = this.children.length;

        let gap = layoutOptions.gap || 0;

        for(let i = 0; i < len; i++) {
            const child = this.children[i];

            child.x = x;
            child.y = y;

            child.layoutX = x;
            child.layoutY = y;

            if(i == len - 1) gap = 0;

            if(layoutOptions.direction === "horizontal") {
                x += child.width  + gap;
            } else {
                y += child.height + gap;
            }
        }

        const width  = this.width;
        const height = this.height;

        // todo:
        const parentWidth  = layoutOptions.parentWidth  || this.parent?.width  || 0;
        const parentHeight = layoutOptions.parentHeight || this.parent?.height || 0;

        const anchor = layoutOptions.anchor || [0, 0];
        this.x = this.layoutX + ((parentWidth  - this.layoutX) * anchor[0]) - ((width  + this.layoutX) * anchor[0]);
        this.y = this.layoutY + ((parentHeight - this.layoutY) * anchor[1]) - ((height + this.layoutY) * anchor[1]);
        this.layoutDirty = false;
    }

    appendChild(child) {
        super.appendChild(child);
        this.layoutDirty = true;
    }

    removeChild(child) {
        super.removeChild(child);
        this.layoutDirty = true;
    }

    replaceChildren(newChildren) {
        super.replaceChildren(newChildren);
        this.layoutDirty = true;
    }

    destroy() {
        super.destroy();
        this.layoutOptions = null;
        this.layoutDirty = false;
    }
}

/**
 * Abstract class for 3D objects, or sprites with geometry support.
 * It is just like a regular sprite but holds geometry data.
 */
class Mesh extends Sprite {
    /**
     * Positions of vectors in 3D space.
     * These are more of an indexed collection for reuse
     * 
     * Eg.
     * (0, 0, 0), (10, 10, 0), (0, 10, 0)
     */
    positions = new Float32Array();

    /**
     * Makes triangles out of positions.
     * It is a list of indices that define the triangles in the geometry.
     * Not sure why this is separated but it is how it is
     * 
     * Eg.
     * (0, 1, 2)
     */
    indices   = new Uint16Array();

    /**
     * Normals are used for lighting calculations, and are usually perpendicular to the surface of the geometry.
     */
    normals   = new Float32Array();

    /**
     * UVs define how a texture maps to geometry, simillarly to a 2D texture region.
     */
    uvs       = new Float32Array();

    /**
     * Creates a new Mesh instance.
     * @param {Array} data - The data for the object.
     * @param {Object} options - The options for the object.
     */
    constructor(data, options) {
        super(options);
    }
}

class MeshBuilder {
    /**
     * A builder for programmatically creating Mesh instances.
     * This should likely not be used in bulids
     * 
     * @example
     * // The following makes a 1x1 cube
     * const builder = new MeshBuilder().box(0, 0, 0, 1, 1, 1);
     * 
     * // Convert to a 3D object
     * const myObject = builder.toObject();
     * 
     * builder.reset();
     * // you can build another object after that
     * builder.destroy();
     */
    constructor() {
        this.cursor    = new Vector(0, 0, 0);
        this.triangles = [];
        this.normals   = [];
        this.uvs       = [];
    }

    beginRecording (name) { return this }
    endRecording   (name) { return this }
    paste          (name) { return this }

    move    (x, y, z) { this.cursor.set(x, y, z); return this }
    vto     (x, y, z) { return this }

    triangle(x1, y1, z1, x2, y2, z2, x3 = this.cursor.x, y3 = this.cursor.y, z3 = this.cursor.z) {
        this.triangles.push([x1, y1, z1, x2, y2, z2, x3, y3, z3]);
        return this;
    }

    plane(x1, y1, z1, x2, y2, z2, x3, y3, z3, x4, y4, z4) {
        this.triangle(x1, y1, z1, x2, y2, z2, x3, y3, z3);
        this.triangle(x3, y3, z3, x4, y4, z4, x1, y1, z1);
        return this;
    }

    planeTo(x, y, z) {
        const x1 = this.cursor.x, y1 = this.cursor.y, z1 = this.cursor.z;
        this.plane(x1, y1, z1, x, y1, z1, x, y, z, x1, y, z);
        return this;
    }

    box(x, y, z, width, height, depth) {
        const x1 = x, y1 = y, z1 = z;
        const x2 = x + width, y2 = y + height, z2 = z + depth;

        // Bottom
        this.plane(x1, y1, z1, x2, y1, z1, x2, y2, z1, x1, y2, z1);
        // Top
        this.plane(x1, y1, z2, x2, y1, z2, x2, y2, z2, x1, y2, z2);
        // Left
        this.plane(x1, y1, z1, x1, y1, z2, x1, y2, z2, x1, y2, z1);
        // Right
        this.plane(x2, y1, z1, x2, y1, z2, x2, y2, z2, x2, y2, z1);
        // Front
        this.plane(x1, y1, z1, x2, y1, z1, x2, y1, z2, x1, y1, z2);
        // Back
        this.plane(x1, y2, z1, x2, y2, z1, x2, y2, z2, x1, y2, z2);

        return this;
    }

    toObject() {
        const positions = [];
        const indices   = [];

        // Yes this is very slow
        for(const triangle of this.triangles) {
            for(const vertex of triangle) {
                const index = positions.indexOf(vertex);
                if(index === -1) {
                    positions.push(vertex);
                    indices.push(positions.length - 1);
                } else {
                    indices.push(index);
                }
            }
        }

        const obj = new Mesh();
        obj.indices   = new Uint16Array (indices);
        obj.positions = new Float32Array(positions);
        obj.normals   = new Float32Array(this.normals);
        obj.uvs       = new Float32Array(this.uvs);
        return obj;
    }

    reset() {
        this.cursor.set(0, 0, 0);
        this.positions.reset();
        this.normals.length = 0;
        this.uvs.length     = 0;
        return this;
    }

    destroy() {
        this.cursor    = null;
        this.positions = null;
        this.normals   = null;
        this.uvs       = null;
    }
}

/**
 * Dynamic vector with arbitrary size and offset, backed by either Array or any TypedArray.
 * Note that this is heavier than a normal { x, y, z } object but allows more efficient browsing of vector arrays.
 */
class Vector {
    data = [0, 0, 0];
    size = 3;
    offset = 0;

    /**
     * Creates a new Vector instance. Number of arguments matters; it can be a 2D vector, 3D vector, etc.
     * @param {number|Array|TypedArray} x x or data - Data array
     * @param {number} y y or offset - Offset into the data array
     * @param {number} z z or size - Size of the vector
     * 
     * @example
     * new Vector(1, 2, 3); // x=1, y=2, z=3
     * 
     * @example
     * new Vector(1, 2); // x=1, y=2
     * 
     * @example
     * new Vector([1, 2, 3, 4, 5], 1, 3); // data=[1, 2, 3, 4, 5], offset=1, size=3 (y=2, z=3, w=4)
     * 
     * @example
     * new Vector(object.positions, 0, 3); // View into the positions array of an Mesh
     */
    constructor(x = 0, y = 0, z = 0) {
        if(Array.isArray(x)) {
            this.data = x;
            this.offset = y;
            this.size = z || 3;
        } else {
            this.size = arguments.length || 3;
            this.data = new Array(this.size);

            for(let i = 0; i < this.size; i++) {
                this.data[i] = arguments[i] || 0;
            }
        }
    }

    get x()      { return this.data[this.offset + 0]  }
    get y()      { return this.data[this.offset + 1]  }
    get z()      { return this.data[this.offset + 2]  }
    get w()      { return this.data[this.offset + 2]  }
    get h()      { return this.data[this.offset + 3]  }
    set x(value) { this.data[this.offset + 0] = value }
    set y(value) { this.data[this.offset + 1] = value }
    set z(value) { this.data[this.offset + 2] = value }
    set w(value) { this.data[this.offset + 2] = value }
    set h(value) { this.data[this.offset + 3] = value }

    set(x, y, z) {
        if(x !== undefined) this.data[this.offset + 0] = x;
        if(y !== undefined) this.data[this.offset + 1] = y;
        if(z !== undefined) this.data[this.offset + 2] = z;
    }

    /**
     * Returns an iterator for the vector's components.
     * @returns {Iterator} An iterator for the vector's components.
     */
    *iterator() {
        for(let i = 0; i < this.size; i++) {
            yield this.data[this.offset + i];
        }
    }

    [Symbol.iterator]() {
        return this.iterator();
    }

    toArray() {
        return this.data.slice(this.offset, this.offset + this.size);
    }

    /**
     * Perform an operation on the vector with either a scalar or another vector.
     * @param {number|Vector} scalarOrVector The scalar or vector to operate with.
     * @param {Function} operation The operation to perform.
     * @returns {Vector} The modified vector.
     */
    op(scalarOrVector, operation = op.add) {
        const offset = this.offset;
        const data   = this.data;

        if(scalarOrVector instanceof Vector) {
            for(let i = 0; i < this.size; i++) {
                const index = offset + i;
                data[index] = operation(data[index], scalarOrVector.data[scalarOrVector.offset + i]);
            }
            return this;
        }

        for(let i = 0; i < this.size; i++) {
            const index = offset + i;
            data[index] = operation(data[index], scalarOrVector);
        }
        return this;
    }

    add(scalarOrVector) {
        return this.op(scalarOrVector, op.add);
    }

    sub(scalarOrVector) {
        return this.op(scalarOrVector, op.sub);
    }

    mul(scalarOrVector) {
        return this.op(scalarOrVector, op.mul);
    }

    div(scalarOrVector) {
        return this.op(scalarOrVector, op.div);
    }

    static fromSize(size) {
        return new Vector(Array(size).fill(0), 0, size);
    }

    clone() {
        const newVector = new Vector(Array(this.size), 0, this.size);

        for(let i = 0; i < this.size; i++) {
            newVector.data[i] = this.data[this.offset + i];
        }

        return newVector;
    }

    compare(otherVector) {
        if(this.size !== otherVector.size) return false;

        for(let i = 0; i < this.size; i++) {
            if(this.data[this.offset + i] !== otherVector.data[otherVector.offset + i]) {
                return false;
            }
        }

        return true;
    }

    /**
     * Return vector as a string if you must (it's slow)
     */
    id()  { return this.data.slice(this.offset, this.offset + this.size).join(",") }


    /**
     * Generate a hash for the vector
     * Faster than id()
     */
    hash() {
        let h = 0;
        for (let i = 0; i < this.size; i++) {
            const n = this.data[this.offset + i] || 0;
            h = Math.imul(h ^ n, 0x45d9f3b);
            h ^= h >>> 16;
        }
        return h >>> 0;
    }

    /**
     * Return vector as a string "x,y,z"
     * Faster than id()
     */
    id3() { return `${this.data[this.offset + 0]},${this.data[this.offset + 1]},${this.data[this.offset + 2]}` }
}

class VectorView extends Vector {
    constructor(data, offset, size) {
        super(data, offset, size);
    }

    get index() {
        return this.offset / this.size;
    }

    at(index = 0) {
        const offset = this.size * index;
        if(offset + this.size > this.data.length) throw new Error("Index out of bounds");
        this.offset = offset;
        return this;
    }

    consolidate() {
        const newData = [];

        const hashes = new Set();

        for(let i = 0; i < this.data.length / this.size; i++) {
            this.at(i);
            const hash = this.hash();

            if(hashes.has(hash)) {
                // Skip duplicates
                continue;
            }

            hashes.add(hash);
            newData.push(...this);
        }

        this.data = newData;
        this.offset = 0;
        return this;
    }

    reset() {
        this.data.length = 0;
        this.offset = 0;
    }
}

/**
 * Scene isolates resources and lifetime to a specific context to help you clean up separated game segments easier.
 * It is basically an optional container for whatever resources you need to manage; not specifically required to be used.
 * 
 * @example
 * class MyScene extends Scene {
 *     constructor() {
 *         super();
 * 
 *         this.container = new Container([]);
 *         this.addDestroyable(this.container);
 *     }
 * 
 *     renderCallback(delta, now) {
 *         something.render(this.container);
 *     }
 * }
 * 
 * const scene = new MyScene();
 * scene.destroy();
 */
class Scene extends LS.Context {
    constructor(parent) {
        super();

        this.parent = parent;

        parent.once("destroy", () => {
            this.destroy();
        });
    }

    onFrame(callback) {
        this.renderCallback = callback;
        return this;
    }

    enable() {
        this.parent.renderer.addRenderable(this);
        return this;
    }

    disable() {
        this.parent.renderer.removeRenderable(this);
        return this;
    }

    assignResource(...resource) {
        for(const res of resource) {
            this.addDestroyable(res);
        }
        return this;
    }

    renderCallback() {}

    destroy() {
        this.disable();
        this.parent = null;
        super.destroy();
    }
}

/**
 * Draws 2D sprites with batching, reducing the number of draw calls when possible. Possible to switch sprite shaders.
 * For best performance, put sprites that share the same texture next to eachother, as every texture switch causes a new draw call and removes the possibilty of reusing buffers.
 * 
 * It is also recommended to reuse the BatchedSpriteRenderer instance when you can, as it is relatively expensive.
 * 
 * Supported sprite properties: x, y, z, xyz rotation, xyz scale, w, h, texture and region and color/transparency
 * 
 * Doesn't render 3D objects
 */
class BatchedSpriteRenderer extends LSGL.Renderable {
    /**
     * @param {LSGL.WebGLRenderer} lsgli The WebGL renderer instance.
     * @param {Object} [param1={}] Options
     * @param {null} [param1.frag=null] Custom fragment shader.
     * @param {null} [param1.vert=null] Custom vertex shader.
     * @param {null} [param1.uniforms=null] Additional custom uniforms.
     * @param {null} [param1.attributes=null] Additional custom attributes.
     * @param {null} [param1.binds=null] Extra custom attribute bindings.
     * @param {number} [param1.batchSize=512] How many slots to pre-allocate. Higher numbers improve performance for large amounts of sprites and allow for better optimization potential (eg. buffer reuse) but increase memory usage (~36 bytes per slot on both CPU and GPU). I recommend setting this to about or slightly above the average amount of sprites you expect to draw. More sprites can be drawn (up to as many as you can fit in one frame), but will cost additional buffer updates and draw calls.
     * 
     * @example
     * const spriteRenderer = new BatchedSpriteRenderer(renderer, { batchSize: 3 });
     * const container = new Container([ sprite1, sprite2, sprite3 ]);
     * 
     * // In your frame callback, or whenever you want to render, call:
     * spriteRenderer.render(container); // container, optional x, y offset and opacity (defaults to the container opacity)
     * 
     * // You can also draw directly without updating buffers if your sprite data didn't change from the
     * // last frame and your sprite count is at or below the batchSize:
     * // This way you can also generate custom data if you wish.
     * spriteRenderer.draw(3, atlasTexture, 0, 3, 1.0); // count, texture, low, high, opacity, x, y
     * // The above will draw whatever container was last stored in the buffers with render()
     * // But will only work if you don't have multiple textures in the batch.
     */
    constructor(lsgli, { frag = null, vert = null, uniforms = null, attributes = null, binds = null, batchSize = 512 } = {}) {
        super({
            version: 0,

            parent: lsgli,

            uniforms:   ["uProjection", "uOffset", "uTexture", "uOpacity",   ...(uniforms || [])  ],
            attributes: ["iSize", "iUVRect", "iColor", "iMatrix", ...(attributes || [])],

            vao: true,
            bind: {
                iUVRect:   { cellSize: 4,  type: "f32",  size: batchSize },
                // iSize:     { cellSize: 2,  type: "f32",  size: batchSize },
                iColor:    { cellSize: 4,  type: "u8",   size: batchSize, normalized: true },
                iMatrix:   { cellSize: 16, type: "mat4", size: batchSize },
                ...binds
            },

            frag: frag || `#version 300 es
precision mediump float;

in vec2 vTexCoord;
in vec4 vColor;

out vec4 fragColor;

uniform sampler2D uTexture;

uniform float uOpacity;

void main() {
    vec4 texColor = texture(uTexture, vTexCoord);
    fragColor = texColor * vColor;
    fragColor.a *= uOpacity;
}`,
            vert: vert || `#version 300 es

${LSGL.utils.quad}

layout(location = 0) in vec4 iUVRect;
layout(location = 1) in vec4 iColor;
// layout(location = 2) in vec2 iSize;
layout(location = 3) in mat4 iMatrix;

uniform mat4 uProjection;
uniform vec2 uOffset;

out  vec2 vTexCoord;
out  vec4 vColor;

void main() {
    vec2 quadCoord = positions[gl_VertexID] * 0.5 + 0.5;

    vec3 p = vec3(quadCoord - uOffset, 0.0);
    gl_Position = uProjection * iMatrix * vec4(p, 1.0);

    vTexCoord = iUVRect.xy + quadCoord * iUVRect.zw;
    vColor = iColor;
}`
        });

        this.maxBatchSize = batchSize;
    }

    /**
     * Update buffer data and render a sprite container.
     * @param {Container} container Container to render
     * @param {*} x Optional x offset override
     * @param {*} y Optional y offset override
     * @param {*} opacity Optional opacity override
     */
    render(container, x = container.data[SDi.x], y = container.data[SDi.y], opacity = container.opacity, _skipSetup = false) {
        if(!container || !container.children || container.children.length === 0 || (opacity !== null && opacity <= 0)) return;

        let low = 0, high = 0, atlas = null;

        const gl = this.renderer.gl;

        const buffers    = this.buffers;
        const colorData  = buffers.iColor.data;
        const uvRectData = buffers.iUVRect.data;
        // const sizeData   = buffers.iSize.data;
        const matrixData = buffers.iMatrix.data;

        // Stack for parent matrices
        const stackM = [container.transformMatrix];

        // Stack for parent indices
        const stackI = [0];

        // Stack for parent containers
        const stackC = [container];
        
        let parentOpacity = opacity;

        let depth = 0;

        while (depth >= 0) {
            const currentContainer = stackC[depth];
            const parentMatrix     = stackM[depth];
            const i                = stackI[depth];
            stackI[depth]++;

            // -- Leave container
            if(i > currentContainer.children.length) {
                if(depth === 0) break;
                depth--;

                parentOpacity /= currentContainer.opacity;
                continue;
            }

            const child = currentContainer.children[i];
            if(!child || !child.visible || child.opacity <= 0) continue;

            // -- Enter container
            if(child.isContainer) {
                if(child.children.length === 0) continue;

                if(child.layoutDirty) {
                    if(typeof child.recompute === "function") {
                        child.recompute();
                    }
                }

                LSGL.multiplyMatrix(
                    parentMatrix,
                    child.transformMatrix,
                    child.worldMatrix
                );

                depth++;
                stackM[depth] = child.worldMatrix;
                stackC[depth] = child;
                stackI[depth] = 0;

                parentOpacity *= child.opacity;
                continue;
            }

            if(!child.texture) continue;

            const data          = child.data;
            const combinedAlpha = data[SDi.a] * data[SDi.alphaMultiplier] * parentOpacity;
            if(combinedAlpha <= 0) continue;

            const texture   = child.texture;
            const uvRect    = texture.region || [0, 0, texture.imageWidth, texture.imageHeight];
            const glTexture = texture.getGLTexture(gl);

            if(atlas && atlas !== glTexture) {
                this.draw(high, atlas, low, high, opacity, x, y, _skipSetup);
                _skipSetup = true;

                high  = 0;
                atlas = null;
            }

            atlas = glTexture;

            /**
             * @type {Float32Array}
             */
            const matrix = matrixData.subarray(high * 16, high * 16 + 16);

            // TODO: we are now doing a lot of the calculation here which eh, it is not ideal

            // Copy the child transform matrix into the buffer
            const uMatrix = child.transformMatrix;

            const sWidth  = child.width;
            const sHeight = child.height;
            const sDepth  = child.depth;

            matrix[0]  = uMatrix[0]  * sWidth;
            matrix[1]  = uMatrix[1]  * sWidth;
            matrix[2]  = uMatrix[2]  * sWidth;
            matrix[3]  = uMatrix[3];
            matrix[4]  = uMatrix[4]  * sHeight;
            matrix[5]  = uMatrix[5]  * sHeight;
            matrix[6]  = uMatrix[6]  * sHeight;
            matrix[7]  = uMatrix[7];
            matrix[8]  = uMatrix[8]  * sDepth;
            matrix[9]  = uMatrix[9]  * sDepth;
            matrix[10] = uMatrix[10] * sDepth;
            matrix[11] = uMatrix[11];

            matrix[12] = uMatrix[12];
            matrix[13] = uMatrix[13];
            matrix[14] = uMatrix[14];
            matrix[15] = uMatrix[15];

            // matrix.set(uMatrix); // <- This is slower by about 2.4x on Chrome. On Firefox it is about the same.

            // Apply parent transformation
            if(parentMatrix) LSGL.multiplyMatrix(parentMatrix, matrix, matrix);

            // sizeData  [high * 2 + 0] = child.width;
            // sizeData  [high * 2 + 1] = child.height;

            colorData [high * 4 + 0] = data[SDi.r];
            colorData [high * 4 + 1] = data[SDi.g];
            colorData [high * 4 + 2] = data[SDi.b];
            colorData [high * 4 + 3] = combinedAlpha;

            uvRectData[high * 4 + 0] = uvRect[0] / texture.imageWidth;
            uvRectData[high * 4 + 1] = uvRect[1] / texture.imageHeight;
            uvRectData[high * 4 + 2] = uvRect[2] / texture.imageWidth;
            uvRectData[high * 4 + 3] = uvRect[3] / texture.imageHeight;

            high++;

            // If we reach the max batch size, draw the current batch and reset for the next one
            if(high > this.maxBatchSize) {
                this.draw(high, atlas, low, high, opacity, x, y, _skipSetup);
                _skipSetup = true;

                high = 0;
                atlas = null;
            }
        }

        if(high > 0) {
            this.draw(high, atlas, low, high, opacity, x, y, _skipSetup);
        }
    }

    draw(count, atlas, low = 0, high = 0, opacity = null, x = null, y = null, _skipSetup = false) {
        if(!atlas || count === 0 || (opacity !== null && opacity <= 0)) return;

        const gl = this.renderer.gl;
        if(!_skipSetup) {
            gl.useProgram(this.program);
            gl.bindVertexArray(this.vao);
        }

        const projectionMatrix = this.renderer.activeCamera.projectionMatrix;
        const uniforms = this.uniforms;
        const buffers = this.buffers;

        // -- Upload changed buffers
        if(high) {
            buffers.iMatrix.updateWithStride (low, high);
            // buffers.iSize.updateWithStride   (low, high);
            buffers.iColor.updateWithStride  (low, high);
            buffers.iUVRect.updateWithStride (low, high);
        }

        // -- Atlas texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, atlas);
        gl.uniform1i(uniforms.uTexture, 0);

        // -- Uniforms
        if(x !== null || y !== null) gl.uniform2f(uniforms.uOffset, x || 0, y || 0);
        gl.uniform1f(uniforms.uOpacity, 1);

        // -- Projection matrix
        gl.uniformMatrix4fv(uniforms.uProjection, false, projectionMatrix);
    
        // -- Draw
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);

        // Todo: sadly, drawArraysInstanced does not support low, meaning the only way would be to rebind the array, which i am yet to test the performance of.
        // This means that we are sadly forced to rebuid nearly every time which limits the optimization potential a lot.
    }
}


/**
 * A basic asset loader.
 */
class AssetLoader extends LS.EventEmitter {
    constructor(options = {}, parent = null, nameScope = null) {
        super();

        this.parent = parent;
        this.nameScope = nameScope;

        this.resources = new Map();
        this.assets = new Map();

        if(options.srcPrefix) {
            this.srcPrefix = options.srcPrefix;
        }

        if(options.map) {
            this.registerMany(options.map);
        }

        if(options.autoLoad) {
            this.loadAll();
        }

        if(this.parent) {
            this.parent.once("destroy", () => this.destroy());
        }

        if(options.logger) {
            this.log = options.logger;
        } else this.log = LS.DEFAULT_LOG_OUTPUT;
    }

    /**
     * Registers an asset.
     * @param {*} assetName The name/identifier of the asset to register.
     * @param {*} data Options for the asset. Can include src (URL/data) along with other metadata and configuration.
     */
    register(assetName, data = {}) {
        if(typeof assetName === "object" && data === undefined) {
            data = assetName;
            assetName = data.name || LS.Util.normalizePath(data.src);
        }

        if(!assetName || typeof assetName !== "string") {
            this.log.error("Asset name must be a non-empty string.");
            return;
        }

        if(this.nameScope) {
            assetName = `${this.nameScope}:${assetName}`;
        }

        if(this.assets.has(assetName)) {
            this.log.warn("Asset already registered:", assetName);
            return;
        }

        if(typeof data === "string") {
            data = { src: data };
        }

        if(this.srcPrefix && data.src) {
            data.src = this.srcPrefix + data.src;
        }

        data.src = LS.Util.normalizePath(data.src);

        data.resource = null;

        data.ref = 0;

        this.assets.set(assetName, data);

        if(data.preload) {
            this.load(assetName);
        }
        return data;
    }

    /**
     * Registers multiple assets at once.
     * @param {Object} assets - An object where keys are asset names and values are options.
     */
    registerMany(assets) {
        for(const [assetName, options] of Object.entries(assets)) {
            this.register(assetName, options);
        }
    }

    unregister(assetName) {
        if(this.nameScope) {
            assetName = `${this.nameScope}:${assetName}`;
        }

        if(!this.assets.has(assetName)) {
            this.log.warn("Asset not registered:", assetName);
            return;
        }

        this.dispose(assetName);
        this.assets.delete(assetName);
    }

    /**
     * Unregisters multiple assets at once.
     * @param {string[]} assetNames - An array of asset names to unregister or null to unregister all.
     */
    unregisterMany(assetNames) {
        for(const assetName of assetNames || this.assets.keys()) {
            this.unregister(assetName);
        }
    }

    async loadResource(src, type) {
        src = LS.Util.normalizePath(src);

        if(typeof type !== "function") {
            const extName = src.split(".").pop()?.toLowerCase();
            type = (type === "image"? GlImage: (type === "sound"? "TODO": null)) || (extName === "png" || extName === "jpg" || extName === "jpeg" || extName === "gif"|| extName === "webp"? GlImage: (extName === "ogg" || extName === "flac" || extName === "mp3" || extName === "wav"? "TODO": null));

            if(typeof type !== "function") {
                throw new Error("Unable to determine resource type for src: " + src);
            }
        }

        if(this.resources.has(src)) {
            return this.resources.get(src);
        }

        const resource = type.fromUrl? await type.fromUrl(src): new type();

        if(!resource) {
            throw new Error("Failed to load resource: " + src);
        }

        this.resources.set(src, resource);
        resource.src = src;
        resource.ref = 0;
        return resource;
    }

    /**
     * Loads an asset. If the asset is already loaded, it will not reload it.
     * @param {*} assetName The name of the asset to load.
     * @returns {Promise<boolean>} Returns true if the asset is playable, false if something went wrong.
     */
    async load(assetName, _fallbackIndex = -1) {
        const asset = this.assets.get(assetName);

        if(!asset) {
            this.log.error("Asset not found:", assetName);
            return false;
        }

        if(this.resources.has(asset.src)) {
            const res = this.resources.get(asset.src);
            if(asset.resource !== res) {
                asset.resource = res;
                res.ref++;
            }
            return true;
        }

        try {
            const src = _fallbackIndex < 0? asset.src: (this.assets.get(asset.fallback[_fallbackIndex])?.src);
            if(!src) throw "No available source";

            asset.resource = this.resources.get(src) || await this.loadResource(src, asset.type);
            if(asset.resource) {
                asset.resource.ref++;
                asset.__lastSrc = src;
                return true;
            }
        } catch (e) {
            if(Array.isArray(asset.fallback) && asset.fallback.length > (_fallbackIndex + 1)) {
                _fallbackIndex ++;
                this.log.error("Failed to load asset:", assetName, ", trying to fallback to next alternative: ", asset.fallback[_fallbackIndex], e);
                return await this.load(assetName, _fallbackIndex);
            }

            asset.__lastSrc = null;
            this.log.error("Failed to load asset:", assetName, e);
        }

        return false;
    }

    /**
     * Loads and gets an asset.
     * @param {string} assetName - The name of the asset to get.
     * @returns {Promise<*>} - The asset, or null if it's not found.
     */
    async get(assetName) {
        const asset = this.assets.get(assetName);

        if(!asset) {
            this.log.error("Asset not found:", assetName);
            return null;
        }

        if(asset.__lastSrc !== asset.src) {
            const loaded = await this.load(assetName);
            if(!loaded) return null;
        }

        return asset;
    }

    /**
     * Disposes of an asset.
     * @param {string} assetName - The name of the asset to dispose of.
     */
    async dispose(assetName) {
        const asset = this.assets.get(assetName);

        if(!asset) {
            this.log.error("Asset not found:", assetName);
            return;
        }

        if(asset.resource) {
            asset.resource.ref--;
            if(asset.resource.ref <= 0) {
                await this.disposeResource(asset.src);
            }
        }

        console.log("Disposing asset:", assetName, "with src:", asset.src);

        asset.__lastSrc = null;
    }

    async disposeResource(src) {
        src = LS.Util.normalizePath(src);

        if(this.resources.has(src)) {
            const resource = this.resources.get(src);
            for(const [assetName, asset] of this.assets.entries()) {
                if(asset.src === src) {
                    asset.resource = null;
                    asset.__lastSrc = null;
                }
            }

            if(resource.ref > 0) {
                this.log.warn("Disposing resource with non-zero reference count:", src, resource.ref);
            }

            if(resource.destroy) resource.destroy();
            this.resources.delete(src);
        }
    }

    async loadAll() {
        const loadPromises = [];
        for(const assetName of this.assets.keys()) {
            loadPromises.push(this.load(assetName));
        }
        await Promise.all(loadPromises);
    }

    destroy() {
        if(this.destroyed) return;
        this.destroyed = true;

        this.emit("destroy");
        this.events.clear();
        this.assets.clear();
        this.assets = null;

        if(this.ctx) {
            this.ctx.close();
            this.ctx = null;
        }
    }
}

/**
 * An Image is a raw image resource, while a Texture is a wrapper around an Image that defines a specific region of the image.
 * A texture thus doesn't necessarily own the image resource itself.
 */
class GlImage {
    /**
     * @type {Image|HTMLCanvasElement}
     */
    image = null;

    textures = new WeakMap();

    constructor(image = null) {
        this.image = image;
    }

    static async fromUrl(src) {
        const glImageI = new GlImage();
        await glImageI.loadFromURL(src);
        return glImageI;
    }

    static fromCanvas(canvas = document.createElement("canvas")) {
        const glImageI = new GlImage();
        glImageI.image = canvas;
        return glImageI;
    }

    static fromImage(image = new Image()) {
        const glImageI = new GlImage();
        glImageI.image = image;
        return glImageI;
    }

    async loadFromURL(src) {
        return await new Promise((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = "anonymous";
            image.onload = () => {
                this.image = image;
                resolve(image);
            };

            image.onerror = (e) => { reject(e) };
            image.src = src;
        });
    }

    updateGLTexture(gl, texture, options = {}) {
        if(!this.image) {
            this.log.error("Empty asset provided for texture creation.");
            return null;
        }

        gl.bindTexture(gl.TEXTURE_2D, texture);

        if(options.region) {
            const [x, y, width, height] = options.region;
            gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, this.image);
        } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.image);
        }

        if(options.nearestFilter || this.pixelated) {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        } else {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        }

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);

        this.textures.set(gl, texture);
        return texture;
    }

    getGLTexture(gl, options = {}) {
        if(this.textures.has(gl)) {
            return this.textures.get(gl);
        }

        const texture = gl.createTexture();
        return this.updateGLTexture(gl, texture, options);
    }

    get width() {
        return this.image ? this.image.width : 0;
    }

    get height() {
        return this.image ? this.image.height : 0;
    }

    unloadImage() {
        if(this.image) {
            this.image.src = "";
            this.image = null;
        }
    }

    destroy() {
        this.unloadImage();
        this.textures = null; // Note that this still keeps the GL textures alive
    }
}

/**
 * A Texture is a wrapper around an Image asset or other source that can be used for surfaces.
 * You can create a Texture from an Image, a Canvas or any Color.
 */
class Texture {
    static WHITE = Texture.fromColor("#fff");

    constructor(asset, region = null) {
        if(!asset || (!(asset.resource instanceof GlImage) && !(asset instanceof LS.Color))) {
            throw new Error("Texture must be created with a valid image asset.");
        }

        this.asset = asset;

        if(this.asset.resource instanceof GlImage) {
            this.asset.ref++;
        }

        this.region = region || [0, 0, asset.resource.width, asset.resource.height];
    }

    get width() {
        return this.region[2];
    }

    get height() {
        return this.region[3];
    }

    get imageWidth() {
        return this.asset?.resource?.width || 0;
    }

    get imageHeight() {
        return this.asset?.resource?.height || 0;
    }

    getGLTexture(gl) {
        if(this.asset instanceof LS.Color) {
            // todo!
            if(this.texture) return this.texture;
            return (this.texture = this.asset.toTexture(gl));
        }

        if(!this.asset || !this.asset.resource) {
            throw new Error("Texture's asset is not loaded or has been destroyed.");
        }

        return this.asset.resource.getGLTexture(gl);
    }

    // Shared canvas would be neat but has an issue as textures sadly can't be shared and have to be made per GL context.

    /**
     * @experimental
     */
    static fromText(text, { font = "serif", color = "white", backgroundColor = null, fontSize = 20 } = {}) {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.width = fontSize * text.length;
        canvas.height = fontSize;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
    
        if(backgroundColor) {
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.fillStyle = color;
        ctx.font = fontSize + "px " + font;
        ctx.fillText(text, 0, fontSize);

        return Texture.fromCanvas(canvas);
    }

    static fromImage(image, region = null) {
        const glImage = GlImage.fromImage(image);
        const asset = { resource: glImage, ref: 1 };
        return new Texture(asset, region);
    }

    static fromCanvas(canvas, region = null) {
        const glImage = GlImage.fromCanvas(canvas);
        const asset = { resource: glImage, ref: 1 };
        return new Texture(asset, region);
    }

    static fromColor(color = "white") {
        return new Texture(new LS.Color(color), [0, 0, 1, 1]);
    }

    static async fromURL(src, region = null) {
        const glImage = await GlImage.fromUrl(src);
        const asset = { resource: glImage, ref: 1 };
        return new Texture(asset, region);
    }

    destroy() {
        if(this.asset instanceof GlImage) {
            this.asset.ref--;
            if(this.asset.ref <= 0) {
                this.asset.resource.destroy();
            }
        }

        this.asset  = null;
        this.region = null;
    }
}

class TextureAtlas {
    regions = {};

    constructor(imageAsset, regions = null) {
        regions ??= imageAsset.atlasData || null;

        if(regions) {
            this.loadFromRegions(imageAsset, regions);
        } else {
            console.warn("No regions provided for TextureAtlas.");
        }

        this.addRegion(imageAsset, "full", [0, 0, imageAsset.resource.width, imageAsset.resource.height]);
    }

    loadFromRegions(atlasImage, regions) {
        if(Array.isArray(regions)) {
            for(const region of regions) {
                this.addRegion(atlasImage, region.name, region.region || region);
            }
        } else if(typeof regions === "object") {
            for(const [name, data] of Object.entries(regions)) {
                this.addRegion(atlasImage, name, data);
            }
        }
    }

    addRegion(atlasImage, name, region) {
        if(typeof region === "object" && !Array.isArray(region) && region !== null) {
            region = [region.x || 0, region.y || 0, region.width || 0, region.height || 0];
        }

        if(!name || !Array.isArray(region) || region.length !== 4) {
            throw new Error("Invalid region format.");
        }

        this.regions[name] = new Texture(atlasImage, region);
    }

    destroy() {
        for(const region of Object.values(this.regions)) {
            region.destroy();
        }
        this.regions = null;
    }

    static from(atlasImage, regions) {
        return new TextureAtlas(atlasImage, regions);
    }

    /**
     * @experimental
     */
    static fromTextList(textMap, { font = "serif", color = "white", fontSize = 16 } = {}) {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.width = 1000;
        canvas.height = 1000;

        const asset = { resource: GlImage.fromCanvas(canvas), ref: 1 };

        let canvasWidth = 0, canvasHeight = 0, textMetrics = [];

        const textEntries = Object.entries(textMap);

        ctx.fillStyle = color;
        ctx.font = fontSize + "px " + font;

        for(const [name, text] of textEntries) {
            const metrics = ctx.measureText(text);
            const h = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;

            textMetrics.push(metrics);

            canvasWidth = Math.max(canvasWidth, metrics.width);
            canvasHeight += h + 2;
        }

        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        // for whatever reason everything resets after resizing
        ctx.fillStyle = color;
        ctx.font = fontSize + "px " + font;

        let yOffset = 0;
        const atlas = new TextureAtlas(asset);

        for(const [name, text] of textEntries) {
            const metrics = textMetrics.shift();
            const h = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent + 2;

            ctx.fillText(text, 0, yOffset + metrics.actualBoundingBoxAscent + 1);
            atlas.addRegion(asset, name, [0, yOffset, metrics.width, h]);

            yOffset += h;
        }

        // document.body.appendChild(canvas);

        return atlas;
    }
}

/**
 * A fast and (very) simple implementation-agnostic parser to parse HTML-like code in just 124 lines.
 * Note that this is very far from a spec-compliant HTML parser and it is only intended to be used if you know that your input is valid.
 * It does not correctly handle malformed HTML.
 * 
 * @param {*} code The code string
 * @param {*} root Optional - The root element
 * @param {Function} factory Optional - The element factory function
 * @experimental
 * @returns Parsed elements or root element
 */
function htmlParser(code, root = null, factory = () => {}) {
    const stack = root? [root]: [], result = root? [root]: [];
    let state = 0, start = 0;

    for(let i = 0; i < code.length; i++) {
        const char = code.charCodeAt(i);

        if(state === 1 || state === 2) {
            if(char === 62) {
                const tagValue = code.substring(start, i).trim();
                const firstSpace = tagValue.indexOf(" ");
                const tag = (firstSpace !== -1? tagValue.substring(0, firstSpace): tagValue).toLowerCase();

                if(state === 2) {
                    const top = stack.at(-1);
                    state = 0;

                    if(top.tag !== tag) {
                        console.warn(`Mismatched closing tag: expected </${top.tag}>, found </${tag}>`);
                        continue;
                    }

                    stack.pop();
                    continue;
                }

                const props = {}; 
                if(firstSpace !== -1) {
                    const parts = tagValue.substring(firstSpace + 1).trim();
                    let state = 0, start = 0, quoteChar = null, lastKey = null;
                    for(let i = 0; i < parts.length; i++) {
                        const char = parts.charCodeAt(i);

                        if(state === 2) {
                            if(char === quoteChar && parts.charCodeAt(i - 1) !== 92) {
                                state = 0;
                                quoteChar = null;

                                if(lastKey) {
                                    const value = parts.substring(start, i);
                                    props[lastKey] = value === "true"? true: value === "false"? false: value;
                                    lastKey = null;
                                }
                                start = i + 1;
                            }
                            continue;
                        }

                        if(state === 1) {
                            if(char === 34 || char === 39) {
                                state = 2;
                                quoteChar = char;
                                start = i + 1;
                                continue;
                            }
                        }

                        const isLast = i === parts.length - 1;
                        if(char === 32 || char === 9 || char === 10 || isLast || char === 61) {
                            const key = isLast || i > start? parts.substring(start, isLast? i + 1: i).trim(): null;
                            if(state === 1) {
                                if(key) {
                                    props[lastKey] = key === "true"? true: key === "false"? false: key;
                                    lastKey = null;
                                    state = 0;
                                    start = i + 1;
                                }
                                continue;
                            }

                            if(key) {
                                props[key] = true;
                                lastKey = key;
                            }

                            start = i + 1;
                        }

                        if(char === 61 && lastKey) {
                            state = 1;
                            continue;
                        }
                    }
                }

                console.log(props);

                const element = factory(tag, props);
                const top = stack.at(-1);
                if(top) top.element.addChild(element); else if (!root) result.push(element);

                if(element.allowChildren) {
                    stack.push({ element, tag });
                }

                start = i + 1;
                state = 0;
            }
            continue;
        }

        if(char === 60) { // <
            const text = i > start? code.substring(start, i).trim(): null;
            if(text) {
                const top = stack.at(-1);
                if(!top && !root) result.push(factory("text", { text })); else if (top) {
                    if(top.element instanceof LS.GL.BlockElement) {
                        top.element.setText(text);
                    } else {
                        top.element.addChild(factory("text", { text }));
                    }
                }
            }

            if(code.charCodeAt(i - 1) === 92) continue;

            state = code.charCodeAt(i + 1) === 47? 2: 1;
            start = i + state;
            if(state === 2) i++;
            continue;
        }
    }

    return root || result;
}

if(true) {
    LS.GL.Sprite = Sprite;
    LS.GL.Mesh = Mesh;
    LS.GL.MeshBuilder = MeshBuilder;
    LS.GL.Vector = Vector;
    LS.GL.VectorView = VectorView;
    LS.GL.Container = Container;
    LS.GL.LayoutContainer = LayoutContainer;
    LS.GL.Scene = Scene;
    LS.GL.SDi = SDi;
    LS.GL.Texture = Texture;
    LS.GL.TextureAtlas = TextureAtlas;
    LS.GL.AssetLoader = AssetLoader;
    LS.GL.GlImage = GlImage;
    LS.GL.htmlParser = htmlParser;
    LS.GL.BatchedSpriteRenderer = BatchedSpriteRenderer;
}

/*@ls-export*/ if(typeof module !== "undefined"){
    module.exports = {
        Sprite,
        Mesh,
        MeshBuilder,
        Vector,
        VectorView,
        Container,
        LayoutContainer,
        Scene,
        Texture,
        TextureAtlas,
        AssetLoader,
        GlImage,
        BatchedSpriteRenderer,
        htmlParser
    };
}

export { Sprite, Mesh, MeshBuilder, Vector, VectorView, Container, LayoutContainer, Scene, Texture, TextureAtlas, AssetLoader, GlImage, BatchedSpriteRenderer, htmlParser };