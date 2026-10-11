/**
 * Extras for LS.GL
 * 
 * @namespace LS.GL
 * @version 2.0.0-alpha.0
 * 
 * ! This is an early stage component.
 */

(() => {
    // Temporary & should be inlined at compile time
    // Sprite data indices
    const SDi = {
        x: 0,
        y: 1,
        z: 2,
        rotationX: 3,
        rotationY: 4,
        rotationZ: 5,
        scaleX: 6,
        scaleY: 7,
        scaleZ: 8,
        anchorX: 9,
        anchorY: 10,
        anchorZ: 11,
        width: 12,
        height: 13,
        depth: 14,
        anchorAffectsPosition: 15,
        visible: 16,
        r: 17,
        g: 18,
        b: 19,
        a: 20,
        alphaMultiplier: 21
    };

    class Sprite {
        /**
         * @type {Texture}
         */
        texture = null;

        /**
         * @type {number[]} data Packed array of x, y, z, rx, ry, rz, sx, sy, sz, anchorX, anchorY, anchorZ, width, height, depth, anchorAffectsPosition, r, g, b, a, alphaMultiplier, visible
         * Its efficient i guess; also could later use typed or subarrays
         */
        data = [
            /*x;0*/                      0,
            /*y;1*/                      0,
            /*z;2*/                      0,
            /*rx;3*/                     0,
            /*ry;4*/                     0,
            /*rz;5*/                     0,
            /*sx;6*/                     1,
            /*sy;7*/                     1,
            /*sz;8*/                     1,
            /*anchorX;9*/                0,
            /*anchorY;10*/               0,
            /*anchorZ;11*/               0,
            /*w;12*/                    -1,
            /*h;13*/                    -1,
            /*d;14*/                     1,
            /*anchorAffectsPosition;15*/ 1,
            /*visible;16*/               1,
            /*r;17*/                     255,
            /*g;18*/                     255,
            /*b;19*/                     255,
            /*a;20*/                     255,
            /*alphaMultiplier;21*/       1.0,
        ];

        /**
         * @type {Float32Array} 4x4 transformation matrix
         */
        _transformMatrix = null;
        matrixDirty = true;

        /**
         * @typedef SpriteOptions
         * @property {Texture} [texture] The texture object to use for the sprite
         * @property {number[]} [position] The position of the sprite [x, y, z]
         * @property {number[]} [size] The size of the sprite [width, height, depth]
         * @property {number[]} [color] The color of the sprite [r, g, b, a]
         * @property {number[]} [rotation] The rotation of the sprite [rx, ry, rz]
         * @property {number[]} [scale] The scale of the sprite [sx, sy, sz]
         * @property {boolean} [visible] Whether the sprite is visible or not
         * @property {number[]} [anchor] The anchor point of the sprite [anchorX, anchorY, anchorZ]
         * @property {number} [x] The x position of the sprite
         * @property {number} [y] The y position of the sprite
         * @property {number} [z] The z position of the sprite
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

        containsPoint(xyz) {
            const [x, y, z] = xyz;

            const w = this.width;
            const h = this.height;
            const d = this.depth;

            const wX = this.worldX;
            const wY = this.worldY;
            const wZ = this.worldZ;

            return x >= wX && x <= wX + w &&
                y >= wY && y <= wY + h &&
                z >= wZ && z <= wZ + d;
        }

        /**
         * Set options for sprite.
         * @param {SpriteOptions} options Options to apply to the sprite
         */
        setOptions(options) {
            if(options.texture)               this.texture = options.texture;

            if(options.position)              this.setPosition(options.position);
            if(options.size)                  this.setSize(options.size);
            if(options.color)                 this.setColor(options.color);
            if(options.rotation)              this.setRotation(options.rotation);
            if(options.scale)                 this.setScale(options.scale);
            if(options.visible !== undefined) this.visible = options.visible? 1: 0;
            if(options.anchor)                this.setAnchor(options.anchor);
            if(options.texture)               this.texture = options.texture;
            if(options.opacity !== undefined) this.opacity = options.opacity;

            if(options.x !== undefined)         this.x = options.x;
            if(options.y !== undefined)         this.y = options.y;
            if(options.z !== undefined)         this.z = options.z;
            if(options.anchorX !== undefined)   this.anchorX = options.anchorX;
            if(options.anchorY !== undefined)   this.anchorY = options.anchorY;
            if(options.anchorZ !== undefined)   this.anchorZ = options.anchorZ;
            if(options.scaleX !== undefined)    this.scaleX = options.scaleX;
            if(options.scaleY !== undefined)    this.scaleY = options.scaleY;
            if(options.scaleZ !== undefined)    this.scaleZ = options.scaleZ;
            if(options.rotationX !== undefined) this.rotationX = options.rotationX;
            if(options.rotationY !== undefined) this.rotationY = options.rotationY;
            if(options.rotationZ !== undefined) this.rotationZ = options.rotationZ;
            if(options.width !== undefined)     this.width  = options.width;
            if(options.height !== undefined)    this.height = options.height;
            if(options.depth !== undefined)     this.depth  = options.depth;
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
        set x(value) { this.data[SDi.x] = value; if(this._transformMatrix && this.data[SDi.anchorX] === 0) { this._transformMatrix[12] = value; } else { this.matrixDirty = true; } }

        get y()      { return this.data[SDi.y]; }
        set y(value) { this.data[SDi.y] = value; if(this._transformMatrix && this.data[SDi.anchorY] === 0) { this._transformMatrix[13] = value; } else { this.matrixDirty = true; } }

        get z()      { return this.data[SDi.z]; }
        set z(value) { this.data[SDi.z] = value; if(this._transformMatrix && this.data[SDi.anchorZ] === 0) { this._transformMatrix[14] = value; } else { this.matrixDirty = true; } }

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

        get opacity()      { return this.data[SDi.alphaMultiplier]; }
        set opacity(value) { this.data[SDi.alphaMultiplier] = value; }

        set visible(value) { this.data[SDi.visible] = value? 1: 0; }
        get visible()      { return this.data[SDi.visible] === 1;  }

        get color() { return new LS.Color(this.data[SDi.r], this.data[SDi.g], this.data[SDi.b], this.data[SDi.a]); }
        set color(value) { this.setColor(value); }

        get transformMatrix() {
            if(!this.matrixDirty) return this._transformMatrix;

            if(!this._transformMatrix) {
                this._transformMatrix = new Float32Array(16);
            }

            console.log("Updating transform matrix for sprite", this);

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

            if(this._transformMatrix && this.data[SDi.anchorX] === 0 && this.data[SDi.anchorY] === 0 && this.data[SDi.anchorZ] === 0) {
                // Setting position is trivial (if we don't need an anchor offset)
                this._transformMatrix[12] = this.data[SDi.x];
                this._transformMatrix[13] = this.data[SDi.y];
                this._transformMatrix[14] = this.data[SDi.z];
            } else this.matrixDirty = true;
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

        /**
         * Destroys the sprite
         * @param {boolean} destroyTexture Whether to destroy the texture as well
         */
        destroy(destroyTexture = false) {
            if(this.destroyed) return;
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

    function op(a, b, op) {
        switch(op) {
            case op.add: return a + b;
            case op.sub: return a - b;
            case op.mul: return a * b;
            case op.div: return a / b;
            default: throw new Error("Invalid operation");
        }
    }

    op.add = 0;
    op.sub = 1;
    op.mul = 2;
    op.div = 3;

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

        get x() { return this.data[this.offset + 0] }
        get y() { return this.data[this.offset + 1] }
        get z() { return this.data[this.offset + 2] }
        get w() { return this.data[this.offset + 2] }
        get h() { return this.data[this.offset + 3] }
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
         * @param {number} operation The operation to perform (0: add, 1: sub, 2: mul, 3: div).
         * @returns {Vector} The modified vector.
         */
        op(scalarOrVector, operation = op.add) {
            const offset = this.offset;
            const data   = this.data;

            if(scalarOrVector instanceof Vector) {
                for(let i = 0; i < this.size; i++) {
                    const index = offset + i;
                    data[index] = op(data[index], scalarOrVector.data[scalarOrVector.offset + i], operation);
                }
                return this;
            }

            for(let i = 0; i < this.size; i++) {
                const index = offset + i;
                data[index] = op(data[index], scalarOrVector, operation);
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

    /**
     * LayoutContainer is just like a Container, but supports processing automatic layout.
     */
    class LayoutContainer extends Container {
        constructor(children = [], options, layoutOptions = {}) {
            super(children, options);
            this.layoutOptions = layoutOptions;
            this.recompute();
        }

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

                if(layoutOptions.direction === "horizontal") {
                    x += child.width  + (i == len - 1? 0: gap);
                } else {
                    y += child.height + (i == len - 1? 0: gap);
                }
            }

            const width  = this.width;
            const height = this.height;

            // todo:
            const parentWidth  = layoutOptions.parentWidth;
            const parentHeight = layoutOptions.parentHeight;

            const anchor = layoutOptions.anchor || [0, 0];
            this.x += ((parentWidth  - this.x) * anchor[0]) - ((width  + this.x) * anchor[0]);
            this.y += ((parentHeight - this.y) * anchor[1]) - ((height + this.y) * anchor[1]);
        }

        appendChild(child) {
            super.appendChild(child);
            this.recompute();
        }

        removeChild(child) {
            super.removeChild(child);
            this.recompute();
        }

        replaceChildren(newChildren) {
            super.replaceChildren(newChildren);
            this.recompute();
        }

        destroy() {
            super.destroy();
            this.layoutOptions = null;
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

    LS.GL.Sprite = Sprite;
    LS.GL.Mesh = Mesh;
    LS.GL.MeshBuilder = MeshBuilder;
    LS.GL.Vector = Vector;
    LS.GL.VectorView = VectorView;
    LS.GL.Container = Container;
    LS.GL.LayoutContainer = LayoutContainer;
    LS.GL.Scene = Scene;
    LS.GL.SDi = SDi;
    LS.GL.htmlParser = htmlParser;

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
            SDi,
            htmlParser
        };
    }
})();