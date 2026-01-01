{
    return(_this)=>class FormItems{
        constructor(id,e=O("form"),options={}){
            this.values={};
            this.e=O(e);
            this.opt=Object.assign({qs:"[option],[option-radio]",observe:false,autoUpdate:false},options);
            _this=this;
        }
        _init(){
            _this.update();
            if(_this.opt.observe)E(_this.e,()=>{
                _this.update()
            })
        }
        update(){
            for(const e of _this.e.getAll(_this.opt.qs)){
                if(!e.hasAttr("option-radio")||e._ls_form_checked)continue;
                e._ls_form_checked=!0;
                e.on("click",()=>{
                    let group=e.findParent("group[options]"),name=_this._getName(group),value=_this._getValue(e);
                    group.getAll("[option-radio].selected").forEach(_e=>_e!=e&&_e.class("selected",0))
                    e.class("selected",group.hasAttr("not-optional")?1:2);
                    if(!e.hasClass("selected")){
                        value=null
                    }
                    group[value?"attr":"delAttr"]("ls-form-value",value)
                    if(_this.opt.autoUpdate)_this.get();
                    _this.invoke("change",name,value,"radio",e,group);
                })
            }
        }
        _getName(e){
            return e.attr("option")||e.attr("options")||e.attr("name")||e.attr("id")||e.attr("title")
        }
        _getValue(e){
            return e.value||e.attr("value")||e.attr("option")||e.attr("option-radio")||e.attr("title")
        }
        get(){
            for(const e of _this.e.getAll(_this.opt.qs+",group[options]")){
                if(e.hasAttr("option-radio"))continue;
                _this.values[_this._getName(e)]=e.attr("ls-form-value")||e.value||e.src
            }
            _this.invoke("values_changed",_this.values)
            return _this.values
        }
        reset(){
            _this.values={};
            _this.e.getAll("[option-radio].selected").forEach(d=>d.classList.remove("selected"));
            for(const e of _this.e.getAll(_this.opt.qs+",[default]")){
                O(e);
                if(e.hasAttr("option-radio"))continue;
                if(e.matches("group[options]")){e.attr("ls-form-value",e.attr("default"));continue};
                e[{IMG:"src"}[e.tagName]||"value"]=e.attr("default")
            }
        }
    }
}