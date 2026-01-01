{
    return(_this)=>class Notif{
        constructor(id,opt={}){
            this.el=N({class:"ls-notif-area",style:`width:${opt.width||300}px`,inner:[N({class:"ls-notif-scroll",inner:N({class:"ls-notif-container"})}),N({class:"ls-notif-hide",inner:"<i class=bi-caret-down-fill></i>",onclick:()=>{_this.el.classList.toggle("hidden")}})]})
            O().add(this.el)
            _this=this;
        }
        push(c){
            return new Promise(r=>{
                if(typeof c=="string")c={content:c};
                c=Object.assign({},c);
                let e=N({class:"ls-notif",inner:[(c.title?N("b",c.title+"<br>"):""),c.content],style:"color:var(--color-bg)",attr:[c.color?"ls-"+c.color:""]});
                _this.el.get(".ls-notif-container").add(e);
                let sc=setInterval(()=>_this.el.get(".ls-notif-scroll").scroll(0,_this.el.get(".ls-notif-scroll").scrollHeight),1);
                setTimeout(()=>{e.classList.add("shown");setTimeout(()=>{clearInterval(sc);r()},200)},10);
            })
        }
        revoke(){

        }
    }
}