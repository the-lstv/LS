{
    return(_this)=>class List{
        constructor(id,e,options={data:" .".repeat(20).split(".").filter(e=>e).map((e,i)=>i+1)}){
            this.element=O(e);
            _this=this;
            this.data=options.data;
            this.opt=Object.assign({
                rowHeight: 20,
                height: 200,
                element: {
                    class: "ls-list-row",
                    attr: "chv"
                }
            },options);
            this.elements=[];
            this.element.style.height=this.opt.height+"px";
            let container=N({class:"ls-list-container"}),
                roll=N({class:"ls-list-roller"}),
                fill=N({class:"ls-list-fill"});
            this.view = [];
            this.fill=fill;
            this.roll=roll;
            this.container=container;
            this.updateSize(0);
            this.fixElements();
            this.element.class("ls-list");
            this.roll.add(container)
            this.element.add(fill,roll);
            let prev=0,prevfs=0;

            this.buffer = 0;
            async function handleShift(){
                if(_this.buffer>1)return console.error("BUFFERED");
                if(_this.up){
                    // _this.container.prepend(_this.elements.at(-1));
                    // _this.elements.unshift(_this.elements.pop());
                    // _this.elements[0].innerText=fs;
                    _this.view.unshift(_this.view.pop());
                    _this.view[0]=fs;
                }else{
                    // _this.container.add(_this.elements[0]);
                    // _this.elements.push(_this.elements.shift());
                    // _this.elements.at(-1).innerText=fs+1+_this.visibleElements;
                    _this.view.push(_this.view.shift());
                    _this.view[_this.view.length-1]=fs+3+_this.visibleElements;
                }
                // console.clear()
                // _this.updateContent()
                console.log(_this.view);
                if(_this.buffer>0)_this.buffer--
            }
            this.element.on("scroll",async e=>{
                _this.buffer++
                let fs=Math.floor(_this.element.scrollTop/_this.opt.rowHeight);
                _this.up=_this.element.scrollTop<prev;

                _this.container.style.transform="translateY("+((_this.element.scrollTop)-(_this.element.scrollTop%_this.opt.rowHeight)-(_this.opt.rowHeight*2))+"px)";
                prev=_this.element.scrollTop;

                _this.container.style.overflow=_this.element.scrollTop>=(_this.fullHeight-_this.opt.height)?"hidden":"visible"
                console.log(_this.buffer);
                if(fs!=prevfs)await handleShift();
                prevfs=fs;
            })
            // handleScroll();
            this.update();
        }
        updateContent(){
            for(let i=0;i<this.drawAmount;i++){
                //Update elements:
                
                this.elements[i].innerText=this.data[Math.round(this.element.scrollTop/this.opt.rowHeight)+i-1];
            }
        }
        update(){
            this.updateSize();
            this.updateContent();
        }
        updateSize(updateElements=true){
            this.fullHeight=this.data.length*this.opt.rowHeight;
            this.visibleElements=Math.round(this.opt.height/this.opt.rowHeight);
            this.drawAmount=this.visibleElements+4;
            this.fill.style.height=(this.data.length*this.opt.rowHeight)+"px";
            this.container.style.height=((this.drawAmount-2)*this.opt.rowHeight)+"px"
            if(updateElements)this.fixElements();
        }
        fixElements(){
            if(this.elements.length<this.drawAmount){
                //Add elements if missing:
                let n=this.drawAmount-this.elements.length;
                for(let i=0;i<n;i++){
                    this.elements.push(N({...this.opt.element}));
                    this.view.push(i)
                    this.container.add(this.elements.at(-1))
                    console.log("element added"+i)
                }
            }
            if(this.elements.length>this.drawAmount){
                //Remove elements if there is too much:
                for(let i=0;i<this.elements.length-this.drawAmount;i++){
                    this.elements.pop().remove();
                    console.log("element removed"+i)
                }
            }
        }
    }
}