{
    let elementClass = class extends HTMLElement {
        constructor(){
            super();
        }
        connectedCallback(){
            this.ls = LS.Fragment(this.id || M.GlobalID, this)
            this.ls.load()
        }
    }
    customElements.define('ls-fragment', elementClass);

    return _this=>class LS_Fragment{
        constructor(id, element, src){
            _this = this;

            this.element = O(element);
            this.source = src || this.element.attr("src");
        }
        async load(){
            fetch(_this.source)
                .then(response => response.text())
                .then(html => {
                    _this.element.innerHTML = html;
                });
        }
    }
}