{
    return(_this)=>class Chips{
        constructor(id,e=O("chips"),options={}){
            e=O(e);
            this.options=Object.assign({},options)
            if(!e)throw"No element selected/found!";
            _this=this;
            this.e=e;
            this.id=id;
            this.updateChips();
            this.filter();
        }
        updateChips(){
            _this.chips=_this.e.getAll("[ls-chip]");
            _this.chips.forEach(c=>c.onclick=function(){_this.chips.filter(a=>a!=this).forEach(e=>e.removeAttribute("selected"));this.toggleAttribute("selected");_this.filter()})
        }
        getSelected(){
            return _this.chips.filter(e=>typeof e.attr("selected")=="string").map(e=>e.attr("ls-chip"))
        }
        filter(){
            if(_this.getSelected().length<1)this.chips[0].attr("selected","");
            Q("[ls-chip-filter*=\""+_this.id+":\"]").forEach(e=>{
                e.style.display=_this.getSelected().find(s=>e.attr("ls-chip-filter").match(/:(.*)/)[1].split(",").includes(s))?"unset":"none"
            })
        }
    }
}