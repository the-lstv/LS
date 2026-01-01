{
    gl.Group=function(obj){}
    return(_this)=>class Reactor{
        constructor(id){
            _this=this;
            console.warn("LS.NanoReact is currently outdated, thus may break, have performance or functional issues and is subject to a big change in the future")
            this.id=id;
            this.list={};
        }
        apply(s){
            Q(`[ls-react="${_this.id};${s}"]`).all(e=>{
                e.innerText = _this.list[s]
            })
        }
        NewGlobal(name,initial){
            _this.Register(window,name,initial)
        }
        RegisterNew(scope=window,init=null){
            for(const e of Q(`[ls-react^="${_this.id};"]`)){
                let a=(e.attr("ls-react")).split(";").at(-1);
                if(a in _this.list)return;
                _this.Register(scope,a,scope[a]||init)
            }
        }
        RegisterBatch(scope=window,batch,init){
            for(const a of batch){
                if(a in _this.list)return;
                _this.Register(scope,a,scope[a]||init)
            }
        }
        Register(scope,name,initial=null){
            let listName=name;
            _this.list[listName]=initial;
            Object.defineProperty(scope,name,{
                get() {
                    return _this.list[listName];
                },
                set(value) {
                    _this.list[listName] = value;
                    _this.apply(name);
                }
            });
            _this.apply(name);
        }
    }
}