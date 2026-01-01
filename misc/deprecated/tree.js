{
    return(_this)=>class Tree{
        constructor(id, e, data, options = {}){
            _this = this;
            this.options = Object.assign({
                class:"tree-view"
            },options);
            if(!data&&data!==null){data=e;e=null};
            this.data={};
            this.data_array=[];
            this.element=O(e);
            this.element.class("ls-tree");
            this.element.add(N({class:"ls-tree-container"}))
        }
        getElement(path){
            return O(_this.element.get("[path=\""+path+"\"]")||_this.element.get(".ls-tree-container"))
        }
        addPath(path){
            return Object.assign(LS.Util.objectPath(_this.data,path.replace(/\./g,'__dot__').replace(/\//g,'.')),{
                __items__:[]
            })
        }
        changeTitle(path,title){

        }
        get(path){
            return LS.Util.objectPath(_this.data,path.replace(/\./g,'__dot__').replace(/\//g,'.'))
        }
        expand(path,items,deleteOld=false){
            if(!Array.isArray(items))throw"LSTree: No items array provided for expanding! Use the expand event and return the array trough it.";
            let _path=path.replace(/\/\//g,''),list=[];
            for(const d of items){
                let isExpandable=typeof d!=="object"||d.expandable,
                path=_path+"/"+(d.path||d.inner||d).replace(/\//g,"\\/");
                list.push(path);
                if(_this.element.has("[path=\""+path+"\"]"))continue;
                let o=_this.get(path);
                if(!Array.isArray(o.__items__))o=_this.addPath(path);
                o.__expandable__=isExpandable;
                o.__title__=d.inner||d.path||d;
                o.__path__=path;
                o.__isOpen__=false;

                // console.log(_this.data_array);
                let e=_this.getElement(_path);
                e[e.hasClass("ls-tree-container")?"add":"addAfter"](N("div",{
                    inner:N("span",{inner:o.__title__}),
                    attr:{
                        path:path,
                        tabindex:"0"
                    },
                    style:"--ls-tree-indent:"+(path.split("/").length-1),
                    class:"ls-tree-item"+(isExpandable?" ls-tree-expandable":"")+(d.class?" "+d.class:""),
                    onclick(){_this._interact.call(this,path,isExpandable)},
                    ...(d.element || {})
                }))
            }
            if(deleteOld){
                _this.delete(_this.element.getAll("[path]").filter(e=>!list.includes(e.attr("path"))).map(e=>e.attr("path").slice(1)))
            }
            return !0
        }
        delete(path,items){
            if(Array.isArray(path)){items=path;path=""};
            path=path.replace(/\/\//g,'');
            for(const d of items){
                let e=_this.element.get("[path=\""+path+"/"+d.replace(/\//g,"\\/")+"\"]");
                if(!e)continue;
                e.remove();
            }
        }
        assign(path,items){
            _this.expand(path,items,true)
        }
        remove(path){
            let e=path._affected?path:_this.getElement(path);
        }
        refresh(){

        }
        async _interact(path,isExpandable){
            if(!this._affected)throw"Please do not call this directly!";
            let data=(await _this.invoke("data",path,isExpandable)).flat();
            if(isExpandable){
                let refresh=(await _this.invoke("refresh",path))[0]===true;
                this.class("open",2);
                let isOpen=this.hasClass("open");
                if(this.hasAttribute("explored")){
                    S(_this.element.getAll("[path*=\""+path+"/\"]"),{display:isOpen?"":"none"})
                    _this.get(path).__isOpen__=isOpen;
                    _this.invoke("open",path,isOpen)
                    if(!refresh)return
                }
                this.attrAssign("explored")
                _this.expand(this.attr("path"),data);
            }
        }
    }
}